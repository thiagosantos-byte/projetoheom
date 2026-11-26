import './env.js';
import http from 'node:http';
import crypto from 'node:crypto';
import { readFile, rename, mkdir, writeFile, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { canTransitionMovement, trackingStatusForObservation } from './domain.js';
import { parseInventoryCsv, findCsvDuplicates, type InventoryCsvRow } from './csv.js';
import { compareDifferenceHash, similarityLabel } from './visual.js';
import { DEMO_PROFILE_DEFINITIONS } from './demo-accounts.js';
import { photoUpload, csvUpload, maxAssetPhotoMb, saveAssetPhoto, readStoredPhoto, deleteStoredPhoto, runLocalOcr, makeQrSvg, type SavedPhoto } from './media.js';

type Role = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'CONSULTA';
type AuthUser = { id: string; name: string; email: string; role: Role };
type DemoUser = AuthUser & { passwordHash: string; active: boolean; createdAt: string; isDemoProfile?: boolean };
type Department = { id: string; code: string; name: string; description: string; dataOrigin: string; active: boolean };
type Room = { id: string; code: string; name: string; departmentId: string; departmentName: string; floorLabel: string; isRestricted: boolean; dataOrigin: string; mapX: number; mapY: number };
type Asset = {
  id: string; assetNumber: string; officialPropertyNumber: string | null; name: string; category: string; description: string | null;
  manufacturer: string | null; model: string | null; serialNumber: string | null; departmentId: string | null; roomId: string | null;
  operationalStatus: string; criticality: string; trackingStatus: string; trackingTagId: string | null; lastDetectedAt: string | null; qrCode?: string;
  dataOrigin: string; archivedAt: string | null; createdAt: string; updatedAt: string;
};
type Movement = {
  id: string; assetId: string; originDepartmentId: string | null; destinationDepartmentId: string; destinationRoomId: string | null;
  requestedBy: string; reason: string; movementType: string; status: string; requestedAt: string; expectedReturnAt: string | null;
  approvedBy: string | null; approvedAt: string | null; completedAt: string | null;
};
type Alert = { id: string; assetId: string | null; alertType: string; severity: string; title: string; description: string; status: string; createdAt: string; acknowledgedBy: string | null; acknowledgedAt: string | null; resolvedBy: string | null; resolvedAt: string | null; resolutionNote: string | null };
type Gateway = { id: string; code: string; name: string; roomId: string | null; status: string; lastSeenAt: string | null; dataOrigin: string };
type LocationEvent = { id: string; eventId: string; assetId: string; source: string; gatewayCode: string; roomId: string | null; rssi: number; detectedAt: string; confidence: string };
type Notification = { id: string; userId: string; title: string; message: string; severity: string; createdAt: string; readAt: string | null };
type AuditRecord = { id: string; userId: string | null; action: string; entityType: string; entityId: string | null; details: unknown; createdAt: string };
type OcrRecord = { id: string; assetId: string; photoId: string; status: string; rawText: string; fields: Record<string, string | null>; confidence: number | null; reviewStatus: string; createdAt: string; reviewedBy?: string | null; reviewedAt?: string | null };
type MaintenanceOrder = { id: string; assetId: string; orderType: string; title: string; description: string; priority: string; status: string; scheduledAt: string | null; dueAt: string | null; responsibleName: string | null; completionNotes: string | null; createdBy: string; createdAt: string; updatedAt: string; completedAt: string | null };
type Store = { users: DemoUser[]; departments: Department[]; rooms: Room[]; assets: Asset[]; movements: Movement[]; alerts: Alert[]; gateways: Gateway[]; locationEvents: LocationEvent[]; notifications: Notification[]; auditLogs: AuditRecord[]; assetPhotos: SavedPhoto[]; ocrResults: OcrRecord[]; maintenanceOrders: MaintenanceOrder[] };

declare global { namespace Express { interface Request { user?: AuthUser } } }

const app = express();
const server = http.createServer(app);
const port = Number(process.env.APP_PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || '';
const demoProfilesEnabled = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEMO_PROFILES !== 'false';
const dataFile = resolve(dirname(fileURLToPath(import.meta.url)), '../data/heom-demo.json');
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
let store: Store = { users: [], departments: [], rooms: [], assets: [], movements: [], alerts: [], gateways: [], locationEvents: [], notifications: [], auditLogs: [], assetPhotos: [], ocrResults: [], maintenanceOrders: [] };
let saveQueue: Promise<void> = Promise.resolve();
let lastPersistError: string | null = null;

function persist(): Promise<void> {
  // Serializa as gravações e captura o snapshot dentro da fila para evitar que
  // uma gravação atrasada sobrescreva um estado mais recente.
  const operation = saveQueue.catch((previousError: unknown) => {
    console.error('[Dados locais] Uma gravação anterior falhou; tentando recuperar a persistência.', previousError);
  }).then(async () => {
    const temporaryFile = `${dataFile}.${process.pid}.${uuid()}.tmp`;
    try {
      await mkdir(dirname(dataFile), { recursive: true });
      await writeFile(temporaryFile, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
      await rename(temporaryFile, dataFile);
      lastPersistError = null;
    } catch (error) {
      lastPersistError = error instanceof Error ? error.message : 'Falha desconhecida ao gravar a base local.';
      await unlink(temporaryFile).catch(() => undefined);
      throw error;
    }
  });
  saveQueue = operation;
  return operation;
}

/** Cria contas de avaliação sem senha conhecida, acessíveis apenas pelo fluxo
 * de entrada rápida do servidor demonstrativo. Nunca é importado pelo servidor institucional. */
async function ensureDemoProfiles(): Promise<boolean> {
  if (!demoProfilesEnabled) return false;
  let changed = false;
  for (const definition of DEMO_PROFILE_DEFINITIONS) {
    const alreadyExists = store.users.some((user) => user.email.toLowerCase() === definition.email);
    if (alreadyExists) continue;
    const oneTimeSecret = crypto.randomBytes(48).toString('base64url');
    store.users.push({
      id: uuid(),
      name: definition.name,
      email: definition.email,
      role: definition.role,
      passwordHash: await bcrypt.hash(oneTimeSecret, 10),
      active: true,
      createdAt: now(),
      isDemoProfile: true
    });
    changed = true;
  }
  return changed;
}

async function createInitialStore(): Promise<Store> {
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || '';
  if (adminPassword.length < 14) throw new Error('Defina INITIAL_ADMIN_PASSWORD com pelo menos 14 caracteres no arquivo .env.');
  const admin: DemoUser = {
    id: uuid(), name: process.env.INITIAL_ADMIN_NAME || 'Administrador de demonstração',
    email: (process.env.INITIAL_ADMIN_EMAIL || 'admin@heom.local').toLowerCase(),
    role: 'ADMIN', passwordHash: await bcrypt.hash(adminPassword, 10), active: true, createdAt: now()
  };
  const departmentNames: Array<[string, string, string]> = [
    ['DEMO-UTI', 'UTI — exemplo demonstrativo', 'Setor fictício para avaliação da plataforma.'],
    ['DEMO-ENG', 'Engenharia Clínica — exemplo', 'Setor fictício para avaliação da plataforma.'],
    ['DEMO-ENF', 'Enfermaria — exemplo demonstrativo', 'Setor fictício para avaliação da plataforma.'],
    ['DEMO-ALM', 'Almoxarifado — exemplo demonstrativo', 'Setor fictício para avaliação da plataforma.']
  ];
  const departments: Department[] = departmentNames.map(([code, name, description]) => ({ id: uuid(), code, name, description, dataOrigin: 'SIMULADO', active: true }));
  const departmentByCode = new Map<string, Department>(departments.map((item) => [item.code, item] as const));
  const roomSeeds = [
    ['DEMO-SALA-UTI', 'Sala demonstrativa UTI', 'DEMO-UTI', true, 22, 30],
    ['DEMO-SALA-ENG', 'Bancada demonstrativa', 'DEMO-ENG', false, 70, 32],
    ['DEMO-SALA-ENF', 'Sala demonstrativa enfermaria', 'DEMO-ENF', false, 70, 72],
    ['DEMO-SALA-ALM', 'Área demonstrativa de guarda', 'DEMO-ALM', false, 22, 72]
  ] as const;
  const rooms: Room[] = roomSeeds.map(([code, name, deptCode, isRestricted, mapX, mapY]) => {
    const department = departmentByCode.get(deptCode)!;
    return { id: uuid(), code, name, departmentId: department.id, departmentName: department.name, floorLabel: 'Pavimento ilustrativo', isRestricted, dataOrigin: 'SIMULADO', mapX, mapY };
  });
  const departmentId = (code: string) => departmentByCode.get(code)!.id;
  const roomId = (code: string) => rooms.find((room) => room.code === code)!.id;
  const assetSeeds = [
    ['SIM-HEOM-001', 'Monitor multiparamétrico demonstrativo', 'Monitorização', 'DEMO-UTI', 'DEMO-SALA-UTI', 'TAG-DEMO-001', 'EM_OPERACAO'],
    ['SIM-HEOM-002', 'Bomba de infusão demonstrativa', 'Infusão', 'DEMO-UTI', 'DEMO-SALA-UTI', 'TAG-DEMO-002', 'EM_OPERACAO'],
    ['SIM-HEOM-003', 'Cadeira de rodas demonstrativa', 'Mobilidade', 'DEMO-ENF', 'DEMO-SALA-ENF', 'TAG-DEMO-003', 'EM_OPERACAO'],
    ['SIM-HEOM-004', 'Analisador demonstrativo', 'Engenharia clínica', 'DEMO-ENG', 'DEMO-SALA-ENG', 'TAG-DEMO-004', 'EM_MANUTENCAO'],
    ['SIM-HEOM-005', 'Ventilador pulmonar demonstrativo', 'Suporte ventilatório', 'DEMO-UTI', 'DEMO-SALA-UTI', 'TAG-DEMO-005', 'EM_OPERACAO']
  ] as const;
  const assets: Asset[] = assetSeeds.map(([assetNumber, name, category, deptCode, roomCode, trackingTagId, operationalStatus]) => ({
    id: uuid(), assetNumber, officialPropertyNumber: null, name, category,
    description: 'Registro fictício para demonstração. Não representa patrimônio oficial do HEOM.',
    manufacturer: null, model: null, serialNumber: null, departmentId: departmentId(deptCode), roomId: roomId(roomCode),
    operationalStatus, criticality: operationalStatus === 'EM_MANUTENCAO' ? 'ALTA' : 'MEDIA', trackingStatus: 'ULTIMA_LOCALIZACAO',
    trackingTagId, lastDetectedAt: null, dataOrigin: 'SIMULADO', archivedAt: null, createdAt: now(), updatedAt: now()
  }));
  for (const asset of assets) asset.qrCode = `HEOM-ASSET:${asset.id}`;
  const gateway: Gateway = { id: uuid(), code: 'DEMO-GW-01', name: 'Gateway demonstrativo 01', roomId: roomId('DEMO-SALA-UTI'), status: 'SEM_COMUNICACAO', lastSeenAt: null, dataOrigin: 'SIMULADO' };
  const firstAsset = assets[0]!;
  const sampleAlert: Alert = {
    id: uuid(), assetId: firstAsset.id, alertType: 'RASTREAMENTO_DEMONSTRATIVO', severity: 'ATENCAO',
    title: 'Ambiente de demonstração preparado', description: 'Os equipamentos e ambientes desta base são fictícios e servem apenas para validar os fluxos do sistema.',
    status: 'ABERTO', createdAt: now(), acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null, resolutionNote: null
  };
  return { users: [admin], departments, rooms, assets, movements: [], alerts: [sampleAlert], gateways: [gateway], locationEvents: [], notifications: [], auditLogs: [], assetPhotos: [], ocrResults: [], maintenanceOrders: [] };
}

async function loadStore() {
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET ausente ou inválido. Execute bash ./scripts/configurar-ambiente.sh.');

  let contents: string;
  try {
    contents = await readFile(dataFile, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new Error(`Não foi possível ler a base demonstrativa (${dataFile}). O arquivo foi preservado; corrija a permissão ou restaure um backup.`, { cause: error });
    }
    store = await createInitialStore();
    await ensureDemoProfiles();
    await persist();
    console.log('[Dados locais] Base demonstrativa criada. Todos os registros estão identificados como SIMULADO.');
    return;
  }

  let parsed: Partial<Store>;
  try {
    parsed = JSON.parse(contents) as Partial<Store>;
  } catch (error) {
    throw new Error(`O arquivo ${dataFile} contém JSON inválido. A base não foi recriada para evitar perda de dados. Restaure um backup ou corrija o arquivo.`, { cause: error });
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.users) || !Array.isArray(parsed.assets)) {
    throw new Error(`O arquivo ${dataFile} não possui a estrutura mínima esperada. A base foi preservada para recuperação manual.`);
  }

  // Compatibilidade com versões anteriores: campos novos podem estar ausentes,
  // mas campos existentes com tipo inválido não devem ser descartados em silêncio.
  const optionalArray = <T>(value: T[] | undefined, field: string): T[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value)) throw new Error(`O campo ${field} da base local não é uma lista. O arquivo foi preservado.`);
    return value;
  };
  store = {
    users: parsed.users,
    departments: optionalArray(parsed.departments, 'departments'),
    rooms: optionalArray(parsed.rooms, 'rooms'),
    assets: parsed.assets,
    movements: optionalArray(parsed.movements, 'movements'),
    alerts: optionalArray(parsed.alerts, 'alerts'),
    gateways: optionalArray(parsed.gateways, 'gateways'),
    locationEvents: optionalArray(parsed.locationEvents, 'locationEvents'),
    notifications: optionalArray(parsed.notifications, 'notifications'),
    auditLogs: optionalArray(parsed.auditLogs, 'auditLogs'),
    assetPhotos: optionalArray(parsed.assetPhotos, 'assetPhotos'),
    ocrResults: optionalArray(parsed.ocrResults, 'ocrResults'),
    maintenanceOrders: optionalArray(parsed.maintenanceOrders, 'maintenanceOrders')
  } as Store;
  for (const asset of store.assets) asset.qrCode ||= `HEOM-ASSET:${asset.id}`;
  const addedDemoProfiles = await ensureDemoProfiles();
  if (addedDemoProfiles) await persist();
  console.log(`[Dados locais] Base carregada de ${dataFile}`);
}

const allowedOrigins = (process.env.WEB_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim());
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use('/api/demo', rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false }));

const wss = new WebSocketServer({ noServer: true });
const authenticatedSockets = new Set<WebSocket>();
server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/ws') return socket.destroy();
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});
function broadcast(type: string, payload: unknown) {
  const message = JSON.stringify({ type, payload, sentAt: now() });
  for (const client of authenticatedSockets) if (client.readyState === WebSocket.OPEN) client.send(message);
}
wss.on('connection', (ws) => {
  let authenticated = false;
  const timeout = setTimeout(() => { if (!authenticated) ws.close(4401, 'Autenticação necessária'); }, 5000);
  ws.on('message', (raw) => {
    if (authenticated) return;
    try {
      const data = JSON.parse(raw.toString()) as { type?: string; token?: string };
      if (data.type !== 'AUTH' || !data.token) return ws.close(4401, 'Credenciais inválidas');
      jwt.verify(data.token, jwtSecret);
      authenticated = true;
      clearTimeout(timeout);
      authenticatedSockets.add(ws);
      ws.send(JSON.stringify({ type: 'AUTHENTICATED', payload: { message: 'Conexão local de demonstração estabelecida.' } }));
    } catch { ws.close(4401, 'Credenciais inválidas'); }
  });
  ws.on('close', () => { clearTimeout(timeout); authenticatedSockets.delete(ws); });
});

function routeId(req: Request): string | null {
  const value = req.params.id;
  return typeof value === 'string' ? value : null;
}
function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sua sessão não foi identificada. Entre novamente.' });
  try {
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;
    const user = store.users.find((item) => item.id === payload.sub && item.active);
    if (!user) return res.status(401).json({ error: 'Usuário da sessão não está ativo.' });
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    return next();
  } catch { return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' }); }
}
function allowRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Seu perfil não possui permissão para esta operação.' });
    return next();
  };
}
async function audit(userId: string | null, action: string, entityType: string, entityId: string | null, details: unknown = {}) {
  store.auditLogs.unshift({ id: uuid(), userId, action, entityType, entityId, details, createdAt: now() });
  await persist();
}
function assetView(asset: Asset) {
  const department = store.departments.find((item) => item.id === asset.departmentId);
  const room = store.rooms.find((item) => item.id === asset.roomId);
  return { ...asset, departmentName: department?.name, roomName: room?.name };
}
function movementView(movement: Movement) {
  const asset = store.assets.find((item) => item.id === movement.assetId);
  const origin = store.departments.find((item) => item.id === movement.originDepartmentId);
  const destination = store.departments.find((item) => item.id === movement.destinationDepartmentId);
  const requester = store.users.find((item) => item.id === movement.requestedBy);
  return { ...movement, assetName: asset?.name || 'Equipamento arquivado', assetNumber: asset?.assetNumber || 'Não informado', originDepartment: origin?.name, destinationDepartment: destination?.name || 'Setor não encontrado', requesterName: requester?.name || 'Usuário não identificado' };
}
function createNotification(userId: string, title: string, message: string, severity = 'INFORMATIVO') {
  store.notifications.unshift({ id: uuid(), userId, title, message, severity, createdAt: now(), readAt: null });
}

app.get('/api/health', (_req, res) => res.json({
  status: lastPersistError ? 'degradado' : 'operacional',
  application: 'HEOM',
  database: 'nao_aplicavel',
  mqtt: 'nao_utilizado',
  tracking: 'simulador_interno',
  mode: 'DEMONSTRACAO_LOCAL_SEM_DOCKER',
  persistence: 'arquivo JSON local',
  persistenceStatus: lastPersistError ? 'falha' : 'operacional',
  persistenceError: lastPersistError,
  message: 'Modo de demonstração local. A persistência utiliza arquivo JSON; PostgreSQL e broker MQTT não são iniciados nem consultados.',
  timestamp: now()
}));

// Estas rotas existem somente no servidor de demonstração local. O servidor
// institucional (server.ts) não importa nem registra entrada rápida de perfis.
app.get('/api/demo/profiles', (_req, res) => {
  if (!demoProfilesEnabled) return res.status(404).json({ error: 'Perfis de demonstração desativados.' });
  const data = DEMO_PROFILE_DEFINITIONS.filter((profile) =>
    store.users.some((user) => user.email === profile.email && user.active && user.isDemoProfile === true)
  ).map(({ email, name, role, description, title }) => ({ email, name, role, description, title }));
  return res.json({ data, mode: 'DEMONSTRACAO_LOCAL' });
});

app.post('/api/demo/quick-login', async (req, res) => {
  if (!demoProfilesEnabled) return res.status(404).json({ error: 'Perfis de demonstração desativados.' });
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Selecione um perfil de demonstração válido.' });
  const user = store.users.find((item) => item.email.toLowerCase() === parsed.data.email.toLowerCase() && item.active && item.isDemoProfile === true);
  if (!user) return res.status(404).json({ error: 'Este perfil de teste não está disponível. Reinicie o modo de demonstração ou consulte o administrador.' });
  await audit(user.id, 'ACESSO_COM_PERFIL_DE_TESTE', 'USER', user.id, { role: user.role, demo: true });
  const token = jwt.sign({ sub: user.id, name: user.name, email: user.email, role: user.role }, jwtSecret, { expiresIn: '8h' });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Informe um e-mail válido e sua senha.' });
  const user = store.users.find((item) => item.email.toLowerCase() === parsed.data.email.toLowerCase() && item.active);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: 'E-mail ou senha não conferem.' });
  await audit(user.id, 'LOGIN_REALIZADO', 'USER', user.id);
  const token = jwt.sign({ sub: user.id, name: user.name, email: user.email, role: user.role }, jwtSecret, { expiresIn: '8h' });
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

app.get('/api/departments', authenticate, (_req, res) => res.json({ data: store.departments.filter((item) => item.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }));
app.get('/api/rooms', authenticate, (_req, res) => res.json({ data: store.rooms.map((room) => ({ ...room, assetCount: store.assets.filter((asset) => asset.roomId === room.id && !asset.archivedAt).length })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }));

app.get('/api/dashboard', authenticate, (_req, res) => {
  const activeAssets = store.assets.filter((asset) => !asset.archivedAt);
  const openAlerts = store.alerts.filter((alert) => alert.status !== 'RESOLVIDO');
  const recentEvents = store.locationEvents.slice().sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).slice(0, 8).map((event) => {
    const asset = store.assets.find((item) => item.id === event.assetId);
    const room = store.rooms.find((item) => item.id === event.roomId);
    const department = store.departments.find((item) => item.id === room?.departmentId);
    return { id: event.id, eventId: event.eventId, source: event.source, detectedAt: event.detectedAt, rssi: event.rssi, assetName: asset?.name || 'Equipamento não identificado', assetNumber: asset?.assetNumber || 'Não informado', roomName: room?.name, departmentName: department?.name };
  });
  const departments = store.departments.filter((item) => item.active).map((department) => {
    const items = activeAssets.filter((asset) => asset.departmentId === department.id);
    return { id: department.id, name: department.name, dataOrigin: department.dataOrigin, assetCount: items.length, operatingCount: items.filter((asset) => asset.operationalStatus === 'EM_OPERACAO').length };
  });
  return res.json({
    metrics: {
      total: activeAssets.length, operating: activeAssets.filter((item) => item.operationalStatus === 'EM_OPERACAO').length,
      unavailable: activeAssets.filter((item) => item.operationalStatus === 'INDISPONIVEL').length,
      maintenance: activeAssets.filter((item) => item.operationalStatus === 'EM_MANUTENCAO').length,
      tracking: activeAssets.filter((item) => ['LOCALIZACAO_CONFIRMADA', 'SETOR_ESTIMADO'].includes(item.trackingStatus)).length,
      simulated: activeAssets.filter((item) => item.dataOrigin === 'SIMULADO').length, open: openAlerts.length,
      critical: openAlerts.filter((item) => item.severity === 'CRITICO').length,
      pending: store.movements.filter((item) => item.status === 'PENDENTE').length
    }, recentEvents, departments, demoMode: true
  });
});

app.get('/api/assets', authenticate, (req, res) => {
  const q = String(req.query.q || '').trim().toLocaleLowerCase('pt-BR');
  const status = String(req.query.status || '');
  const departmentId = String(req.query.departmentId || '');
  const criticality = String(req.query.criticality || '');
  const data = store.assets.filter((asset) => {
    if (asset.archivedAt) return false;
    if (status && asset.operationalStatus !== status) return false;
    if (departmentId && asset.departmentId !== departmentId) return false;
    if (criticality && asset.criticality !== criticality) return false;
    if (!q) return true;
    return [asset.name, asset.assetNumber, asset.officialPropertyNumber, asset.serialNumber,
      asset.manufacturer, asset.model, asset.category, asset.trackingTagId]
      .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(q));
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(assetView);
  return res.json({ data });
});
app.get('/api/assets/:id', authenticate, (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  const asset = store.assets.find((item) => item.id === id && !item.archivedAt);
  if (!asset) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  const history = store.locationEvents.filter((item) => item.assetId === id).slice(0, 20);
  const movementHistory = store.movements.filter((item) => item.assetId === id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const auditHistory = store.auditLogs.filter((item) => item.entityId === id && item.entityType === 'ASSET').slice(0, 50);
  return res.json({ data: assetView(asset), history, movementHistory, auditHistory });
});
const assetSchema = z.object({
  assetNumber: z.string().trim().min(2).max(80), officialPropertyNumber: z.string().trim().max(100).optional().nullable(),
  name: z.string().trim().min(2).max(180), category: z.string().trim().min(2).max(100), description: z.string().max(2000).optional().nullable(),
  manufacturer: z.string().trim().max(140).optional().nullable(), model: z.string().trim().max(140).optional().nullable(), serialNumber: z.string().trim().max(140).optional().nullable(),
  departmentId: z.string().uuid().optional().nullable(), roomId: z.string().uuid().optional().nullable(),
  operationalStatus: z.enum(['EM_OPERACAO', 'INDISPONIVEL', 'EM_MANUTENCAO', 'BAIXADO']).default('EM_OPERACAO'),
  criticality: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'), trackingTagId: z.string().trim().max(140).optional().nullable()
});
function validateAssetReferences(departmentId: string | null | undefined, roomId: string | null | undefined) {
  if (roomId && !departmentId) return 'Selecione o setor antes de vincular um ambiente.';
  if (roomId && !store.rooms.some((room) => room.id === roomId && room.departmentId === departmentId)) return 'O ambiente selecionado não pertence ao setor informado.';
  if (departmentId && !store.departments.some((department) => department.id === departmentId && department.active)) return 'O setor selecionado não foi encontrado.';
  return null;
}
app.post('/api/assets', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const parsed = assetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Revise os campos do equipamento.' });
  const asset = parsed.data;
  const referenceError = validateAssetReferences(asset.departmentId, asset.roomId);
  if (referenceError) return res.status(400).json({ error: referenceError });
  const normalizeIdentity = (value: string | null | undefined) => String(value || '').trim().toLocaleUpperCase('pt-BR');
  const duplicate = store.assets.some((item) => !item.archivedAt && (
    normalizeIdentity(item.assetNumber) === normalizeIdentity(asset.assetNumber) ||
    Boolean(asset.officialPropertyNumber && normalizeIdentity(item.officialPropertyNumber) === normalizeIdentity(asset.officialPropertyNumber)) ||
    Boolean(asset.serialNumber && normalizeIdentity(item.serialNumber) === normalizeIdentity(asset.serialNumber)) ||
    Boolean(asset.trackingTagId && normalizeIdentity(item.trackingTagId) === normalizeIdentity(asset.trackingTagId))
  ));
  if (duplicate) return res.status(409).json({ error: 'Possível duplicidade: patrimônio, número de série, identificação interna ou etiqueta já cadastrados.' });
  const createdId = uuid();
  const created: Asset = { id: createdId, qrCode: `HEOM-ASSET:${createdId}`, ...asset, officialPropertyNumber: asset.officialPropertyNumber || null, description: asset.description || null, manufacturer: asset.manufacturer || null, model: asset.model || null, serialNumber: asset.serialNumber || null, departmentId: asset.departmentId || null, roomId: asset.roomId || null, trackingTagId: asset.trackingTagId || null, trackingStatus: 'RASTREAMENTO_DESATIVADO', lastDetectedAt: null, dataOrigin: 'SIMULADO', archivedAt: null, createdAt: now(), updatedAt: now() };
  store.assets.unshift(created);
  await audit(req.user!.id, 'EQUIPAMENTO_CADASTRADO', 'ASSET', created.id, { assetNumber: created.assetNumber });
  broadcast('asset.created', { id: created.id, assetNumber: created.assetNumber });
  return res.status(201).json({ id: created.id, message: 'Equipamento demonstrativo cadastrado.' });
});
app.put('/api/assets/:id', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  const parsed = assetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Revise os campos do equipamento.' });
  const asset = store.assets.find((item) => item.id === id && !item.archivedAt);
  if (!asset) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  const referenceError = validateAssetReferences(parsed.data.departmentId, parsed.data.roomId);
  if (referenceError) return res.status(400).json({ error: referenceError });
  const normalizeIdentity = (value: string | null | undefined) => String(value || '').trim().toLocaleUpperCase('pt-BR');
  const duplicate = store.assets.some((item) => item.id !== id && !item.archivedAt && (
    normalizeIdentity(item.assetNumber) === normalizeIdentity(parsed.data.assetNumber) ||
    Boolean(parsed.data.officialPropertyNumber && normalizeIdentity(item.officialPropertyNumber) === normalizeIdentity(parsed.data.officialPropertyNumber)) ||
    Boolean(parsed.data.serialNumber && normalizeIdentity(item.serialNumber) === normalizeIdentity(parsed.data.serialNumber)) ||
    Boolean(parsed.data.trackingTagId && normalizeIdentity(item.trackingTagId) === normalizeIdentity(parsed.data.trackingTagId))
  ));
  if (duplicate) return res.status(409).json({ error: 'Possível duplicidade: patrimônio, número de série, identificação interna ou etiqueta já cadastrados.' });
  Object.assign(asset, parsed.data, { updatedAt: now() });
  await audit(req.user!.id, 'EQUIPAMENTO_ATUALIZADO', 'ASSET', id, { assetNumber: asset.assetNumber });
  broadcast('asset.updated', { id });
  return res.json({ message: 'Cadastro demonstrativo atualizado.' });
});
app.post('/api/assets/:id/archive', authenticate, allowRoles('ADMIN', 'GESTOR'), async (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  const asset = store.assets.find((item) => item.id === id && !item.archivedAt);
  if (!asset) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  asset.archivedAt = now(); asset.updatedAt = now();
  await audit(req.user!.id, 'EQUIPAMENTO_ARQUIVADO', 'ASSET', id);
  return res.json({ message: 'Equipamento arquivado. O histórico demonstrativo foi preservado.' });
});

// Identificação fotográfica: arquivos permanecem no armazenamento local do servidor.
app.get('/api/assets/:id/photos', authenticate, (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  if (!store.assets.some((item) => item.id === id)) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  const data = store.assetPhotos.filter((photo) => photo.assetId === id && !photo.archivedAt).map(({ relativePath: _path, dhash: _hash, ...photo }) => ({ ...photo, fileUrl: `/api/assets/${id}/photos/${photo.id}/file` }));
  return res.json({ data });
});
app.post('/api/assets/:id/photos', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), photoUpload.single('photo'), async (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  if (!store.assets.some((item) => item.id === id && !item.archivedAt)) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  if (!req.file) return res.status(400).json({ error: 'Selecione uma fotografia válida.' });
  try {
    const photo = await saveAssetPhoto({ assetId: id, file: req.file, uploadedBy: req.user!.id, imageRole: String(req.body.imageRole || 'EQUIPAMENTO') });
    store.assetPhotos.unshift(photo);
    try { await persist(); }
    catch (error) { store.assetPhotos = store.assetPhotos.filter((item) => item.id !== photo.id); await deleteStoredPhoto(photo.relativePath).catch(() => undefined); throw error; }
    await audit(req.user!.id, 'FOTOGRAFIA_EQUIPAMENTO_ADICIONADA', 'ASSET', id, { photoId: photo.id, imageRole: photo.imageRole });
    broadcast('asset.photo.created', { assetId: id, photoId: photo.id });
    const { relativePath: _path, dhash: _hash, ...safePhoto } = photo;
    return res.status(201).json({ data: { ...safePhoto, fileUrl: `/api/assets/${id}/photos/${photo.id}/file` } });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível armazenar a fotografia.' }); }
});
app.get('/api/assets/:id/photos/:photoId/file', authenticate, async (req, res) => {
  const id = routeId(req); const photoId = typeof req.params.photoId === 'string' ? req.params.photoId : '';
  const photo = store.assetPhotos.find((item) => item.id === photoId && item.assetId === id && !item.archivedAt);
  if (!photo) return res.status(404).json({ error: 'Fotografia não encontrada.' });
  try { const buffer = await readStoredPhoto(photo.relativePath); res.setHeader('Content-Type', photo.mimeType); res.setHeader('Cache-Control', 'private, max-age=300'); return res.send(buffer); }
  catch { return res.status(404).json({ error: 'Arquivo da fotografia não está disponível no armazenamento local.' }); }
});
app.delete('/api/assets/:id/photos/:photoId', authenticate, allowRoles('ADMIN', 'GESTOR'), async (req, res) => {
  const id = routeId(req); const photoId = typeof req.params.photoId === 'string' ? req.params.photoId : '';
  const photo = store.assetPhotos.find((item) => item.id === photoId && item.assetId === id && !item.archivedAt);
  if (!photo) return res.status(404).json({ error: 'Fotografia não encontrada.' });
  photo.archivedAt = now(); await persist(); await audit(req.user!.id, 'FOTOGRAFIA_EQUIPAMENTO_REMOVIDA', 'ASSET', id, { photoId });
  return res.json({ message: 'Fotografia removida. O histórico de auditoria foi preservado.' });
});
app.post('/api/assets/:id/photos/:photoId/ocr', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const id = routeId(req); const photoId = typeof req.params.photoId === 'string' ? req.params.photoId : '';
  const photo = store.assetPhotos.find((item) => item.id === photoId && item.assetId === id && !item.archivedAt);
  if (!photo) return res.status(404).json({ error: 'Fotografia não encontrada.' });
  try {
    const result = await runLocalOcr(photo.relativePath);
    const record: OcrRecord = { id: uuid(), assetId: id!, photoId, status: result.status, rawText: result.rawText, fields: result.fields, confidence: result.confidence, reviewStatus: 'AGUARDANDO_REVISAO', createdAt: now() };
    store.ocrResults.unshift(record); await persist(); await audit(req.user!.id, 'OCR_LOCAL_EXECUTADO', 'ASSET', id, { photoId, status: result.status });
    return res.json({ data: record, message: result.message });
  } catch (error) { return res.status(500).json({ error: error instanceof Error ? error.message : 'Falha no OCR local.' }); }
});
app.get('/api/assets/:id/ocr', authenticate, (req, res) => {
  const id = routeId(req); if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  return res.json({ data: store.ocrResults.filter((item) => item.assetId === id).sort((a,b) => b.createdAt.localeCompare(a.createdAt)) });
});
app.post('/api/assets/:id/ocr/:resultId/confirm', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const id = routeId(req); const resultId = typeof req.params.resultId === 'string' ? req.params.resultId : '';
  const record = store.ocrResults.find((item) => item.id === resultId && item.assetId === id);
  const asset = store.assets.find((item) => item.id === id && !item.archivedAt);
  if (!record || !asset) return res.status(404).json({ error: 'Resultado de leitura ou equipamento não encontrado.' });
  const parsed = z.object({ manufacturer: z.string().trim().max(140).optional().nullable(), model: z.string().trim().max(140).optional().nullable(), serialNumber: z.string().trim().max(140).optional().nullable(), replaceExisting: z.boolean().default(false) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Revise os campos confirmados.' });
  if (parsed.data.replaceExisting && !['ADMIN', 'GESTOR'].includes(req.user!.role)) return res.status(403).json({ error: 'Somente gestor ou administrador pode substituir informação já cadastrada.' });
  if (parsed.data.serialNumber?.trim() && store.assets.some((item) => item.id !== id && !item.archivedAt && item.serialNumber?.toLocaleUpperCase('pt-BR') === parsed.data.serialNumber!.trim().toLocaleUpperCase('pt-BR'))) return res.status(409).json({ error: 'O número de série informado já está vinculado a outro equipamento.' });
  for (const key of ['manufacturer', 'model', 'serialNumber'] as const) {
    const value = parsed.data[key]?.trim();
    if (!value) continue;
    if (asset[key] && asset[key] !== value && !parsed.data.replaceExisting) return res.status(409).json({ error: `O campo ${key} já possui valor confirmado. Um gestor deve autorizar a substituição.` });
    (asset as unknown as Record<string, unknown>)[key] = value;
  }
  asset.updatedAt = now(); record.reviewStatus = 'CONFIRMADO'; record.reviewedBy = req.user!.id; record.reviewedAt = now();
  await persist(); await audit(req.user!.id, 'OCR_DADOS_CONFIRMADOS', 'ASSET', id, { resultId }); broadcast('asset.updated', { id });
  return res.json({ message: 'Dados revisados e confirmados no cadastro do equipamento.', data: assetView(asset) });
});
app.post('/api/assets/search-by-image', authenticate, photoUpload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Selecione uma fotografia para pesquisar.' });
  try {
    const { createDifferenceHash } = await import('./media.js');
    const queryHash = await createDifferenceHash(req.file.buffer);
    const ranked = store.assetPhotos.filter((photo) => !photo.archivedAt).map((photo) => {
      const comparison = compareDifferenceHash(queryHash, photo.dhash);
      const asset = store.assets.find((item) => item.id === photo.assetId && !item.archivedAt);
      return asset ? { photoId: photo.id, assetId: asset.id, assetNumber: asset.assetNumber, name: asset.name, manufacturer: asset.manufacturer, model: asset.model, departmentId: asset.departmentId, similarity: Number(comparison.similarity.toFixed(4)), confidence: similarityLabel(comparison.similarity), fileUrl: `/api/assets/${asset.id}/photos/${photo.id}/file` } : null;
    }).filter((item): item is NonNullable<typeof item> => Boolean(item)).sort((a, b) => b.similarity - a.similarity).slice(0, 10);
    return res.json({ data: ranked, method: 'HASH_VISUAL_DHASH', disclaimer: 'A comparação usa hash visual perceptual e ajuda a localizar fotografias parecidas. Não confirma a identidade do equipamento; valide patrimônio, plaqueta e número de série.' });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível comparar a imagem.' }); }
});
app.get('/api/assets/:id/qr.svg', authenticate, async (req, res) => {
  const id = routeId(req); const asset = store.assets.find((item) => item.id === id && !item.archivedAt);
  if (!asset) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  try { const svg = await makeQrSvg(asset.qrCode || `HEOM-ASSET:${asset.id}`); res.type('image/svg+xml').setHeader('Cache-Control', 'private, max-age=300'); return res.send(svg); }
  catch { return res.status(500).json({ error: 'Não foi possível gerar o QR Code.' }); }
});

// Ordens de serviço e manutenção, com histórico preservado.
app.get('/api/maintenance', authenticate, (req, res) => {
  const status = String(req.query.status || '');
  const data = store.maintenanceOrders.filter((order) => !status || order.status === status).map((order) => ({ ...order, assetName: store.assets.find((asset) => asset.id === order.assetId)?.name, assetNumber: store.assets.find((asset) => asset.id === order.assetId)?.assetNumber })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ data });
});
app.post('/api/maintenance', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const parsed = z.object({ assetId: z.string().uuid(), orderType: z.enum(['PREVENTIVA','CORRETIVA','CALIBRACAO','INSPECAO']), title: z.string().trim().min(3).max(180), description: z.string().trim().min(5).max(3000), priority: z.enum(['BAIXA','MEDIA','ALTA','CRITICA']).default('MEDIA'), scheduledAt: z.string().datetime().optional().nullable(), dueAt: z.string().datetime().optional().nullable(), responsibleName: z.string().trim().max(140).optional().nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Preencha os dados da ordem de serviço.' });
  const asset = store.assets.find((item) => item.id === parsed.data.assetId && !item.archivedAt);
  if (!asset) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  const order: MaintenanceOrder = { id: uuid(), ...parsed.data, scheduledAt: parsed.data.scheduledAt || null, dueAt: parsed.data.dueAt || null, responsibleName: parsed.data.responsibleName || null, status: parsed.data.scheduledAt ? 'PROGRAMADA' : 'ABERTA', completionNotes: null, createdBy: req.user!.id, createdAt: now(), updatedAt: now(), completedAt: null };
  store.maintenanceOrders.unshift(order); if (order.orderType === 'CORRETIVA' && asset.operationalStatus === 'EM_OPERACAO') asset.operationalStatus = 'EM_MANUTENCAO';
  await persist(); await audit(req.user!.id, 'ORDEM_MANUTENCAO_CRIADA', 'MAINTENANCE', order.id, { assetId: asset.id }); broadcast('maintenance.created', { id: order.id, assetId: asset.id });
  return res.status(201).json({ data: order, message: 'Ordem de serviço registrada.' });
});
app.patch('/api/maintenance/:id/status', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const id = routeId(req); const parsed = z.object({ status: z.enum(['EM_ANDAMENTO','AGUARDANDO_PECA','CONCLUIDA','CANCELADA']), completionNotes: z.string().trim().max(3000).optional() }).safeParse(req.body);
  if (!id || !parsed.success) return res.status(400).json({ error: 'Dados de atualização inválidos.' });
  const order = store.maintenanceOrders.find((item) => item.id === id);
  if (!order) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
  order.status = parsed.data.status; order.updatedAt = now(); order.completionNotes = parsed.data.completionNotes || order.completionNotes;
  if (order.status === 'CONCLUIDA') order.completedAt = now();
  if (['CONCLUIDA','CANCELADA'].includes(order.status) && order.orderType === 'CORRETIVA') {
    const otherOpen = store.maintenanceOrders.some((item) => item.assetId === order.assetId && item.id !== id && item.orderType === 'CORRETIVA' && !['CONCLUIDA','CANCELADA'].includes(item.status));
    if (!otherOpen) { const asset = store.assets.find((item) => item.id === order.assetId); if (asset && asset.operationalStatus === 'EM_MANUTENCAO') asset.operationalStatus = 'EM_OPERACAO'; }
  }
  await persist(); await audit(req.user!.id, `ORDEM_MANUTENCAO_${order.status}`, 'MAINTENANCE', id); broadcast('maintenance.updated', { id, status: order.status });
  return res.json({ data: order, message: 'Ordem de serviço atualizada.' });
});
app.get('/api/reports/inventory.csv', authenticate, async (_req, res) => {
  const columns = ['Patrimônio','Nome','Categoria','Fabricante','Modelo','Número de série','Setor','Ambiente','Situação','Criticidade','Origem'];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g,'""')}"`;
  const rows = store.assets.filter((asset) => !asset.archivedAt).map((asset) => [asset.assetNumber,asset.name,asset.category,asset.manufacturer,asset.model,asset.serialNumber,store.departments.find((d)=>d.id===asset.departmentId)?.name,store.rooms.find((r)=>r.id===asset.roomId)?.name,asset.operationalStatus,asset.criticality,asset.dataOrigin]);
  const csv = '\ufeff' + [columns, ...rows].map((row) => row.map(escape).join(';')).join('\r\n');
  res.setHeader('Content-Type','text/csv; charset=utf-8'); res.setHeader('Content-Disposition','attachment; filename="inventario-heom.csv"'); return res.send(csv);
});

app.get('/api/imports/inventory-template.csv', authenticate, (_req, res) => {
  const headers = ['Patrimônio','Nome','Categoria','Fabricante','Modelo','Número de série','Patrimônio oficial','Setor','Ambiente','Situação','Criticidade'];
  const csv = '\ufeff' + headers.map((value) => `"${value.replace(/"/g, '""')}"`).join(';') + '\r\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modelo-importacao-heom.csv"');
  return res.send(csv);
});

app.post('/api/imports/inventory-csv', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), csvUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Selecione um arquivo CSV.' });
  let rows: InventoryCsvRow[];
  try { rows = parseInventoryCsv(req.file.buffer.toString('utf8')); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível interpretar o CSV.' }); }
  const issues: Array<{ row: number; errors: string[] }> = [];
  const duplicateRows = findCsvDuplicates(rows);
  const normalize = (value: string | null | undefined) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
  const imported: Asset[] = [];
  for (const row of rows) {
    const errors = [...row.errors, ...(duplicateRows.get(row.rowNumber) || [])];
    const existing = store.assets.find((asset) => !asset.archivedAt && (
      normalize(asset.assetNumber) === normalize(row.assetNumber) ||
      Boolean(row.officialPropertyNumber && normalize(asset.officialPropertyNumber) === normalize(row.officialPropertyNumber)) ||
      Boolean(row.serialNumber && normalize(asset.serialNumber) === normalize(row.serialNumber))
    ));
    if (existing) errors.push(`Patrimônio, patrimônio oficial ou número de série já existe no inventário (${existing.assetNumber}).`);
    const department = row.department ? store.departments.find((item) => normalize(item.code) === normalize(row.department) || normalize(item.name) === normalize(row.department)) : undefined;
    if (row.department && !department) errors.push(`Setor não encontrado: ${row.department}.`);
    const room = row.room ? store.rooms.find((item) => normalize(item.code) === normalize(row.room) || normalize(item.name) === normalize(row.room)) : undefined;
    if (row.room && !room) errors.push(`Ambiente não encontrado: ${row.room}.`);
    if (room && department && room.departmentId !== department.id) errors.push('O ambiente informado não pertence ao setor selecionado.');
    if (room && !department) errors.push('Informe também o setor do ambiente.');
    if (errors.length) issues.push({ row: row.rowNumber, errors });
    else {
      const id = uuid();
      imported.push({ id, qrCode: `HEOM-ASSET:${id}`, assetNumber: row.assetNumber, officialPropertyNumber: row.officialPropertyNumber, name: row.name, category: row.category, description: 'Importado de CSV no ambiente local de demonstração.', manufacturer: row.manufacturer, model: row.model, serialNumber: row.serialNumber, departmentId: department?.id || null, roomId: room?.id || null, operationalStatus: row.operationalStatus, criticality: row.criticality, trackingStatus: 'RASTREAMENTO_DESATIVADO', trackingTagId: null, lastDetectedAt: null, dataOrigin: 'SIMULADO', archivedAt: null, createdAt: now(), updatedAt: now() });
    }
  }
  if (issues.length) return res.status(422).json({ error: 'A importação não foi aplicada. Corrija as linhas informadas e envie novamente.', data: { totalRows: rows.length, imported: 0, errors: issues } });
  store.assets.unshift(...imported);
  try { await persist(); }
  catch (error) { store.assets = store.assets.filter((asset) => !imported.some((item) => item.id === asset.id)); throw error; }
  await audit(req.user!.id, 'INVENTARIO_IMPORTADO_CSV', 'IMPORT', null, { imported: imported.length, fileName: req.file.originalname });
  broadcast('inventory.imported', { count: imported.length });
  return res.status(201).json({ message: `${imported.length} equipamento(s) importado(s). Os registros permanecem identificados como SIMULADO neste modo.`, data: { totalRows: rows.length, imported: imported.length, errors: [] } });
});

app.get('/api/movements', authenticate, (_req, res) => res.json({ data: store.movements.slice().sort((a, b) => (a.status === 'PENDENTE' ? -1 : 1) - (b.status === 'PENDENTE' ? -1 : 1) || b.requestedAt.localeCompare(a.requestedAt)).map(movementView) }));
app.post('/api/movements', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const parsed = z.object({ assetId: z.string().uuid(), destinationDepartmentId: z.string().uuid(), destinationRoomId: z.string().uuid().optional().nullable(), reason: z.string().trim().min(5).max(1000), movementType: z.enum(['TEMPORARIA', 'PERMANENTE', 'MANUTENCAO', 'EMERGENCIAL']), expectedReturnAt: z.string().datetime().optional().nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Preencha equipamento, destino e justificativa.' });
  const asset = store.assets.find((item) => item.id === parsed.data.assetId && !item.archivedAt);
  if (!asset) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  if (!store.departments.some((item) => item.id === parsed.data.destinationDepartmentId)) return res.status(400).json({ error: 'Setor de destino não encontrado.' });
  if (parsed.data.destinationRoomId && !store.rooms.some((item) => item.id === parsed.data.destinationRoomId && item.departmentId === parsed.data.destinationDepartmentId)) return res.status(400).json({ error: 'O ambiente de destino não pertence ao setor selecionado.' });
  const movement: Movement = { id: uuid(), assetId: asset.id, originDepartmentId: asset.departmentId, destinationDepartmentId: parsed.data.destinationDepartmentId, destinationRoomId: parsed.data.destinationRoomId || null, requestedBy: req.user!.id, reason: parsed.data.reason, movementType: parsed.data.movementType, status: 'PENDENTE', requestedAt: now(), expectedReturnAt: parsed.data.expectedReturnAt || null, approvedBy: null, approvedAt: null, completedAt: null };
  store.movements.unshift(movement);
  await audit(req.user!.id, 'MOVIMENTACAO_SOLICITADA', 'MOVEMENT', movement.id, { assetId: asset.id });
  broadcast('movement.created', { id: movement.id });
  return res.status(201).json({ id: movement.id, message: 'Solicitação demonstrativa registrada e aguardando aprovação.' });
});
app.patch('/api/movements/:id/status', authenticate, allowRoles('ADMIN', 'GESTOR'), async (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  const parsed = z.object({ status: z.enum(['APROVADA', 'REJEITADA', 'CONCLUIDA']), note: z.string().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Situação solicitada inválida.' });
  const movement = store.movements.find((item) => item.id === id);
  if (!movement) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  if (!canTransitionMovement(movement.status, parsed.data.status)) return res.status(409).json({ error: 'Essa transição não é permitida para a situação atual.' });
  movement.status = parsed.data.status;
  if (['APROVADA', 'REJEITADA'].includes(parsed.data.status)) { movement.approvedBy = req.user!.id; movement.approvedAt = now(); }
  if (parsed.data.status === 'CONCLUIDA') {
    movement.completedAt = now();
    const asset = store.assets.find((item) => item.id === movement.assetId);
    if (asset) { asset.departmentId = movement.destinationDepartmentId; asset.roomId = movement.destinationRoomId; asset.updatedAt = now(); }
  }
  await audit(req.user!.id, `MOVIMENTACAO_${parsed.data.status}`, 'MOVEMENT', id, { note: parsed.data.note || null });
  broadcast('movement.updated', { id, status: movement.status });
  return res.json({ message: `Movimentação ${movement.status.toLowerCase()} com sucesso.` });
});

app.get('/api/alerts', authenticate, (req, res) => {
  const status = String(req.query.status || '');
  const data = store.alerts.filter((item) => !status || item.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((alert) => {
    const asset = store.assets.find((item) => item.id === alert.assetId);
    return { ...alert, assetName: asset?.name, assetNumber: asset?.assetNumber };
  });
  return res.json({ data });
});
app.patch('/api/alerts/:id/status', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  const parsed = z.object({ status: z.enum(['RECONHECIDO', 'RESOLVIDO']), note: z.string().trim().max(1000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Situação inválida.' });
  const alert = store.alerts.find((item) => item.id === id && item.status !== 'RESOLVIDO');
  if (!alert) return res.status(404).json({ error: 'Alerta não encontrado ou já resolvido.' });
  if (parsed.data.status === 'RECONHECIDO') { alert.status = 'RECONHECIDO'; alert.acknowledgedBy = req.user!.id; alert.acknowledgedAt = now(); }
  else { alert.status = 'RESOLVIDO'; alert.resolvedBy = req.user!.id; alert.resolvedAt = now(); alert.resolutionNote = parsed.data.note || null; }
  await audit(req.user!.id, `ALERTA_${parsed.data.status}`, 'ALERT', id, { note: parsed.data.note || null });
  broadcast('alert.updated', { id, status: alert.status });
  return res.json({ message: 'Alerta atualizado.' });
});

app.get('/api/floor-plan', authenticate, (_req, res) => res.json({ data: store.rooms.map((room) => ({ id: room.id, code: room.code, name: room.name, floorLabel: room.floorLabel, isRestricted: room.isRestricted, x: room.mapX, y: room.mapY, departmentName: room.departmentName, dataOrigin: room.dataOrigin, assetCount: store.assets.filter((asset) => asset.roomId === room.id && !asset.archivedAt).length })), planStatus: 'PLANTA_ILUSTRATIVA_AGUARDANDO_VALIDACAO', message: 'Esquema demonstrativo. Substitua pela planta arquitetônica oficial aprovada pela instituição.' }));
app.get('/api/gateways', authenticate, allowRoles('ADMIN', 'GESTOR'), (_req, res) => res.json({ data: store.gateways.map((gateway) => ({ ...gateway, roomName: store.rooms.find((room) => room.id === gateway.roomId)?.name })), mqttConnected: false, simulatorAvailable: true }));

app.post('/api/simulator/observation', authenticate, allowRoles('ADMIN', 'GESTOR'), async (req, res) => {
  const parsed = z.object({ tagId: z.string().min(2).max(140), gatewayCode: z.string().min(2).max(80), rssi: z.number().int().min(-120).max(0).default(-65) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Etiqueta ou gateway inválido.' });
  const gateway = store.gateways.find((item) => item.code === parsed.data.gatewayCode);
  const asset = store.assets.find((item) => item.trackingTagId === parsed.data.tagId && !item.archivedAt);
  if (!gateway || !asset) return res.status(404).json({ error: 'Etiqueta ou gateway demonstrativo não encontrado.' });
  const detectedAt = now();
  const room = store.rooms.find((item) => item.id === gateway.roomId);
  const eventId = uuid();
  const locationEvent: LocationEvent = { id: uuid(), eventId, assetId: asset.id, source: 'SIMULATED', gatewayCode: gateway.code, roomId: gateway.roomId, rssi: parsed.data.rssi, detectedAt, confidence: room ? 'SETOR_ESTIMADO' : 'ULTIMA_LOCALIZACAO' };
  store.locationEvents.unshift(locationEvent);
  asset.trackingStatus = trackingStatusForObservation(Boolean(room));
  asset.lastDetectedAt = detectedAt;
  asset.updatedAt = detectedAt;
  gateway.status = 'ONLINE'; gateway.lastSeenAt = detectedAt;
  if (room && asset.departmentId !== room.departmentId) {
    const existing = store.alerts.find((item) => item.assetId === asset.id && item.alertType === 'MOVIMENTACAO_FORA_DO_SETOR' && item.status !== 'RESOLVIDO');
    if (!existing) {
      const alert: Alert = { id: uuid(), assetId: asset.id, alertType: 'MOVIMENTACAO_FORA_DO_SETOR', severity: 'ALTO', title: 'Equipamento detectado fora do setor de referência', description: `${asset.name} foi detectado em ${room.name}. A ocorrência precisa de verificação e não representa, por si só, evidência de irregularidade.`, status: 'ABERTO', createdAt: detectedAt, acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null, resolutionNote: null };
      store.alerts.unshift(alert);
      for (const user of store.users.filter((item) => item.active && ['ADMIN', 'GESTOR'].includes(item.role))) createNotification(user.id, alert.title, alert.description, 'ALTO');
    }
  }
  await audit(req.user!.id, 'EVENTO_RASTREAMENTO_SIMULADO', 'TRACKING_EVENT', eventId, { tagId: asset.trackingTagId, gatewayCode: gateway.code, rssi: parsed.data.rssi });
  broadcast('tracking.observation', { eventId, assetId: asset.id, roomId: gateway.roomId, source: 'SIMULATED' });
  return res.status(202).json({ message: 'Detecção simulada processada pelo serviço local de demonstração, sem MQTT ou hardware físico.', eventId });
});

app.get('/api/notifications', authenticate, (req, res) => res.json({
  data: store.notifications.filter((item) => item.userId === req.user!.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50)
}));
app.post('/api/notifications/:id/read', authenticate, async (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  const notification = store.notifications.find((item) => item.id === id && item.userId === req.user!.id);
  if (!notification) return res.status(404).json({ error: 'Notificação não encontrada para este usuário.' });
  if (!notification.readAt) notification.readAt = now();
  await audit(req.user!.id, 'NOTIFICACAO_MARCADA_COMO_LIDA', 'NOTIFICATION', id);
  return res.json({ message: 'Notificação marcada como lida.', data: { id: notification.id, readAt: notification.readAt } });
});
app.get('/api/admin/users', authenticate, allowRoles('ADMIN'), (_req, res) => res.json({ data: store.users.map(({ passwordHash: _passwordHash, ...user }) => user).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }));
app.post('/api/admin/users', authenticate, allowRoles('ADMIN'), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(3).max(140), email: z.string().email(), password: z.string().min(12).max(128), role: z.enum(['ADMIN', 'GESTOR', 'OPERADOR', 'CONSULTA']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Revise nome, e-mail, perfil e senha (mínimo de 12 caracteres).' });
  if (store.users.some((item) => item.email.toLowerCase() === parsed.data.email.toLowerCase())) return res.status(409).json({ error: 'Já existe um usuário com esse e-mail.' });
  const user: DemoUser = { id: uuid(), name: parsed.data.name, email: parsed.data.email.toLowerCase(), passwordHash: await bcrypt.hash(parsed.data.password, 10), role: parsed.data.role, active: true, createdAt: now() };
  store.users.push(user);
  await audit(req.user!.id, 'USUARIO_CADASTRADO', 'USER', user.id, { role: user.role });
  return res.status(201).json({ data: { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active } });
});

await loadStore();
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Falha inesperada na requisição.';
  if (message.includes('Formato inválido') || message.includes('File too large') || message.includes('Unexpected field') || message.includes('Too many files')) return res.status(400).json({ error: message.includes('File too large') ? `A imagem excede o limite de ${maxAssetPhotoMb} MB.` : message });
  console.error('[API local]', error); return res.status(500).json({ error: 'Não foi possível concluir a operação local.' });
});

server.listen(port, process.env.DEMO_BIND_HOST || '127.0.0.1', () => {
  console.log('');
  console.log('HEOM — MODO DE DEMONSTRAÇÃO LOCAL (SEM DOCKER)');
  console.log(`API: http://localhost:${port}/api/health`);
  console.log(`Perfis de teste: ${demoProfilesEnabled ? 'habilitados apenas neste modo demonstrativo local' : 'desativados'}`);
  console.log('Persistência: arquivo JSON local, com gravação em disco.');
  console.log('Rastreamento: simulador interno; sem PostgreSQL, MQTT ou hardware real.');
  console.log('');
});

function shutdown() {
  console.log('\nEncerrando HEOM local...');
  for (const socket of authenticatedSockets) socket.close(1001, 'Servidor encerrado');
  wss.close();
  server.close(() => process.exit(0));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
