import QRCode from 'qrcode';
import { validateAssetDraft } from './asset-validation';
import { validateImageSignature } from './image-validation';

type Role = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'CONSULTA';
type DemoUser = { id: string; name: string; role: Role };
type DemoState = {
  version: number;
  departments: any[];
  rooms: any[];
  assets: any[];
  movements: any[];
  alerts: any[];
  gateways: any[];
  locationEvents: any[];
  notifications: any[];
  maintenanceOrders: any[];
  auditLogs: any[];
  photoMeta: any[];
};

const STORAGE_KEY = 'heom.demo.data.v1';
const ROLE_KEY = 'heom.demo.role';
const PHOTO_DB = 'heom-demo-media';
const PHOTO_STORE = 'photos';
const roleInfo: Record<Role, { name: string; title: string; description: string }> = {
  ADMIN: { name: 'Administrador de demonstração', title: 'Administração completa', description: 'Acesso administrativo e visão geral dos módulos.' },
  GESTOR: { name: 'Gestor patrimonial', title: 'Gestão e aprovações', description: 'Acompanha indicadores, aprova movimentações e gerencia a operação.' },
  OPERADOR: { name: 'Operador de inventário', title: 'Rotina operacional', description: 'Registra e atualiza equipamentos e atividades operacionais.' },
  CONSULTA: { name: 'Perfil de consulta', title: 'Somente leitura', description: 'Consulta inventário, indicadores e histórico sem realizar alterações.' }
};
const roles: Role[] = ['ADMIN', 'GESTOR', 'OPERADOR', 'CONSULTA'];
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const stableId = (key: string) => `demo-${key}`;
export function getDemoRole(): Role | null {
  const role = localStorage.getItem(ROLE_KEY) as Role | null;
  return role && roles.includes(role) ? role : null;
}
const currentRole = (): Role => getDemoRole() || 'ADMIN';
export function setDemoRole(role: Role): void {
  if (!roles.includes(role)) throw new Error('Perfil demonstrativo inválido.');
  localStorage.setItem(ROLE_KEY, role);
}
export function createDemoUser(role: Role): DemoUser {
  return { id: stableId(role.toLowerCase()), name: roleInfo[role].name, role };
}

function seedState(): DemoState {
  const departments = [
    { id: stableId('dep-uti'), code: 'DEMO-UTI', name: 'UTI — setor demonstrativo', description: 'Setor fictício para avaliação.', dataOrigin: 'SIMULADO', active: true },
    { id: stableId('dep-eng'), code: 'DEMO-ENG', name: 'Engenharia Clínica — demonstração', description: 'Setor fictício para avaliação.', dataOrigin: 'SIMULADO', active: true },
    { id: stableId('dep-enf'), code: 'DEMO-ENF', name: 'Enfermaria — setor demonstrativo', description: 'Setor fictício para avaliação.', dataOrigin: 'SIMULADO', active: true },
    { id: stableId('dep-alm'), code: 'DEMO-ALM', name: 'Almoxarifado — demonstração', description: 'Setor fictício para avaliação.', dataOrigin: 'SIMULADO', active: true }
  ];
  const rooms = [
    { id: stableId('room-uti'), code: 'DEMO-SALA-UTI', name: 'Sala demonstrativa UTI', departmentId: departments[0].id, departmentName: departments[0].name, floorLabel: 'Pavimento ilustrativo', isRestricted: true, dataOrigin: 'SIMULADO', mapX: 22, mapY: 30 },
    { id: stableId('room-eng'), code: 'DEMO-SALA-ENG', name: 'Bancada de engenharia clínica', departmentId: departments[1].id, departmentName: departments[1].name, floorLabel: 'Pavimento ilustrativo', isRestricted: false, dataOrigin: 'SIMULADO', mapX: 70, mapY: 32 },
    { id: stableId('room-enf'), code: 'DEMO-SALA-ENF', name: 'Sala demonstrativa enfermaria', departmentId: departments[2].id, departmentName: departments[2].name, floorLabel: 'Pavimento ilustrativo', isRestricted: false, dataOrigin: 'SIMULADO', mapX: 70, mapY: 72 },
    { id: stableId('room-alm'), code: 'DEMO-SALA-ALM', name: 'Área demonstrativa de guarda', departmentId: departments[3].id, departmentName: departments[3].name, floorLabel: 'Pavimento ilustrativo', isRestricted: false, dataOrigin: 'SIMULADO', mapX: 22, mapY: 72 }
  ];
  const assetSeeds = [
    ['SIM-HEOM-001', 'Monitor multiparamétrico', 'Monitorização', 'Mindray (fictício)', 'uMEC 12', 'SN-DEMO-001', 0, 0, 'EM_OPERACAO', 'ALTA'],
    ['SIM-HEOM-002', 'Bomba de infusão', 'Infusão', 'B. Braun (fictício)', 'Infusomat Space', 'SN-DEMO-002', 0, 0, 'EM_OPERACAO', 'ALTA'],
    ['SIM-HEOM-003', 'Cadeira de rodas', 'Mobilidade', 'Freedom (fictício)', 'Start M1', 'SN-DEMO-003', 2, 2, 'EM_OPERACAO', 'MEDIA'],
    ['SIM-HEOM-004', 'Analisador clínico', 'Laboratório', 'BioSystems (fictício)', 'A15', 'SN-DEMO-004', 1, 1, 'EM_MANUTENCAO', 'ALTA'],
    ['SIM-HEOM-005', 'Ventilador pulmonar', 'Suporte ventilatório', 'Dräger (fictício)', 'Savina 300', 'SN-DEMO-005', 0, 0, 'EM_OPERACAO', 'CRITICA'],
    ['SIM-HEOM-006', 'Oxímetro de pulso', 'Monitorização', 'G-Tech (fictício)', 'OLED Graph', 'SN-DEMO-006', 2, 2, 'INDISPONIVEL', 'MEDIA'],
    ['SIM-HEOM-007', 'Desfibrilador', 'Emergência', 'Instramed (fictício)', 'Cardiomax', 'SN-DEMO-007', 0, 0, 'EM_OPERACAO', 'CRITICA']
  ] as const;
  const assets = assetSeeds.map((item, index) => ({
    id: stableId(`asset-${item[0].toLowerCase()}`), assetNumber: item[0], officialPropertyNumber: `PATR-DEMO-${String(index + 1).padStart(4, '0')}`,
    name: item[1], category: item[2], description: 'Registro totalmente fictício, criado exclusivamente para demonstração do HEOM.',
    manufacturer: item[3], model: item[4], serialNumber: item[5], departmentId: departments[item[6]].id, roomId: rooms[item[7]].id,
    operationalStatus: item[8], criticality: item[9], trackingStatus: 'ULTIMA_LOCALIZACAO', trackingTagId: `TAG-DEMO-${String(index + 1).padStart(3, '0')}`,
    lastDetectedAt: null, dataOrigin: 'SIMULADO', archivedAt: null, createdAt: now(), updatedAt: now(), qrCode: `HEOM-ASSET:${stableId(`asset-${item[0].toLowerCase()}`)}`
  }));
  const date = new Date();
  const inDays = (days: number) => new Date(date.getTime() + days * 86400000).toISOString();
  const maintenanceOrders = [
    { id: id(), assetId: assets[3].id, orderType: 'CORRETIVA', title: 'Inspeção do conjunto de alimentação', description: 'Verificação demonstrativa do sistema de alimentação e conexões.', priority: 'ALTA', status: 'EM_ANDAMENTO', scheduledAt: inDays(-1), dueAt: inDays(2), responsibleName: 'Equipe técnica demonstrativa', completionNotes: null, createdBy: stableId('gestor'), createdAt: inDays(-2), updatedAt: now(), completedAt: null },
    { id: id(), assetId: assets[4].id, orderType: 'PREVENTIVA', title: 'Revisão preventiva programada', description: 'Rotina fictícia de inspeção visual e conferência de acessórios.', priority: 'MEDIA', status: 'PROGRAMADA', scheduledAt: inDays(4), dueAt: inDays(7), responsibleName: 'Equipe técnica demonstrativa', completionNotes: null, createdBy: stableId('gestor'), createdAt: inDays(-3), updatedAt: now(), completedAt: null }
  ];
  const movements = [{ id: id(), assetId: assets[2].id, originDepartmentId: departments[2].id, destinationDepartmentId: departments[3].id, destinationRoomId: rooms[3].id, requestedBy: stableId('operador'), reason: 'Transferência fictícia para avaliação do fluxo de movimentação.', movementType: 'TEMPORARIA', status: 'PENDENTE', requestedAt: inDays(-1), expectedReturnAt: inDays(3), approvedBy: null, approvedAt: null, completedAt: null }];
  const alerts = [
    { id: id(), assetId: assets[5].id, alertType: 'EQUIPAMENTO_INDISPONIVEL', severity: 'ALTO', title: 'Equipamento indisponível', description: 'Registro simulado: oxímetro aguardando avaliação técnica.', status: 'ABERTO', createdAt: now(), acknowledgedBy: null, acknowledgedAt: null, resolvedBy: null, resolvedAt: null, resolutionNote: null },
    { id: id(), assetId: assets[3].id, alertType: 'MANUTENCAO_EM_ANDAMENTO', severity: 'ATENCAO', title: 'Manutenção em andamento', description: 'Ordem corretiva demonstrativa associada ao analisador clínico.', status: 'RECONHECIDO', createdAt: inDays(-1), acknowledgedBy: stableId('gestor'), acknowledgedAt: inDays(-1), resolvedBy: null, resolvedAt: null, resolutionNote: null }
  ];
  const gateways = [{ id: stableId('gateway-01'), code: 'DEMO-GW-01', name: 'Gateway demonstrativo 01', roomId: rooms[0].id, status: 'SEM_COMUNICACAO', lastSeenAt: null, dataOrigin: 'SIMULADO' }];
  return { version: 1, departments, rooms, assets, movements, alerts, gateways, locationEvents: [], notifications: [], maintenanceOrders, auditLogs: [], photoMeta: [] };
}

let cachedState: DemoState | null = null;
function state(): DemoState {
  if (cachedState) return cachedState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cachedState = raw ? JSON.parse(raw) as DemoState : seedState();
  } catch {
    cachedState = seedState();
  }
  cachedState.version = 1;
  for (const key of ['departments', 'rooms', 'assets', 'movements', 'alerts', 'gateways', 'locationEvents', 'notifications', 'maintenanceOrders', 'auditLogs', 'photoMeta'] as const) {
    if (!Array.isArray(cachedState[key])) (cachedState as any)[key] = [];
  }
  save();
  return cachedState;
}
function save(): void {
  if (cachedState) localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedState));
}
function actor(): DemoUser { return createDemoUser(currentRole()); }
function record(action: string, entityType: string, entityId?: string | null, details: unknown = {}) {
  const s = state();
  s.auditLogs.unshift({ id: id(), userId: actor().id, action, entityType, entityId: entityId || null, details, createdAt: now(), profile: actor().role });
  s.auditLogs = s.auditLogs.slice(0, 300);
}
function assetView(asset: any) {
  const s = state();
  return { ...asset, departmentName: s.departments.find((d) => d.id === asset.departmentId)?.name, roomName: s.rooms.find((r) => r.id === asset.roomId)?.name };
}
function movementView(m: any) {
  const s = state(); const asset = s.assets.find((a) => a.id === m.assetId);
  return { ...m, assetName: asset?.name || 'Equipamento arquivado', assetNumber: asset?.assetNumber || 'Não informado', originDepartment: s.departments.find((d) => d.id === m.originDepartmentId)?.name, destinationDepartment: s.departments.find((d) => d.id === m.destinationDepartmentId)?.name || 'Setor não encontrado', requesterName: roleInfo[(m.requesterRole || 'OPERADOR') as Role]?.name || 'Perfil de demonstração' };
}
function parseBody(init: RequestInit): any {
  if (!init.body || typeof init.body !== 'string') return {};
  try { return JSON.parse(init.body); } catch { return {}; }
}
function matchPath(path: string, pattern: RegExp): RegExpMatchArray | null { return path.match(pattern); }
function forbidden(message = 'Este perfil não possui permissão para esta operação.'): never { throw new LocalApiError(message, 403); }
function requireRole(allowed: Role[]) { if (!allowed.includes(actor().role)) forbidden(); }

export class LocalApiError extends Error { constructor(message: string, public status = 400, public payload?: any) { super(message); } }

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new LocalApiError('O navegador bloqueou o armazenamento de fotografias. Abra o HEOM em uma janela normal do Chrome/Edge e habilite os dados do site.', 503));
      return;
    }
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(PHOTO_DB, 1); }
    catch (error) { reject(new LocalApiError(`Não foi possível iniciar o armazenamento de fotografias: ${error instanceof Error ? error.message : 'acesso ao IndexedDB bloqueado'}`, 503)); return; }
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(PHOTO_STORE)) db.createObjectStore(PHOTO_STORE); };
    let wasBlocked = false;
    request.onsuccess = () => { const db = request.result; if (wasBlocked) { db.close(); return; } db.onversionchange = () => db.close(); resolve(db); };
    request.onerror = () => reject(new LocalApiError(`Falha ao abrir o banco local de fotografias: ${request.error?.message || 'erro de armazenamento do navegador'}`, 503));
    request.onblocked = () => { wasBlocked = true; reject(new LocalApiError('O armazenamento de fotografias está ocupado por outra aba do HEOM. Feche as outras abas do sistema e tente novamente.', 503)); };
  });
}

async function photoTransaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openPhotoDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      let request: IDBRequest<T>;
      try { tx = db.transaction(PHOTO_STORE, mode); request = action(tx.objectStore(PHOTO_STORE)); }
      catch (error) { reject(new LocalApiError(`Não foi possível acessar o armazenamento de fotografias: ${error instanceof Error ? error.message : 'transação indisponível'}`, 503)); return; }
      let result: T | undefined;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(new LocalApiError(`Falha ao ler ou gravar a fotografia: ${request.error?.message || 'operação recusada pelo navegador'}`, 507));
      tx.oncomplete = () => resolve(result as T);
      tx.onerror = () => reject(new LocalApiError(`A gravação da fotografia falhou: ${tx.error?.message || 'erro na transação do navegador'}`, 507));
      tx.onabort = () => reject(new LocalApiError(`O navegador cancelou a operação de fotografia: ${tx.error?.message || 'armazenamento indisponível ou sem espaço'}`, 507));
    });
  } finally { db.close(); }
}
async function photoPut(photoId: string, blob: Blob): Promise<void> { await photoTransaction('readwrite', (store) => store.put(blob, photoId)); }
async function photoGet(photoId: string): Promise<Blob | null> { return (await photoTransaction('readonly', (store) => store.get(photoId))) || null; }
async function photoDelete(photoId: string): Promise<void> { await photoTransaction('readwrite', (store) => store.delete(photoId)); }

async function validateImageContent(blob: Blob): Promise<void> {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const validationMessage = validateImageSignature(bytes, blob.type);
  if (validationMessage) throw new LocalApiError(validationMessage, 415);
}

async function hashImage(blob: Blob): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) throw new LocalApiError('O arquivo selecionado não é uma imagem reconhecida.', 415);
  await validateImageContent(blob);
  let drawable: CanvasImageSource;
  let close: (() => void) | undefined;
  if (typeof createImageBitmap === 'function') {
    try { const bitmap = await createImageBitmap(blob); drawable = bitmap; close = () => bitmap.close(); }
    catch { drawable = await loadImageElement(blob); }
  } else drawable = await loadImageElement(blob);
  try {
    const imageDimensions = drawable as { width: number; height: number; naturalWidth?: number; naturalHeight?: number };
    const width = imageDimensions.naturalWidth || imageDimensions.width;
    const height = imageDimensions.naturalHeight || imageDimensions.height;
    if (!width || !height || width > 20_000 || height > 20_000 || width * height > 40_000_000) throw new LocalApiError('A imagem possui dimensões inválidas ou excede 40 megapixels.', 413);
    const canvas = document.createElement('canvas'); canvas.width = 9; canvas.height = 8;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new LocalApiError('O navegador não disponibilizou o recurso de análise de imagem. Atualize o Chrome/Edge e tente novamente.', 503);
    ctx.drawImage(drawable, 0, 0, 9, 8);
    const pixels = ctx.getImageData(0, 0, 9, 8).data;
    let bits = 0n; let bit = 0n;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const a = y * 9 + x; const b = a + 1;
      const ga = 0.299 * pixels[a * 4]! + 0.587 * pixels[a * 4 + 1]! + 0.114 * pixels[a * 4 + 2]!;
      const gb = 0.299 * pixels[b * 4]! + 0.587 * pixels[b * 4 + 1]! + 0.114 * pixels[b * 4 + 2]!;
      if (ga > gb) bits |= 1n << bit;
      bit++;
    }
    return bits.toString(16).padStart(16, '0');
  } catch (error) {
    if (error instanceof LocalApiError) throw error;
    throw new LocalApiError(`Não foi possível analisar a fotografia: ${error instanceof Error ? error.message : 'formato ou recurso de imagem incompatível'}`, 415);
  } finally { close?.(); }
}
async function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob); const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new LocalApiError('O navegador não conseguiu abrir esta imagem. Converta-a para JPG, PNG ou WEBP e tente novamente.', 415)); };
    image.src = url;
  });
}
function similarity(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`); let count = 0;
  while (x) { count++; x &= x - 1n; }
  return 1 - count / 64;
}
function csvEscape(value: unknown): string { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
function downloadCsv(rows: unknown[][]): Blob { return new Blob(['\ufeff' + rows.map((r) => r.map(csvEscape).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }); }
function csvRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quote = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]!; if (c === '"' && quote && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quote = !quote; else if (!quote && (c === ';' || c === ',')) { row.push(field.trim()); field = ''; } else if (!quote && (c === '\n' || c === '\r')) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ''; } else field += c; }
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}

export async function localDemoApi<T = any>(pathInput: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const path = pathInput.split('?')[0] || '/';
  const query = new URLSearchParams(pathInput.split('?')[1] || '');
  const body = parseBody(init); const s = state(); const user = actor();
  if (path === '/demo/profiles' && method === 'GET') return { data: roles.map((role) => ({ ...roleInfo[role], role })), mode: 'DEMONSTRACAO_NAVEGADOR' } as T;
  if (path === '/demo/quick-login' && method === 'POST') {
    const requested = String(body.role || '').toUpperCase() as Role;
    if (!roles.includes(requested)) throw new LocalApiError('Selecione um perfil demonstrativo válido.');
    return { user: createDemoUser(requested), mode: 'DEMONSTRACAO_NAVEGADOR' } as T;
  }
  if (path === '/auth/me' && method === 'POST') return { user } as T;
  if (path === '/auth/me' && method === 'GET') return { user } as T;
  if (path === '/departments' && method === 'GET') return { data: s.departments.filter((d) => d.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) } as T;
  if (path === '/rooms' && method === 'GET') return { data: s.rooms.map((r) => ({ ...r, assetCount: s.assets.filter((a) => a.roomId === r.id && !a.archivedAt).length })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) } as T;
  if (path === '/dashboard' && method === 'GET') {
    const active = s.assets.filter((a) => !a.archivedAt); const open = s.alerts.filter((a) => a.status !== 'RESOLVIDO');
    return { metrics: { total: active.length, operating: active.filter((a) => a.operationalStatus === 'EM_OPERACAO').length, unavailable: active.filter((a) => a.operationalStatus === 'INDISPONIVEL').length, maintenance: active.filter((a) => a.operationalStatus === 'EM_MANUTENCAO').length, tracking: active.filter((a) => ['LOCALIZACAO_CONFIRMADA', 'SETOR_ESTIMADO'].includes(a.trackingStatus)).length, simulated: active.length, open: open.length, critical: open.filter((a) => a.severity === 'CRITICO').length, pending: s.movements.filter((m) => m.status === 'PENDENTE').length }, recentEvents: s.locationEvents.slice(0, 8).map((e) => ({ ...e, assetName: s.assets.find((a) => a.id === e.assetId)?.name, assetNumber: s.assets.find((a) => a.id === e.assetId)?.assetNumber, roomName: s.rooms.find((r) => r.id === e.roomId)?.name, departmentName: s.departments.find((d) => d.id === s.rooms.find((r) => r.id === e.roomId)?.departmentId)?.name })), departments: s.departments.map((d) => { const items = active.filter((a) => a.departmentId === d.id); return { id: d.id, name: d.name, dataOrigin: 'SIMULADO', assetCount: items.length, operatingCount: items.filter((a) => a.operationalStatus === 'EM_OPERACAO').length }; }), demoMode: true } as T;
  }
  if (path === '/assets' && method === 'GET') {
    const q = (query.get('q') || '').toLocaleLowerCase('pt-BR'); const status = query.get('status') || ''; const dept = query.get('departmentId') || ''; const criticality = query.get('criticality') || '';
    const data = s.assets.filter((a) => !a.archivedAt && (!status || a.operationalStatus === status) && (!dept || a.departmentId === dept) && (!criticality || a.criticality === criticality) && (!q || [a.name, a.assetNumber, a.officialPropertyNumber, a.serialNumber, a.manufacturer, a.model, a.reference, a.category, a.trackingTagId].some((v) => String(v || '').toLowerCase().includes(q)))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(assetView);
    return { data } as T;
  }
  let m = matchPath(path, /^\/assets\/([^/]+)$/);
  if (m && method === 'GET') { const a = s.assets.find((v) => v.id === m![1] && !v.archivedAt); if (!a) throw new LocalApiError('Equipamento não encontrado.', 404); return { data: assetView(a) } as T; }
  if (path === '/assets' && method === 'POST') {
    requireRole(['ADMIN', 'GESTOR', 'OPERADOR']);
    const validationError = validateAssetDraft(body, s.departments, s.rooms, s.assets);
    if (validationError) throw new LocalApiError(validationError, validationError.startsWith('Possível duplicidade') ? 409 : 400);
    const asset = { id: id(), qrCode: '', assetNumber: String(body.assetNumber).trim(), officialPropertyNumber: body.officialPropertyNumber || null, name: String(body.name).trim(), category: String(body.category).trim(), description: body.description || null, manufacturer: body.manufacturer || null, model: body.model || null, serialNumber: body.serialNumber || null, reference: body.reference || null, departmentId: body.departmentId || null, roomId: body.roomId || null, operationalStatus: body.operationalStatus || 'EM_OPERACAO', criticality: body.criticality || 'MEDIA', trackingStatus: body.trackingTagId ? 'ULTIMA_LOCALIZACAO' : 'RASTREAMENTO_DESATIVADO', trackingTagId: body.trackingTagId || null, lastDetectedAt: null, dataOrigin: 'SIMULADO', archivedAt: null, createdAt: now(), updatedAt: now() };
    asset.qrCode = `HEOM-ASSET:${asset.id}`; s.assets.unshift(asset);
    try { record('EQUIPAMENTO_CADASTRADO', 'ASSET', asset.id); save(); }
    catch (error) { s.assets = s.assets.filter((item) => item.id !== asset.id); s.auditLogs = s.auditLogs.filter((item) => item.entityId !== asset.id); throw new LocalApiError(`O equipamento foi validado, mas não pôde ser persistido no armazenamento local: ${error instanceof Error ? error.message : 'armazenamento indisponível'}`, 507); }
    return { data: assetView(asset) } as T;
  }
  m = matchPath(path, /^\/assets\/([^/]+)$/);
  if (m && method === 'PUT') {
    requireRole(['ADMIN', 'GESTOR', 'OPERADOR']); const a = s.assets.find((v) => v.id === m![1] && !v.archivedAt); if (!a) throw new LocalApiError('Equipamento não encontrado.', 404);
    const validationError = validateAssetDraft(body, s.departments, s.rooms, s.assets, a.id);
    if (validationError) throw new LocalApiError(validationError, validationError.startsWith('Possível duplicidade') ? 409 : 400);
    const previous = { ...a }; Object.assign(a, body, { updatedAt: now(), dataOrigin: 'SIMULADO', qrCode: `HEOM-ASSET:${a.id}` });
    try { record('EQUIPAMENTO_ATUALIZADO', 'ASSET', a.id); save(); }
    catch (error) { Object.assign(a, previous); s.auditLogs = s.auditLogs.filter((item) => !(item.action === 'EQUIPAMENTO_ATUALIZADO' && item.entityId === a.id)); throw new LocalApiError(`As alterações foram validadas, mas não puderam ser persistidas: ${error instanceof Error ? error.message : 'armazenamento indisponível'}`, 507); }
    return { data: assetView(a) } as T;
  }
  m = matchPath(path, /^\/assets\/([^/]+)\/archive$/);
  if (m && method === 'POST') { requireRole(['ADMIN', 'GESTOR']); const a = s.assets.find((v) => v.id === m![1] && !v.archivedAt); if (!a) throw new LocalApiError('Equipamento não encontrado.', 404); a.archivedAt = now(); a.updatedAt = now(); record('EQUIPAMENTO_ARQUIVADO', 'ASSET', a.id); save(); return { message: 'Equipamento arquivado.' } as T; }
  m = matchPath(path, /^\/assets\/([^/]+)\/photos$/);
  if (m && method === 'GET') return { data: s.photoMeta.filter((p) => p.assetId === m![1] && !p.archivedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(({ blob, ...p }) => ({ ...p, fileUrl: `/api/assets/${m![1]}/photos/${p.id}/file` })) } as T;
  if (m && method === 'POST') {
    requireRole(['ADMIN', 'GESTOR', 'OPERADOR']); const form = init.body instanceof FormData ? init.body : null; const file = form?.get('photo'); if (!(file instanceof Blob)) throw new LocalApiError('Selecione uma fotografia.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new LocalApiError('Formato não suportado. Envie a fotografia em JPG, PNG ou WEBP. Fotos HEIC/HEIF devem ser convertidas antes do envio.', 415);
    if (file.size === 0) throw new LocalApiError('O arquivo selecionado está vazio.', 400);
    if (file.size > 12 * 1024 * 1024) throw new LocalApiError('A fotografia deve ter até 12 MB na demonstração. Reduza o tamanho ou a resolução e tente novamente.', 413);
    const asset = s.assets.find((a) => a.id === m![1] && !a.archivedAt); if (!asset) throw new LocalApiError('Equipamento não encontrado.', 404);
    const photoId = id(); const dhash = await hashImage(file); const originalName = (file as File).name || 'fotografia';
    const imageRole = String(form?.get('imageRole') || 'EQUIPAMENTO');
    const photo = { id: photoId, assetId: asset.id, originalName, mimeType: file.type, sizeBytes: file.size, imageRole, dhash, uploadedBy: user.id, createdAt: now(), archivedAt: null };
    await photoPut(photoId, file);
    try {
      s.photoMeta.unshift(photo);
      record('FOTOGRAFIA_ADICIONADA', 'ASSET_PHOTO', photoId, { assetId: asset.id });
      save();
    } catch (error) {
      s.photoMeta = s.photoMeta.filter((item) => item.id !== photoId);
      s.auditLogs = s.auditLogs.filter((item) => !(item.entityType === 'ASSET_PHOTO' && item.entityId === photoId));
      await photoDelete(photoId).catch(() => undefined);
      throw new LocalApiError(`A fotografia foi lida, mas não foi possível concluir a gravação dos metadados: ${error instanceof Error ? error.message : 'falha no localStorage'}`, 507);
    }
    return { data: { ...photo, fileUrl: `/api/assets/${asset.id}/photos/${photoId}/file` } } as T;
  }
  m = matchPath(path, /^\/assets\/([^/]+)\/photos\/([^/]+)$/);
  if (m && method === 'DELETE') {
    requireRole(['ADMIN', 'GESTOR']);
    const photo = s.photoMeta.find((p) => p.id === m![2] && p.assetId === m![1]);
    if (!photo) throw new LocalApiError('Fotografia não encontrada.', 404);
    const previousArchivedAt = photo.archivedAt;
    photo.archivedAt = now();
    record('FOTOGRAFIA_REMOVIDA', 'ASSET_PHOTO', photo.id);
    try { save(); }
    catch (error) {
      photo.archivedAt = previousArchivedAt;
      s.auditLogs = s.auditLogs.filter((item) => !(item.action === 'FOTOGRAFIA_REMOVIDA' && item.entityId === photo.id));
      throw new LocalApiError(`Não foi possível arquivar a fotografia no inventário local: ${error instanceof Error ? error.message : 'armazenamento indisponível'}`, 507);
    }
    try { await photoDelete(photo.id); }
    catch (error) {
      throw new LocalApiError(`A fotografia foi removida da galeria, mas o arquivo local não pôde ser apagado do IndexedDB: ${error instanceof Error ? error.message : 'falha de armazenamento'}. O vínculo está arquivado e não será exibido.`, 507);
    }
    return { message: 'Fotografia removida deste navegador.' } as T;
  }
  m = matchPath(path, /^\/assets\/([^/]+)\/photos\/([^/]+)\/ocr$/);
  if (m && method === 'POST') { requireRole(['ADMIN', 'GESTOR', 'OPERADOR']); throw new LocalApiError('Este endpoint legado não executa OCR no servidor. O reconhecimento de plaquetas agora é executado diretamente no navegador pelo módulo compartilhado plate-ocr.ts.', 410); }
  m = matchPath(path, /^\/assets\/([^/]+)\/ocr\/([^/]+)\/confirm$/);
  if (m && method === 'POST') {
    requireRole(['ADMIN', 'GESTOR', 'OPERADOR']);
    const a = s.assets.find((v) => v.id === m![1]); if (!a) throw new LocalApiError('Equipamento não encontrado.', 404);
    if (body.replaceExisting && !['ADMIN', 'GESTOR'].includes(user.role)) forbidden('Somente Gestor ou Administrador pode substituir informações já cadastradas.');
    const normalize = (value: unknown) => String(value || '').trim().toLocaleUpperCase('pt-BR');
    if (body.serialNumber && s.assets.some((other) => other.id !== a.id && !other.archivedAt && normalize(other.serialNumber) === normalize(body.serialNumber))) throw new LocalApiError('O número de série informado já está vinculado a outro equipamento.', 409);
    for (const key of ['manufacturer', 'model', 'serialNumber'] as const) {
      const value = String(body[key] || '').trim();
      if (!value) continue;
      if (a[key] && a[key] !== value && !body.replaceExisting) throw new LocalApiError(`O campo ${key} já possui valor. Um gestor deve autorizar a substituição.`, 409);
      a[key] = value;
    }
    a.updatedAt = now(); record('DADOS_DA_PLAQUETA_CONFIRMADOS', 'ASSET', a.id); save(); return { message: 'Dados revisados e gravados no cadastro demonstrativo.' } as T;
  }
  if (path === '/assets/search-by-image' && method === 'POST') {
    const form = init.body instanceof FormData ? init.body : null; const file = form?.get('photo'); if (!(file instanceof Blob)) throw new LocalApiError('Selecione uma imagem para comparar.');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new LocalApiError('Formato não suportado para busca. Envie JPG, PNG ou WEBP. Fotos HEIC/HEIF devem ser convertidas antes da comparação.', 415);
    if (file.size === 0) throw new LocalApiError('O arquivo selecionado está vazio.', 400);
    if (file.size > 12 * 1024 * 1024) throw new LocalApiError('A imagem deve ter até 12 MB para comparação.', 413);
    const hash = await hashImage(file);
    const matches = [] as any[]; for (const photo of s.photoMeta.filter((p) => !p.archivedAt)) { const score = similarity(hash, photo.dhash); const asset = s.assets.find((a) => a.id === photo.assetId && !a.archivedAt); if (!asset) continue; matches.push({ photoId: photo.id, assetId: asset.id, assetNumber: asset.assetNumber, name: asset.name, manufacturer: asset.manufacturer, model: asset.model, similarity: score, confidence: score >= .85 ? 'ALTA_SIMILARIDADE' : score >= .7 ? 'POSSIVEL_CORRESPONDENCIA' : score >= .55 ? 'BAIXA_SIMILARIDADE' : 'SEM_CORRESPONDENCIA', fileUrl: `/api/assets/${asset.id}/photos/${photo.id}/file` }); }
    matches.sort((a, b) => b.similarity - a.similarity); return { data: matches.slice(0, 10), disclaimer: 'Comparação aproximada por hash perceptual local (dHash). Semelhança visual não confirma identidade; confira patrimônio, plaqueta e número de série.' } as T;
  }
  m = matchPath(path, /^\/maintenance$/);
  if (m && method === 'GET') return { data: s.maintenanceOrders.map((o) => ({ ...o, assetName: s.assets.find((a) => a.id === o.assetId)?.name || 'Equipamento', assetNumber: s.assets.find((a) => a.id === o.assetId)?.assetNumber || '—' })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) } as T;
  if (path === '/maintenance' && method === 'POST') { requireRole(['ADMIN', 'GESTOR', 'OPERADOR']); const asset = s.assets.find((a) => a.id === body.assetId); if (!asset) throw new LocalApiError('Equipamento não encontrado.', 404); const order = { id: id(), assetId: asset.id, orderType: body.orderType || 'PREVENTIVA', title: body.title, description: body.description, priority: body.priority || 'MEDIA', status: 'PROGRAMADA', scheduledAt: body.scheduledAt || null, dueAt: body.dueAt || null, responsibleName: body.responsibleName || null, completionNotes: null, createdBy: user.id, createdAt: now(), updatedAt: now(), completedAt: null }; s.maintenanceOrders.unshift(order); if (order.orderType === 'CORRETIVA') asset.operationalStatus = 'EM_MANUTENCAO'; record('ORDEM_MANUTENCAO_CRIADA', 'MAINTENANCE', order.id); save(); return { data: order, message: 'Ordem de serviço criada.' } as T; }
  m = matchPath(path, /^\/maintenance\/([^/]+)\/status$/);
  if (m && method === 'PATCH') {
    requireRole(['ADMIN', 'GESTOR', 'OPERADOR']); const order = s.maintenanceOrders.find((o) => o.id === m![1]); if (!order) throw new LocalApiError('Ordem não encontrada.', 404);
    if (!['EM_ANDAMENTO', 'AGUARDANDO_PECA', 'CONCLUIDA', 'CANCELADA'].includes(body.status)) throw new LocalApiError('Situação de manutenção inválida.');
    order.status = body.status; order.updatedAt = now();
    if (body.status === 'CONCLUIDA') order.completedAt = now();
    if (['CONCLUIDA', 'CANCELADA'].includes(body.status) && order.orderType === 'CORRETIVA') {
      const otherOpen = s.maintenanceOrders.some((o) => o.assetId === order.assetId && o.id !== order.id && o.orderType === 'CORRETIVA' && !['CONCLUIDA', 'CANCELADA'].includes(o.status));
      const asset = s.assets.find((a) => a.id === order.assetId);
      if (!otherOpen && asset?.operationalStatus === 'EM_MANUTENCAO') asset.operationalStatus = 'EM_OPERACAO';
    }
    record('ORDEM_MANUTENCAO_ATUALIZADA', 'MAINTENANCE', order.id); save(); return { message: 'Ordem de serviço atualizada.' } as T;
  }
  if (path === '/reports/inventory.csv' && method === 'GET') return { rows: [] } as T;
  if (path === '/imports/inventory-template.csv' && method === 'GET') return { rows: [] } as T;
  if (path === '/imports/inventory-csv' && method === 'POST') {
    requireRole(['ADMIN', 'GESTOR', 'OPERADOR']); const form = init.body instanceof FormData ? init.body : null; const file = form?.get('file'); if (!(file instanceof Blob)) throw new LocalApiError('Selecione um arquivo CSV.'); const text = await file.text(); const rows = csvRows(text); if (rows.length < 2) throw new LocalApiError('O CSV não contém linhas para importar.');
    const normalizeHeader = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '');
    const headers = rows[0].map(normalizeHeader); const col = (names: string[]) => headers.findIndex((h) => names.some((name) => h === normalizeHeader(name)));
    const idx = { asset: col(['patrimonio', 'identificacao', 'numero de identificacao']), name: col(['nome', 'equipamento']), category: col(['categoria']), manufacturer: col(['fabricante', 'marca']), model: col(['modelo']), serial: col(['numero de serie', 'serie']), reference: col(['referencia', 'reference', 'ref']), property: col(['patrimonio oficial']), department: col(['setor', 'departamento']), room: col(['sala', 'ambiente', 'room']), status: col(['situacao', 'situacao operacional']), criticality: col(['criticidade']) };
    const errors: any[] = []; const imported: any[] = [];
    rows.slice(1).forEach((r, index) => {
      const value = (position: number) => position >= 0 ? String(r[position] || '').trim() : '';
      const assetNumber = value(idx.asset); const name = value(idx.name); const category = value(idx.category);
      const officialPropertyNumber = value(idx.property); const serialNumber = value(idx.serial); const departmentName = value(idx.department); const roomName = value(idx.room);
      const issues: string[] = [];
      if (!assetNumber) issues.push('Identificação obrigatória.'); if (!name) issues.push('Nome obrigatório.'); if (!category) issues.push('Categoria obrigatória.');
      const department = s.departments.find((d) => d.active && (d.code.toLocaleLowerCase('pt-BR') === departmentName.toLocaleLowerCase('pt-BR') || d.name.toLocaleLowerCase('pt-BR') === departmentName.toLocaleLowerCase('pt-BR')));
      if (!department) issues.push(departmentName ? `Setor não encontrado: ${departmentName}.` : 'Setor obrigatório.');
      const room = roomName ? s.rooms.find((r) => r.code.toLocaleLowerCase('pt-BR') === roomName.toLocaleLowerCase('pt-BR') || r.name.toLocaleLowerCase('pt-BR') === roomName.toLocaleLowerCase('pt-BR')) : undefined;
      if (roomName && !room) issues.push(`Ambiente não encontrado: ${roomName}.`);
      if (room && department && room.departmentId !== department.id) issues.push('O ambiente informado não pertence ao setor selecionado.');
      if (s.assets.some((a) => !a.archivedAt && (a.assetNumber.toLocaleUpperCase('pt-BR') === assetNumber.toLocaleUpperCase('pt-BR') || Boolean(officialPropertyNumber && a.officialPropertyNumber?.toLocaleUpperCase('pt-BR') === officialPropertyNumber.toLocaleUpperCase('pt-BR')) || Boolean(serialNumber && a.serialNumber?.toLocaleUpperCase('pt-BR') === serialNumber.toLocaleUpperCase('pt-BR'))))) issues.push('Patrimônio, número patrimonial oficial ou número de série já cadastrado.');
      if (issues.length) errors.push({ row: index + 2, errors: issues });
      else imported.push({ id: id(), qrCode: '', assetNumber, officialPropertyNumber: officialPropertyNumber || null, name, category, manufacturer: value(idx.manufacturer) || null, model: value(idx.model) || null, serialNumber: serialNumber || null, reference: value(idx.reference) || null, departmentId: department!.id, roomId: room?.id || null, operationalStatus: value(idx.status) || 'EM_OPERACAO', criticality: value(idx.criticality) || 'MEDIA', trackingStatus: 'RASTREAMENTO_DESATIVADO', trackingTagId: null, dataOrigin: 'SIMULADO', archivedAt: null, description: 'Importado para demonstração.', createdAt: now(), updatedAt: now() });
    });
    if (errors.length) throw new LocalApiError('A importação não foi aplicada. Corrija as linhas informadas.', 422, { data: { errors, totalRows: rows.length - 1, imported: 0 } });
    for (const asset of imported) asset.qrCode = `HEOM-ASSET:${asset.id}`;
    s.assets.unshift(...imported);
    try { record('INVENTARIO_IMPORTADO_CSV', 'IMPORT', null, { imported: imported.length }); save(); }
    catch (error) { s.assets = s.assets.filter((asset) => !imported.some((item) => item.id === asset.id)); s.auditLogs = s.auditLogs.filter((entry) => !(entry.action === 'INVENTARIO_IMPORTADO_CSV' && entry.entityType === 'IMPORT')); throw new LocalApiError(`A importação foi validada, mas não pôde ser persistida neste navegador: ${error instanceof Error ? error.message : 'armazenamento indisponível'}`, 507); }
    return { message: `${imported.length} equipamento(s) importado(s) como SIMULADO.`, data: { totalRows: rows.length - 1, imported: imported.length, errors: [] } } as T;
  }
  if (path === '/movements' && method === 'GET') return { data: s.movements.map(movementView).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)) } as T;
  if (path === '/movements' && method === 'POST') { requireRole(['ADMIN', 'GESTOR', 'OPERADOR']); const asset = s.assets.find((a) => a.id === body.assetId && !a.archivedAt); const dept = s.departments.find((d) => d.id === body.destinationDepartmentId && d.active); if (!asset || !dept || String(body.reason || '').trim().length < 5) throw new LocalApiError('Preencha equipamento, destino e justificativa.'); if (body.destinationRoomId && !s.rooms.some((r) => r.id === body.destinationRoomId && r.departmentId === dept.id)) throw new LocalApiError('O ambiente de destino não pertence ao setor selecionado.'); if (!['TEMPORARIA', 'PERMANENTE', 'MANUTENCAO', 'EMERGENCIAL'].includes(body.movementType || 'TEMPORARIA')) throw new LocalApiError('Tipo de movimentação inválido.'); const movement = { id: id(), assetId: asset.id, originDepartmentId: asset.departmentId, destinationDepartmentId: dept.id, destinationRoomId: body.destinationRoomId || null, requestedBy: user.id, requesterRole: user.role, reason: body.reason, movementType: body.movementType || 'TEMPORARIA', status: 'PENDENTE', requestedAt: now(), expectedReturnAt: body.expectedReturnAt || null, approvedBy: null, approvedAt: null, completedAt: null }; s.movements.unshift(movement); record('MOVIMENTACAO_SOLICITADA', 'MOVEMENT', movement.id); save(); return { id: movement.id, message: 'Solicitação demonstrativa registrada e aguardando aprovação.' } as T; }
  m = matchPath(path, /^\/movements\/([^/]+)\/status$/);
  if (m && method === 'PATCH') { requireRole(['ADMIN', 'GESTOR']); const movement = s.movements.find((v) => v.id === m![1]); if (!movement) throw new LocalApiError('Solicitação não encontrada.', 404); const next = String(body.status || ''); const allowed = (movement.status === 'PENDENTE' && ['APROVADA', 'REJEITADA'].includes(next)) || (movement.status === 'APROVADA' && next === 'CONCLUIDA'); if (!allowed) throw new LocalApiError('Essa transição não é permitida para a situação atual.', 409); movement.status = next; if (['APROVADA', 'REJEITADA'].includes(next)) { movement.approvedBy = user.id; movement.approvedAt = now(); } if (next === 'CONCLUIDA') { movement.completedAt = now(); const asset = s.assets.find((a) => a.id === movement.assetId); if (asset) { asset.departmentId = movement.destinationDepartmentId; asset.roomId = movement.destinationRoomId; asset.updatedAt = now(); } } record(`MOVIMENTACAO_${next}`, 'MOVEMENT', movement.id); save(); return { message: 'Movimentação atualizada.' } as T; }
  if (path === '/alerts' && method === 'GET') { const status = query.get('status') || ''; return { data: s.alerts.filter((a) => !status || a.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((a) => ({ ...a, assetName: s.assets.find((v) => v.id === a.assetId)?.name, assetNumber: s.assets.find((v) => v.id === a.assetId)?.assetNumber })) } as T; }
  m = matchPath(path, /^\/alerts\/([^/]+)\/status$/);
  if (m && method === 'PATCH') { requireRole(['ADMIN', 'GESTOR', 'OPERADOR']); const alert = s.alerts.find((a) => a.id === m![1] && a.status !== 'RESOLVIDO'); if (!alert) throw new LocalApiError('Alerta não encontrado ou já resolvido.', 404); if (!['RECONHECIDO', 'RESOLVIDO'].includes(body.status)) throw new LocalApiError('Situação de alerta inválida.'); if (body.status === 'RECONHECIDO') { alert.status = 'RECONHECIDO'; alert.acknowledgedBy = user.id; alert.acknowledgedAt = now(); } else { alert.status = 'RESOLVIDO'; alert.resolvedBy = user.id; alert.resolvedAt = now(); alert.resolutionNote = body.note || null; } record(`ALERTA_${body.status}`, 'ALERT', alert.id); save(); return { message: 'Alerta atualizado.' } as T; }
  if (path === '/floor-plan' && method === 'GET') return { data: s.rooms.map((r) => ({ id: r.id, code: r.code, name: r.name, floorLabel: r.floorLabel, isRestricted: r.isRestricted, x: r.mapX, y: r.mapY, departmentName: r.departmentName, dataOrigin: r.dataOrigin, assetCount: s.assets.filter((a) => a.roomId === r.id && !a.archivedAt).length })), planStatus: 'PLANTA_ILUSTRATIVA_AGUARDANDO_VALIDACAO', message: 'Planta ilustrativa demonstrativa; não representa a planta física oficial.' } as T;
  if (path === '/gateways' && method === 'GET') { requireRole(['ADMIN', 'GESTOR']); return { data: s.gateways.map((g) => ({ ...g, roomName: s.rooms.find((r) => r.id === g.roomId)?.name })), mqttConnected: false, simulatorAvailable: true } as T; }
  if (path === '/simulator/observation' && method === 'POST') { requireRole(['ADMIN', 'GESTOR']); const asset = s.assets.find((a) => a.trackingTagId === body.tagId); const gateway = s.gateways.find((g) => g.code === body.gatewayCode); if (!asset || !gateway) throw new LocalApiError('Etiqueta ou gateway demonstrativo não encontrado.', 404); const room = s.rooms.find((r) => r.id === gateway.roomId); const event = { id: id(), eventId: id(), assetId: asset.id, source: 'SIMULATED', gatewayCode: gateway.code, roomId: gateway.roomId, rssi: Number(body.rssi || -61), detectedAt: now(), confidence: room ? 'SETOR_ESTIMADO' : 'ULTIMA_LOCALIZACAO' }; s.locationEvents.unshift(event); asset.trackingStatus = room ? 'SETOR_ESTIMADO' : 'ULTIMA_LOCALIZACAO'; asset.lastDetectedAt = event.detectedAt; gateway.status = 'ONLINE'; gateway.lastSeenAt = event.detectedAt; record('EVENTO_RASTREAMENTO_SIMULADO', 'TRACKING_EVENT', event.eventId); save(); return { message: 'Detecção simulada registrada no navegador. Nenhum gateway ou sensor físico foi consultado.', eventId: event.eventId } as T; }
  if (path === '/notifications' && method === 'GET') return { data: s.notifications.filter((n) => n.profile === user.role).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50) } as T;
  m = matchPath(path, /^\/notifications\/([^/]+)\/read$/);
  if (m && method === 'POST') { const notification = s.notifications.find((n) => n.id === m![1] && n.profile === user.role); if (!notification) throw new LocalApiError('Notificação não encontrada.', 404); notification.readAt = now(); save(); return { message: 'Notificação marcada como lida.', data: { id: notification.id, readAt: notification.readAt } } as T; }
  if (path === '/admin/users' && method === 'GET') { requireRole(['ADMIN']); return { data: roles.map((role) => ({ id: stableId(role.toLowerCase()), name: roleInfo[role].name, role, active: true, isDemoProfile: true })) } as T; }
  if (path === '/admin/users' && method === 'POST') forbidden('O modo de demonstração não cria contas reais. Utilize o seletor de perfis de teste.');
  throw new LocalApiError(`Rota demonstrativa não implementada: ${method} ${path}`, 404);
}

export async function localDemoBlob(pathInput: string): Promise<Blob> {
  const path = pathInput.split('?')[0] || '/'; const s = state();
  let m = path.match(/^\/assets\/([^/]+)\/photos\/([^/]+)\/file$/);
  if (m) { const blob = await photoGet(m[2]); if (!blob) throw new LocalApiError('Arquivo da fotografia não encontrado neste navegador.', 404); return blob; }
  m = path.match(/^\/assets\/([^/]+)\/qr\.(svg|png)$/);
  if (m) {
    const asset = s.assets.find((a) => a.id === m![1] && !a.archivedAt);
    if (!asset) throw new LocalApiError('Equipamento não encontrado.', 404);
    const options = { errorCorrectionLevel: 'H' as const, margin: 4, width: 640, color: { dark: '#102A43', light: '#FFFFFF' } };
    if (m[2] === 'svg') {
      const svg = await QRCode.toString(`HEOM-ASSET:${asset.id}`, { ...options, type: 'svg' });
      return new Blob([svg], { type: 'image/svg+xml' });
    }
    const dataUrl = await QRCode.toDataURL(`HEOM-ASSET:${asset.id}`, options);
    const response = await fetch(dataUrl);
    if (!response.ok) throw new LocalApiError('Falha ao gerar a versão PNG do QR Code.', 500);
    return response.blob();
  }
  if (path === '/reports/inventory.csv') {
    const rows: unknown[][] = [['Patrimônio', 'Nome', 'Categoria', 'Fabricante', 'Modelo', 'Número de série', 'Referência', 'Patrimônio oficial', 'Setor', 'Ambiente', 'Situação', 'Criticidade', 'Origem'], ...s.assets.filter((a) => !a.archivedAt).map((a) => [a.assetNumber, a.name, a.category, a.manufacturer, a.model, a.serialNumber, a.reference, a.officialPropertyNumber, s.departments.find((d) => d.id === a.departmentId)?.name, s.rooms.find((r) => r.id === a.roomId)?.name, a.operationalStatus, a.criticality, 'SIMULADO'])];
    return downloadCsv(rows);
  }
  if (path === '/imports/inventory-template.csv') return downloadCsv([['Patrimônio', 'Nome', 'Categoria', 'Fabricante', 'Modelo', 'Número de série', 'Referência', 'Patrimônio oficial', 'Setor', 'Ambiente', 'Situação', 'Criticidade']]);
  throw new LocalApiError(`Arquivo demonstrativo não encontrado: ${path}`, 404);
}
