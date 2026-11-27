import './env.js';
import http from 'node:http';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import mqtt from 'mqtt';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';
import { pool } from './db.js';
import { canTransitionMovement, trackingStatusForObservation } from './domain.js';
import { parseInventoryCsv, findCsvDuplicates, type InventoryCsvRow } from './csv.js';
import { compareDifferenceHash, similarityLabel } from './visual.js';
import { photoUpload, csvUpload, maxAssetPhotoMb, saveAssetPhoto, readStoredPhoto, deleteStoredPhoto, makeQrSvg, makeQrPng } from './media.js';

type Role = 'ADMIN' | 'GESTOR' | 'OPERADOR' | 'CONSULTA';
type AuthUser = { id: string; name: string; email?: string; role: Role };
declare global { namespace Express { interface Request { user?: AuthUser } } }

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || process.env.APP_PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || '';
const mqttTopic = process.env.MQTT_TOPIC || 'heom/tracking/observations';
const mqttClient = mqtt.connect(process.env.MQTT_URL || 'mqtt://localhost:1883', {
  username: process.env.MQTT_USERNAME || undefined,
  password: process.env.MQTT_PASSWORD || undefined,
  reconnectPeriod: 3000,
  connectTimeout: 5000,
  clean: true
});

if (jwtSecret.length < 32) console.warn('[Segurança] JWT_SECRET deve ter pelo menos 32 caracteres e ser exclusivo.');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: (process.env.WEB_ORIGIN || 'http://localhost:5173').split(',').map((value) => value.trim()), credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const wss = new WebSocketServer({ noServer: true });
const authenticatedSockets = new Set<WebSocket>();

server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/ws') return socket.destroy();
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
});

function broadcast(type: string, payload: unknown) {
  const message = JSON.stringify({ type, payload, sentAt: new Date().toISOString() });
  for (const client of authenticatedSockets) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}

wss.on('connection', (ws) => {
  let authenticated = false;
  const timeout = setTimeout(() => { if (!authenticated) ws.close(4401, 'Autenticação necessária'); }, 5000);
  ws.on('message', (raw) => {
    if (authenticated) return;
    try {
      const data = JSON.parse(raw.toString()) as { type?: string; token?: string };
      if (data.type !== 'AUTH' || !data.token || !jwtSecret) return ws.close(4401, 'Credenciais inválidas');
      jwt.verify(data.token, jwtSecret);
      authenticated = true;
      clearTimeout(timeout);
      authenticatedSockets.add(ws);
      ws.send(JSON.stringify({ type: 'AUTHENTICATED', payload: { message: 'Conexão local estabelecida.' } }));
    } catch { ws.close(4401, 'Credenciais inválidas'); }
  });
  ws.on('close', () => { clearTimeout(timeout); authenticatedSockets.delete(ws); });
});

function signToken(user: AuthUser) {
  return jwt.sign({ sub: user.id, name: user.name, email: user.email, role: user.role }, jwtSecret, { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as SignOptions['expiresIn'] });
}

function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token || !jwtSecret) return res.status(401).json({ error: 'Sua sessão não foi identificada. Entre novamente.' });
  try {
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;
    if (!payload.sub || !payload.role) return res.status(401).json({ error: 'Sessão inválida.' });
    req.user = { id: payload.sub, name: String(payload.name || ''), email: String(payload.email || ''), role: payload.role as Role };
    next();
  } catch { return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' }); }
}

function allowRoles(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Seu perfil não possui permissão para esta operação.' });
    next();
  };
}

async function audit(userId: string | null, action: string, entityType: string, entityId: string | null, details: unknown = {}) {
  await pool.query(
    'INSERT INTO audit_logs(user_id, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5)',
    [userId, action, entityType, entityId, JSON.stringify(details)]
  );
}

const uuidSchema = z.string().uuid();

// Express 5 tipa parâmetros de rota como string | string[] | undefined.
// Centralizamos a leitura para nunca enviar valores ausentes ao banco/auditoria.
function routeId(req: Request): string | null {
  const value = req.params.id;
  return typeof value === 'string' ? value : null;
}
const assetSchema = z.object({
  assetNumber: z.string().trim().min(2).max(80),
  officialPropertyNumber: z.string().trim().max(100).optional().nullable(),
  name: z.string().trim().min(2).max(180),
  category: z.string().trim().min(2).max(100),
  description: z.string().max(2000).optional().nullable(),
  manufacturer: z.string().trim().max(140).optional().nullable(),
  model: z.string().trim().max(140).optional().nullable(),
  serialNumber: z.string().trim().max(140).optional().nullable(),
  reference: z.string().trim().max(140).optional().nullable(),
  departmentId: uuidSchema,
  roomId: uuidSchema.optional().nullable(),
  operationalStatus: z.enum(['EM_OPERACAO', 'INDISPONIVEL', 'EM_MANUTENCAO', 'BAIXADO']).default('EM_OPERACAO'),
  criticality: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']).default('MEDIA'),
  trackingTagId: z.string().trim().max(140).optional().nullable()
});

async function hasDuplicateAsset(asset: z.infer<typeof assetSchema>, exceptId?: string): Promise<boolean> {
  const result = await pool.query(`SELECT id FROM assets
    WHERE archived_at IS NULL
      AND ($5::uuid IS NULL OR id <> $5::uuid)
      AND (
        lower(asset_number) = lower($1)
        OR ($2::text IS NOT NULL AND lower(COALESCE(official_property_number,'')) = lower($2))
        OR ($3::text IS NOT NULL AND lower(COALESCE(serial_number,'')) = lower($3))
        OR ($4::text IS NOT NULL AND lower(COALESCE(tracking_tag_id,'')) = lower($4))
      )
    LIMIT 1`, [asset.assetNumber, asset.officialPropertyNumber || null, asset.serialNumber || null,
    asset.trackingTagId || null, exceptId || null]);
  return Boolean(result.rowCount);
}

app.get('/api/health', async (_req, res) => {
  let database = 'indisponível';
  try { await pool.query('SELECT 1'); database = 'conectado'; } catch { /* status informado na resposta */ }
  res.status(database === 'conectado' ? 200 : 503).json({
    status: database === 'conectado' ? 'operacional' : 'degradado',
    application: 'HEOM', database,
    mqtt: mqttClient.connected ? 'conectado' : 'aguardando conexão',
    mode: 'rede local — sem dependência de internet',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Informe um e-mail válido e sua senha.' });
  const result = await pool.query('SELECT id, name, email, password_hash, role, active FROM users WHERE lower(email) = lower($1)', [parsed.data.email]);
  const row = result.rows[0];
  if (!row || !row.active || !(await bcrypt.compare(parsed.data.password, row.password_hash))) {
    return res.status(401).json({ error: 'E-mail ou senha não conferem.' });
  }
  const user: AuthUser = { id: row.id, name: row.name, email: row.email, role: row.role };
  await audit(user.id, 'LOGIN_REALIZADO', 'USER', user.id);
  return res.json({ token: signToken(user), user });
});

app.get('/api/auth/me', authenticate, async (req, res) => res.json({ user: req.user }));

app.get('/api/dashboard', authenticate, async (_req, res) => {
  const [totals, alerts, movements, recentEvents, departments, categories, coverage] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE operational_status = 'EM_OPERACAO')::int AS operating,
      COUNT(*) FILTER (WHERE operational_status = 'INDISPONIVEL')::int AS unavailable,
      COUNT(*) FILTER (WHERE operational_status = 'EM_MANUTENCAO')::int AS maintenance,
      COUNT(*) FILTER (WHERE tracking_status IN ('LOCALIZACAO_CONFIRMADA','SETOR_ESTIMADO'))::int AS tracking,
      COUNT(*) FILTER (WHERE data_origin = 'SIMULADO')::int AS simulated
      FROM assets WHERE archived_at IS NULL`),
    pool.query(`SELECT COUNT(*)::int AS open, COUNT(*) FILTER (WHERE severity = 'CRITICO')::int AS critical
      FROM alerts WHERE status <> 'RESOLVIDO'`),
    pool.query(`SELECT COUNT(*)::int AS pending FROM movement_requests WHERE status = 'PENDENTE'`),
    pool.query(`SELECT e.id, e.event_id AS "eventId", e.source, e.detected_at AS "detectedAt", e.rssi,
      a.name AS "assetName", a.asset_number AS "assetNumber", r.name AS "roomName", d.name AS "departmentName"
      FROM location_events e JOIN assets a ON a.id=e.asset_id LEFT JOIN rooms r ON r.id=e.room_id
      LEFT JOIN departments d ON d.id=r.department_id ORDER BY e.detected_at DESC LIMIT 8`),
    pool.query(`SELECT d.id, d.name, d.data_origin AS "dataOrigin", COUNT(a.id)::int AS "assetCount",
      COUNT(a.id) FILTER (WHERE a.operational_status='EM_OPERACAO')::int AS "operatingCount"
      FROM departments d LEFT JOIN assets a ON a.department_id=d.id AND a.archived_at IS NULL
      WHERE d.active=true GROUP BY d.id ORDER BY d.name`),
    pool.query(`SELECT COALESCE(NULLIF(BTRIM(category), ''), 'Categoria não informada') AS name,
      COUNT(*)::int AS value FROM assets WHERE archived_at IS NULL
      GROUP BY COALESCE(NULLIF(BTRIM(category), ''), 'Categoria não informada')
      ORDER BY COUNT(*) DESC, name ASC`),
    pool.query(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE department_id IS NOT NULL)::int AS department,
      COUNT(*) FILTER (WHERE room_id IS NOT NULL)::int AS room,
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(manufacturer), '') IS NOT NULL AND NULLIF(BTRIM(model), '') IS NOT NULL)::int AS "manufacturerModel",
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(serial_number), '') IS NOT NULL)::int AS "serialNumber",
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(official_property_number), '') IS NOT NULL OR NULLIF(BTRIM(reference), '') IS NOT NULL)::int AS "propertyReference",
      COUNT(*) FILTER (WHERE NULLIF(BTRIM(tracking_tag_id), '') IS NOT NULL)::int AS "trackingTag"
      FROM assets WHERE archived_at IS NULL`)
  ]);
  res.json({
    metrics: { ...totals.rows[0], ...alerts.rows[0], ...movements.rows[0] },
    recentEvents: recentEvents.rows,
    departments: departments.rows,
    categories: categories.rows,
    coverage: coverage.rows[0],
    demoMode: process.env.DEMO_MODE === 'true'
  });
});

app.get('/api/departments', authenticate, async (_req, res) => {
  const result = await pool.query('SELECT id, code, name, description, data_origin AS "dataOrigin" FROM departments WHERE active=true ORDER BY name');
  res.json({ data: result.rows });
});
app.get('/api/rooms', authenticate, async (_req, res) => {
  const result = await pool.query(`SELECT r.id, r.code, r.name, r.floor_label AS "floorLabel", r.is_restricted AS "isRestricted",
    r.department_id AS "departmentId", d.name AS "departmentName", r.data_origin AS "dataOrigin"
    FROM rooms r LEFT JOIN departments d ON d.id=r.department_id ORDER BY d.name, r.name`);
  res.json({ data: result.rows });
});

app.get('/api/assets', authenticate, async (req, res) => {
  const values: unknown[] = [];
  const conditions = ['a.archived_at IS NULL'];
  const q = String(req.query.q || '').trim();
  if (q) {
    values.push(`%${q}%`);
    conditions.push(`(a.name ILIKE $${values.length}
      OR a.asset_number ILIKE $${values.length}
      OR COALESCE(a.official_property_number,'') ILIKE $${values.length}
      OR COALESCE(a.serial_number,'') ILIKE $${values.length}
      OR COALESCE(a.manufacturer,'') ILIKE $${values.length}
      OR COALESCE(a.model,'') ILIKE $${values.length}
      OR COALESCE(a.reference,'') ILIKE $${values.length}
      OR COALESCE(a.category,'') ILIKE $${values.length}
      OR COALESCE(a.tracking_tag_id,'') ILIKE $${values.length})`);
  }
  const status = String(req.query.status || '');
  if (status) { values.push(status); conditions.push(`a.operational_status = $${values.length}`); }
  const departmentId = String(req.query.departmentId || '');
  if (departmentId && z.string().uuid().safeParse(departmentId).success) { values.push(departmentId); conditions.push(`a.department_id = $${values.length}`); }
  const result = await pool.query(`SELECT a.id, a.asset_number AS "assetNumber", a.official_property_number AS "officialPropertyNumber",
    a.name, a.category, a.description, a.manufacturer, a.model, a.serial_number AS "serialNumber", a.reference, a.room_id AS "roomId", a.operational_status AS "operationalStatus",
    a.criticality, a.tracking_status AS "trackingStatus", a.tracking_tag_id AS "trackingTagId", a.last_detected_at AS "lastDetectedAt",
    a.data_origin AS "dataOrigin", d.name AS "departmentName", d.id AS "departmentId", r.name AS "roomName"
    FROM assets a LEFT JOIN departments d ON d.id=a.department_id LEFT JOIN rooms r ON r.id=a.room_id
    WHERE ${conditions.join(' AND ')} ORDER BY a.updated_at DESC LIMIT 500`, values);
  res.json({ data: result.rows });
});

app.get('/api/assets/:id', authenticate, async (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  const result = await pool.query(`SELECT a.*, a.asset_number AS "assetNumber", a.department_id AS "departmentId",
    a.room_id AS "roomId", a.operational_status AS "operationalStatus", a.tracking_status AS "trackingStatus",
    a.tracking_tag_id AS "trackingTagId", a.official_property_number AS "officialPropertyNumber",
    a.last_detected_at AS "lastDetectedAt", a.last_room_id AS "lastRoomId", d.name AS "departmentName", r.name AS "roomName"
    FROM assets a LEFT JOIN departments d ON d.id=a.department_id LEFT JOIN rooms r ON r.id=a.last_room_id
    WHERE a.id=$1 AND a.archived_at IS NULL`, [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  const history = await pool.query('SELECT id, event_id AS "eventId", source, rssi, detected_at AS "detectedAt", confidence FROM location_events WHERE asset_id=$1 ORDER BY detected_at DESC LIMIT 20', [id]);
  return res.json({ data: result.rows[0], history: history.rows });
});

app.post('/api/assets', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const parsed = assetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Revise os campos do equipamento.', details: parsed.error.flatten() });
  const a = parsed.data;
  if (await hasDuplicateAsset(a)) return res.status(409).json({ error: 'Possível duplicidade: patrimônio, número de série ou etiqueta já cadastrados.' });
  const department = await pool.query('SELECT 1 FROM departments WHERE id=$1 AND active=true', [a.departmentId]);
  if (!department.rowCount) return res.status(400).json({ error: 'O setor selecionado não foi encontrado ou está inativo.' });
  if (a.roomId && !a.departmentId) return res.status(400).json({ error: 'Selecione o setor antes de vincular um ambiente.' });
  if (a.departmentId && a.roomId) {
    const room = await pool.query('SELECT 1 FROM rooms WHERE id=$1 AND department_id=$2', [a.roomId, a.departmentId]);
    if (!room.rowCount) return res.status(400).json({ error: 'O ambiente selecionado não pertence ao setor informado.' });
  }
  try {
    const assetId = crypto.randomUUID();
    const qrCode = `HEOM-ASSET:${assetId}`;
    const result = await pool.query(`INSERT INTO assets(id, asset_number, official_property_number, name, category, description,
      manufacturer, model, serial_number, reference, department_id, room_id, operational_status, criticality, tracking_tag_id, qr_code, data_origin)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'INSTITUCIONAL') RETURNING id`,
      [assetId, a.assetNumber, a.officialPropertyNumber || null, a.name, a.category, a.description || null, a.manufacturer || null,
       a.model || null, a.serialNumber || null, a.reference || null, a.departmentId, a.roomId || null, a.operationalStatus, a.criticality, a.trackingTagId || null, qrCode]);
    const id = result.rows[0].id as string;
    await audit(req.user!.id, 'EQUIPAMENTO_CADASTRADO', 'ASSET', id, { assetNumber: a.assetNumber });
    broadcast('asset.created', { id, assetNumber: a.assetNumber });
    return res.status(201).json({ id, message: 'Equipamento cadastrado.' });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return res.status(409).json({ error: 'Já existe um equipamento com esse patrimônio, identificador ou etiqueta.' });
    throw error;
  }
});

app.put('/api/assets/:id', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const id = routeId(req);
  if (!id || !uuidSchema.safeParse(id).success) return res.status(400).json({ error: 'Identificador inválido.' });
  const parsed = assetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Revise os campos do equipamento.', details: parsed.error.flatten() });
  const a = parsed.data;
  if (await hasDuplicateAsset(a, id)) return res.status(409).json({ error: 'Possível duplicidade: patrimônio, número de série ou etiqueta já cadastrados.' });
  const department = await pool.query('SELECT 1 FROM departments WHERE id=$1 AND active=true', [a.departmentId]);
  if (!department.rowCount) return res.status(400).json({ error: 'O setor selecionado não foi encontrado ou está inativo.' });
  if (a.roomId && !a.departmentId) return res.status(400).json({ error: 'Selecione o setor antes de vincular um ambiente.' });
  if (a.departmentId && a.roomId) {
    const room = await pool.query('SELECT 1 FROM rooms WHERE id=$1 AND department_id=$2', [a.roomId, a.departmentId]);
    if (!room.rowCount) return res.status(400).json({ error: 'O ambiente selecionado não pertence ao setor informado.' });
  }
  try {
    const result = await pool.query(`UPDATE assets SET asset_number=$1, official_property_number=$2, name=$3, category=$4,
      description=$5, manufacturer=$6, model=$7, serial_number=$8, reference=$9, department_id=$10, room_id=$11, operational_status=$12,
      criticality=$13, tracking_tag_id=$14, updated_at=NOW() WHERE id=$15 AND archived_at IS NULL RETURNING id`,
      [a.assetNumber, a.officialPropertyNumber || null, a.name, a.category, a.description || null, a.manufacturer || null,
       a.model || null, a.serialNumber || null, a.reference || null, a.departmentId, a.roomId || null, a.operationalStatus, a.criticality, a.trackingTagId || null, id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Equipamento não encontrado.' });
    await audit(req.user!.id, 'EQUIPAMENTO_ATUALIZADO', 'ASSET', id, { assetNumber: a.assetNumber });
    broadcast('asset.updated', { id });
    return res.json({ message: 'Cadastro atualizado.' });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return res.status(409).json({ error: 'Já existe um equipamento com esse patrimônio, identificador ou etiqueta.' });
    throw error;
  }
});

app.post('/api/assets/:id/archive', authenticate, allowRoles('ADMIN', 'GESTOR'), async (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  const result = await pool.query('UPDATE assets SET archived_at=NOW(), updated_at=NOW() WHERE id=$1 AND archived_at IS NULL RETURNING id', [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  await audit(req.user!.id, 'EQUIPAMENTO_ARQUIVADO', 'ASSET', id);
  return res.json({ message: 'Equipamento arquivado. O histórico foi preservado.' });
});

// Identificação fotográfica: os arquivos ficam no disco local, e o PostgreSQL guarda apenas metadados.
app.get('/api/assets/:id/photos', authenticate, async (req, res) => {
  const id = routeId(req); if (!id || !uuidSchema.safeParse(id).success) return res.status(400).json({ error: 'Identificador inválido.' });
  const exists = await pool.query('SELECT 1 FROM assets WHERE id=$1 AND archived_at IS NULL', [id]);
  if (!exists.rowCount) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  const result = await pool.query(`SELECT id, asset_id AS "assetId", original_name AS "originalName", file_name AS "fileName", mime_type AS "mimeType", size_bytes AS "sizeBytes", image_role AS "imageRole", uploaded_by AS "uploadedBy", created_at AS "createdAt" FROM asset_photos WHERE asset_id=$1 AND archived_at IS NULL ORDER BY created_at DESC`, [id]);
  return res.json({ data: result.rows.map((photo) => ({ ...photo, fileUrl: `/api/assets/${id}/photos/${photo.id}/file` })) });
});
app.post('/api/assets/:id/photos', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), photoUpload.single('photo'), async (req, res) => {
  const id = routeId(req); if (!id || !uuidSchema.safeParse(id).success) return res.status(400).json({ error: 'Identificador inválido.' });
  const exists = await pool.query('SELECT 1 FROM assets WHERE id=$1 AND archived_at IS NULL', [id]);
  if (!exists.rowCount) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  if (!req.file) return res.status(400).json({ error: 'Selecione uma fotografia válida.' });
  try {
    const photo = await saveAssetPhoto({ assetId: id, file: req.file, uploadedBy: req.user!.id, imageRole: String(req.body.imageRole || 'EQUIPAMENTO') });
    try {
      await pool.query(`INSERT INTO asset_photos(id, asset_id, original_name, file_name, relative_path, mime_type, size_bytes, image_role, difference_hash, uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [photo.id, id, photo.originalName, photo.fileName, photo.relativePath, photo.mimeType, photo.sizeBytes, photo.imageRole, photo.dhash, req.user!.id]);
    } catch (error) { await deleteStoredPhoto(photo.relativePath).catch(() => undefined); throw error; }
    await audit(req.user!.id, 'FOTOGRAFIA_EQUIPAMENTO_ADICIONADA', 'ASSET', id, { photoId: photo.id, imageRole: photo.imageRole });
    broadcast('asset.photo.created', { assetId: id, photoId: photo.id });
    return res.status(201).json({ data: { id: photo.id, assetId: id, originalName: photo.originalName, mimeType: photo.mimeType, sizeBytes: photo.sizeBytes, imageRole: photo.imageRole, uploadedBy: photo.uploadedBy, createdAt: photo.createdAt, fileUrl: `/api/assets/${id}/photos/${photo.id}/file` } });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível armazenar a fotografia.' }); }
});
app.get('/api/assets/:id/photos/:photoId/file', authenticate, async (req, res) => {
  const id = routeId(req); const photoId = typeof req.params.photoId === 'string' ? req.params.photoId : '';
  const result = await pool.query('SELECT relative_path, mime_type FROM asset_photos WHERE id=$1 AND asset_id=$2 AND archived_at IS NULL', [photoId, id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Fotografia não encontrada.' });
  try { const buffer = await readStoredPhoto(result.rows[0].relative_path); res.setHeader('Content-Type', result.rows[0].mime_type); res.setHeader('Cache-Control', 'private, max-age=300'); return res.send(buffer); }
  catch { return res.status(404).json({ error: 'Arquivo da fotografia não está disponível no armazenamento local.' }); }
});
app.delete('/api/assets/:id/photos/:photoId', authenticate, allowRoles('ADMIN', 'GESTOR'), async (req, res) => {
  const id = routeId(req); const photoId = typeof req.params.photoId === 'string' ? req.params.photoId : '';
  const result = await pool.query('UPDATE asset_photos SET archived_at=NOW() WHERE id=$1 AND asset_id=$2 AND archived_at IS NULL RETURNING id', [photoId, id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Fotografia não encontrada.' });
  await audit(req.user!.id, 'FOTOGRAFIA_EQUIPAMENTO_REMOVIDA', 'ASSET', id, { photoId });
  return res.json({ message: 'Fotografia removida. O histórico de auditoria foi preservado.' });
});
app.post('/api/assets/:id/photos/:photoId/ocr', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), (_req, res) => {
  return res.status(410).json({ error: 'O OCR no servidor foi descontinuado. Utilize o módulo compartilhado plate-ocr.ts no navegador; fotografias de plaquetas não são enviadas para um executável externo.' });
});
app.get('/api/assets/:id/ocr', authenticate, async (req, res) => {
  const id = routeId(req); if (!id || !uuidSchema.safeParse(id).success) return res.status(400).json({ error: 'Identificador inválido.' });
  const result = await pool.query(`SELECT id, photo_id AS "photoId", status, raw_text AS "rawText", extracted_fields AS fields, confidence, review_status AS "reviewStatus", created_at AS "createdAt" FROM asset_ocr_results WHERE asset_id=$1 ORDER BY created_at DESC`, [id]);
  return res.json({ data: result.rows });
});
app.post('/api/assets/:id/ocr/:resultId/confirm', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const id = routeId(req); const resultId = typeof req.params.resultId === 'string' ? req.params.resultId : '';
  const parsed = z.object({ manufacturer: z.string().trim().max(140).optional().nullable(), model: z.string().trim().max(140).optional().nullable(), serialNumber: z.string().trim().max(140).optional().nullable(), replaceExisting: z.boolean().default(false) }).safeParse(req.body);
  if (!id || !parsed.success) return res.status(400).json({ error: 'Dados de confirmação inválidos.' });
  if (parsed.data.replaceExisting && !['ADMIN','GESTOR'].includes(req.user!.role)) return res.status(403).json({ error: 'Somente gestor ou administrador pode substituir informação já cadastrada.' });
  const result = await pool.query('SELECT id FROM asset_ocr_results WHERE id=$1 AND asset_id=$2', [resultId, id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Resultado OCR não encontrado.' });
  const current = await pool.query('SELECT manufacturer, model, serial_number FROM assets WHERE id=$1 AND archived_at IS NULL', [id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  const row = current.rows[0];
  if (parsed.data.serialNumber?.trim()) { const duplicateSerial = await pool.query(`SELECT 1 FROM assets WHERE archived_at IS NULL AND id<>$1 AND lower(COALESCE(serial_number,''))=lower($2) LIMIT 1`, [id, parsed.data.serialNumber.trim()]); if (duplicateSerial.rowCount) return res.status(409).json({ error: 'O número de série informado já está vinculado a outro equipamento.' }); }
  for (const [field, value, oldValue] of [['fabricante', parsed.data.manufacturer, row.manufacturer], ['modelo', parsed.data.model, row.model], ['número de série', parsed.data.serialNumber, row.serial_number]] as const) {
    if (value && oldValue && value !== oldValue && !parsed.data.replaceExisting) return res.status(409).json({ error: `O campo ${field} já está preenchido. Um gestor precisa autorizar a substituição.` });
  }
  await pool.query(`UPDATE assets SET manufacturer=COALESCE($1,manufacturer), model=COALESCE($2,model), serial_number=COALESCE($3,serial_number), updated_at=NOW() WHERE id=$4`, [parsed.data.manufacturer || null, parsed.data.model || null, parsed.data.serialNumber || null, id]);
  await pool.query(`UPDATE asset_ocr_results SET reviewed_by=$1, reviewed_at=NOW(), review_status='CONFIRMADO' WHERE id=$2`, [req.user!.id, resultId]);
  await audit(req.user!.id, 'OCR_DADOS_CONFIRMADOS', 'ASSET', id, { resultId }); broadcast('asset.updated', { id });
  return res.json({ message: 'Dados revisados e confirmados no cadastro do equipamento.' });
});
app.post('/api/assets/search-by-image', authenticate, photoUpload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Selecione uma fotografia para pesquisar.' });
  try {
    const { createDifferenceHash } = await import('./media.js'); const queryHash = await createDifferenceHash(req.file.buffer);
    const photos = await pool.query(`SELECT p.id AS "photoId", p.difference_hash AS dhash, p.asset_id AS "assetId", a.asset_number AS "assetNumber", a.name, a.manufacturer, a.model, a.department_id AS "departmentId" FROM asset_photos p JOIN assets a ON a.id=p.asset_id WHERE a.archived_at IS NULL AND p.archived_at IS NULL`);
    const ranked = photos.rows.map((photo) => { const match = compareDifferenceHash(queryHash, photo.dhash); return { ...photo, similarity: Number(match.similarity.toFixed(4)), confidence: similarityLabel(match.similarity), fileUrl: `/api/assets/${photo.assetId}/photos/${photo.photoId}/file` }; }).sort((a, b) => b.similarity - a.similarity).slice(0, 10);
    return res.json({ data: ranked, method: 'HASH_VISUAL_DHASH', disclaimer: 'Hash visual perceptual: os resultados indicam semelhança aproximada e não confirmam identidade. Verifique patrimônio, plaqueta e número de série.' });
  } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível comparar a imagem.' }); }
});
app.get('/api/assets/:id/qr.svg', authenticate, async (req, res) => {
  const id = routeId(req); const result = await pool.query('SELECT id, asset_number, qr_code FROM assets WHERE id=$1 AND archived_at IS NULL', [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  try { const svg = await makeQrSvg(result.rows[0].qr_code || `HEOM-ASSET:${result.rows[0].id}`); res.type('image/svg+xml').setHeader('Cache-Control', 'private, max-age=300'); return res.send(svg); }
  catch { return res.status(500).json({ error: 'Não foi possível gerar o QR Code.' }); }
});
app.get('/api/assets/:id/qr.png', authenticate, async (req, res) => {
  const id = routeId(req);
  const result = await pool.query('SELECT id, qr_code FROM assets WHERE id=$1 AND archived_at IS NULL', [id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  try { const png = await makeQrPng(result.rows[0].qr_code || `HEOM-ASSET:${result.rows[0].id}`); res.type('png').setHeader('Cache-Control', 'private, max-age=300'); return res.send(png); }
  catch { return res.status(500).json({ error: 'Não foi possível gerar o QR Code PNG.' }); }
});
app.get('/api/imports/inventory-template.csv', authenticate, (_req, res) => {
  const headers = ['Patrimônio','Nome','Categoria','Fabricante','Modelo','Número de série','Referência','Patrimônio oficial','Setor','Ambiente','Situação','Criticidade'];
  const csv = '\ufeff' + headers.map((value) => `"${value.replace(/"/g, '""')}"`).join(';') + '\r\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="modelo-importacao-heom.csv"');
  return res.send(csv);
});

app.post('/api/imports/inventory-csv', authenticate, allowRoles('ADMIN','GESTOR','OPERADOR'), csvUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Selecione um arquivo CSV.' });
  let rows: InventoryCsvRow[];
  try { rows = parseInventoryCsv(req.file.buffer.toString('utf8')); }
  catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Não foi possível interpretar o CSV.' }); }
  const issues: Array<{ row: number; errors: string[] }> = [];
  const duplicateRows = findCsvDuplicates(rows);
  const normalize = (value: string | null | undefined) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
  const [departmentsResult, roomsResult] = await Promise.all([
    pool.query('SELECT id, code, name FROM departments WHERE active=true'),
    pool.query('SELECT id, code, name, department_id AS "departmentId" FROM rooms')
  ]);
  const mapped: Array<{ rowNumber: number; row: (typeof rows)[number]; departmentId: string | null; roomId: string | null }> = [];
  for (const row of rows) {
    const errors = [...row.errors, ...(duplicateRows.get(row.rowNumber) || [])];
    const department = row.department ? departmentsResult.rows.find((item) => normalize(item.code) === normalize(row.department) || normalize(item.name) === normalize(row.department)) : undefined;
    if (row.department && !department) errors.push(`Setor não encontrado: ${row.department}.`);
    const room = row.room ? roomsResult.rows.find((item) => normalize(item.code) === normalize(row.room) || normalize(item.name) === normalize(row.room)) : undefined;
    if (row.room && !room) errors.push(`Ambiente não encontrado: ${row.room}.`);
    if (room && department && room.departmentId !== department.id) errors.push('O ambiente informado não pertence ao setor selecionado.');
    if (room && !department) errors.push('Informe também o setor do ambiente.');
    mapped.push({ rowNumber: row.rowNumber, row, departmentId: department?.id || null, roomId: room?.id || null });
    if (errors.length) issues.push({ row: row.rowNumber, errors });
  }
  const assetNumbers = rows.map((row) => row.assetNumber.trim());
  const propertyNumbers = rows.map((row) => row.officialPropertyNumber).filter((value): value is string => Boolean(value));
  const serialNumbers = rows.map((row) => row.serialNumber).filter((value): value is string => Boolean(value));
  const existing = await pool.query(`SELECT asset_number AS "assetNumber", official_property_number AS "officialPropertyNumber", serial_number AS "serialNumber" FROM assets WHERE archived_at IS NULL AND (lower(asset_number) = ANY($1::text[]) OR lower(COALESCE(official_property_number,'')) = ANY($2::text[]) OR lower(COALESCE(serial_number,'')) = ANY($3::text[]))`, [assetNumbers.map((value) => normalize(value)), propertyNumbers.map((value) => normalize(value)), serialNumbers.map((value) => normalize(value))]);
  for (const match of existing.rows) {
    const row = rows.find((item) => normalize(item.assetNumber) === normalize(match.assetNumber) || (item.officialPropertyNumber && normalize(item.officialPropertyNumber) === normalize(match.officialPropertyNumber)) || (item.serialNumber && normalize(item.serialNumber) === normalize(match.serialNumber)));
    if (row) issues.push({ row: row.rowNumber, errors: [`Identificador já cadastrado no inventário: ${match.assetNumber}.`] });
  }
  if (issues.length) return res.status(422).json({ error: 'A importação não foi aplicada. Corrija as linhas informadas e envie novamente.', data: { totalRows: rows.length, imported: 0, errors: issues } });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of mapped) {
      const row = item.row;
      await client.query(`WITH generated AS (SELECT gen_random_uuid() AS id)
        INSERT INTO assets(id, asset_number, official_property_number, name, category, manufacturer, model, serial_number, reference, department_id, room_id, operational_status, criticality, tracking_status, qr_code, data_origin)
        SELECT generated.id,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'RASTREAMENTO_DESATIVADO','HEOM-ASSET:' || generated.id::text,'INSTITUCIONAL' FROM generated`,
        [row.assetNumber,row.officialPropertyNumber,row.name,row.category,row.manufacturer,row.model,row.serialNumber,row.reference,item.departmentId,item.roomId,row.operationalStatus,row.criticality]);
    }
    await client.query(`INSERT INTO audit_logs(action,entity_type,entity_id,details) VALUES('INVENTARIO_IMPORTADO_CSV','IMPORT',NULL,$1)`, [JSON.stringify({ imported: mapped.length, fileName: req.file.originalname })]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  broadcast('inventory.imported', { count: mapped.length });
  return res.status(201).json({ message: `${mapped.length} equipamento(s) importado(s) para o inventário institucional.`, data: { totalRows: rows.length, imported: mapped.length, errors: [] } });
});

app.get('/api/maintenance', authenticate, async (req, res) => {
  const status = String(req.query.status || '');
  const result = await pool.query(`SELECT m.*, m.asset_id AS "assetId", m.order_type AS "orderType", m.scheduled_at AS "scheduledAt", m.due_at AS "dueAt", m.responsible_name AS "responsibleName", m.created_at AS "createdAt", m.updated_at AS "updatedAt", a.name AS "assetName", a.asset_number AS "assetNumber" FROM maintenance_orders m JOIN assets a ON a.id=m.asset_id WHERE ($1='' OR m.status=$1) ORDER BY m.created_at DESC LIMIT 500`, [status]);
  return res.json({ data: result.rows });
});
app.post('/api/maintenance', authenticate, allowRoles('ADMIN','GESTOR','OPERADOR'), async (req, res) => {
  const parsed = z.object({ assetId: uuidSchema, orderType: z.enum(['PREVENTIVA','CORRETIVA','CALIBRACAO','INSPECAO']), title: z.string().trim().min(3).max(180), description: z.string().trim().min(5).max(3000), priority: z.enum(['BAIXA','MEDIA','ALTA','CRITICA']).default('MEDIA'), scheduledAt: z.string().datetime().optional().nullable(), dueAt: z.string().datetime().optional().nullable(), responsibleName: z.string().trim().max(140).optional().nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Preencha os dados da ordem de serviço.' });
  const a = await pool.query('SELECT id, operational_status FROM assets WHERE id=$1 AND archived_at IS NULL', [parsed.data.assetId]);
  if (!a.rowCount) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  const d = parsed.data;
  const result = await pool.query(`INSERT INTO maintenance_orders(asset_id,order_type,title,description,priority,status,scheduled_at,due_at,responsible_name,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [d.assetId,d.orderType,d.title,d.description,d.priority,d.scheduledAt?'PROGRAMADA':'ABERTA',d.scheduledAt||null,d.dueAt||null,d.responsibleName||null,req.user!.id]);
  if (d.orderType === 'CORRETIVA') await pool.query(`UPDATE assets SET operational_status='EM_MANUTENCAO', updated_at=NOW() WHERE id=$1 AND operational_status='EM_OPERACAO'`, [d.assetId]);
  await audit(req.user!.id, 'ORDEM_MANUTENCAO_CRIADA', 'MAINTENANCE', result.rows[0].id, { assetId: d.assetId }); broadcast('maintenance.created', { id: result.rows[0].id, assetId: d.assetId });
  return res.status(201).json({ id: result.rows[0].id, message: 'Ordem de serviço registrada.' });
});
app.patch('/api/maintenance/:id/status', authenticate, allowRoles('ADMIN','GESTOR','OPERADOR'), async (req, res) => {
  const id = routeId(req); const parsed = z.object({ status: z.enum(['EM_ANDAMENTO','AGUARDANDO_PECA','CONCLUIDA','CANCELADA']), completionNotes: z.string().trim().max(3000).optional() }).safeParse(req.body);
  if (!id || !uuidSchema.safeParse(id).success || !parsed.success) return res.status(400).json({ error: 'Dados de atualização inválidos.' });
  const updated = await pool.query(`UPDATE maintenance_orders SET status=$1, completion_notes=COALESCE($2,completion_notes), started_at=CASE WHEN $1='EM_ANDAMENTO' THEN COALESCE(started_at,NOW()) ELSE started_at END, completed_at=CASE WHEN $1='CONCLUIDA' THEN NOW() ELSE completed_at END, updated_at=NOW() WHERE id=$3 RETURNING id, asset_id, order_type`, [parsed.data.status,parsed.data.completionNotes||null,id]);
  if (!updated.rowCount) return res.status(404).json({ error: 'Ordem de serviço não encontrada.' });
  if (['CONCLUIDA','CANCELADA'].includes(parsed.data.status) && updated.rows[0].order_type === 'CORRETIVA') await pool.query(`UPDATE assets SET operational_status='EM_OPERACAO', updated_at=NOW() WHERE id=$1 AND operational_status='EM_MANUTENCAO' AND NOT EXISTS(SELECT 1 FROM maintenance_orders WHERE asset_id=$1 AND id<>$2 AND order_type='CORRETIVA' AND status NOT IN ('CONCLUIDA','CANCELADA'))`, [updated.rows[0].asset_id,id]);
  await audit(req.user!.id, `ORDEM_MANUTENCAO_${parsed.data.status}`, 'MAINTENANCE', id); broadcast('maintenance.updated', { id, status: parsed.data.status });
  return res.json({ message: 'Ordem de serviço atualizada.' });
});
app.get('/api/reports/inventory.csv', authenticate, async (_req, res) => {
  const result = await pool.query(`SELECT a.asset_number, a.name, a.category, a.manufacturer, a.model, a.serial_number, a.reference, d.name AS department_name, r.name AS room_name, a.operational_status, a.criticality, a.data_origin FROM assets a LEFT JOIN departments d ON d.id=a.department_id LEFT JOIN rooms r ON r.id=a.room_id WHERE a.archived_at IS NULL ORDER BY a.asset_number`);
  const columns = ['Patrimônio','Nome','Categoria','Fabricante','Modelo','Número de série','Referência','Setor','Ambiente','Situação','Criticidade','Origem'];
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g,'""')}"`;
  const rows = result.rows.map((r) => [r.asset_number,r.name,r.category,r.manufacturer,r.model,r.serial_number,r.reference,r.department_name,r.room_name,r.operational_status,r.criticality,r.data_origin]);
  res.setHeader('Content-Type','text/csv; charset=utf-8'); res.setHeader('Content-Disposition','attachment; filename="inventario-heom.csv"'); return res.send('\ufeff'+[columns,...rows].map((row)=>row.map(escape).join(';')).join('\r\n'));
});

app.get('/api/movements', authenticate, async (_req, res) => {
  const result = await pool.query(`SELECT m.id, m.reason, m.movement_type AS "movementType", m.status,
    m.requested_at AS "requestedAt", m.expected_return_at AS "expectedReturnAt", a.name AS "assetName", a.asset_number AS "assetNumber",
    od.name AS "originDepartment", dd.name AS "destinationDepartment", u.name AS "requesterName", approver.name AS "approverName"
    FROM movement_requests m JOIN assets a ON a.id=m.asset_id
    LEFT JOIN departments od ON od.id=m.origin_department_id JOIN departments dd ON dd.id=m.destination_department_id
    JOIN users u ON u.id=m.requested_by LEFT JOIN users approver ON approver.id=m.approved_by
    ORDER BY CASE m.status WHEN 'PENDENTE' THEN 0 ELSE 1 END, m.requested_at DESC LIMIT 300`);
  res.json({ data: result.rows });
});

app.post('/api/movements', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const parsed = z.object({ assetId: uuidSchema, destinationDepartmentId: uuidSchema, destinationRoomId: uuidSchema.optional().nullable(),
    reason: z.string().trim().min(5).max(1000), movementType: z.enum(['TEMPORARIA', 'PERMANENTE', 'MANUTENCAO', 'EMERGENCIAL']), expectedReturnAt: z.string().datetime().optional().nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Preencha equipamento, destino e justificativa.' });
  const m = parsed.data;
  const asset = await pool.query('SELECT id, department_id, room_id FROM assets WHERE id=$1 AND archived_at IS NULL', [m.assetId]);
  if (!asset.rowCount) return res.status(404).json({ error: 'Equipamento não encontrado.' });
  if (m.destinationRoomId) {
    const room = await pool.query('SELECT 1 FROM rooms WHERE id=$1 AND department_id=$2', [m.destinationRoomId, m.destinationDepartmentId]);
    if (!room.rowCount) return res.status(400).json({ error: 'O ambiente de destino não pertence ao setor selecionado.' });
  }
  const result = await pool.query(`INSERT INTO movement_requests(asset_id, origin_department_id, destination_department_id,
    origin_room_id, destination_room_id, requested_by, reason, movement_type, expected_return_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [m.assetId, asset.rows[0].department_id, m.destinationDepartmentId, asset.rows[0].room_id, m.destinationRoomId || null,
     req.user!.id, m.reason, m.movementType, m.expectedReturnAt || null]);
  const id = result.rows[0].id as string;
  await audit(req.user!.id, 'MOVIMENTACAO_SOLICITADA', 'MOVEMENT', id, { assetId: m.assetId });
  broadcast('movement.created', { id });
  return res.status(201).json({ id, message: 'Solicitação registrada e aguardando aprovação.' });
});

app.patch('/api/movements/:id/status', authenticate, allowRoles('ADMIN', 'GESTOR'), async (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  const parsed = z.object({ status: z.enum(['APROVADA', 'REJEITADA', 'CONCLUIDA']), note: z.string().max(500).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Situação solicitada inválida.' });
  const current = await pool.query('SELECT * FROM movement_requests WHERE id=$1', [id]);
  if (!current.rowCount) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  const row = current.rows[0];
  const next = parsed.data.status;
  const valid = canTransitionMovement(row.status, next);
  if (!valid) return res.status(409).json({ error: 'Essa transição não é permitida para a situação atual.' });
  await pool.query(`UPDATE movement_requests SET status=$1, approved_by=CASE WHEN $1 IN ('APROVADA','REJEITADA') THEN $2 ELSE approved_by END,
    approved_at=CASE WHEN $1 IN ('APROVADA','REJEITADA') THEN NOW() ELSE approved_at END,
    completed_at=CASE WHEN $1='CONCLUIDA' THEN NOW() ELSE completed_at END, updated_at=NOW() WHERE id=$3`, [next, req.user!.id, id]);
  if (next === 'CONCLUIDA') {
    await pool.query('UPDATE assets SET department_id=$1, room_id=$2, updated_at=NOW() WHERE id=$3', [row.destination_department_id, row.destination_room_id, row.asset_id]);
  }
  await audit(req.user!.id, `MOVIMENTACAO_${next}`, 'MOVEMENT', id, { note: parsed.data.note || null });
  broadcast('movement.updated', { id, status: next });
  return res.json({ message: `Movimentação ${next.toLowerCase()} com sucesso.` });
});

app.get('/api/alerts', authenticate, async (req, res) => {
  const status = String(req.query.status || '');
  const values: unknown[] = [];
  let filter = '';
  if (['ABERTO', 'RECONHECIDO', 'RESOLVIDO'].includes(status)) { values.push(status); filter = `WHERE al.status=$1`; }
  const result = await pool.query(`SELECT al.id, al.alert_type AS "alertType", al.severity, al.title, al.description, al.status,
    al.created_at AS "createdAt", al.acknowledged_at AS "acknowledgedAt", a.name AS "assetName", a.asset_number AS "assetNumber",
    u.name AS "acknowledgedByName"
    FROM alerts al LEFT JOIN assets a ON a.id=al.asset_id LEFT JOIN users u ON u.id=al.acknowledged_by
    ${filter} ORDER BY CASE al.severity WHEN 'CRITICO' THEN 0 WHEN 'ALTO' THEN 1 WHEN 'ATENCAO' THEN 2 ELSE 3 END, al.created_at DESC LIMIT 300`, values);
  res.json({ data: result.rows });
});

app.patch('/api/alerts/:id/status', authenticate, allowRoles('ADMIN', 'GESTOR', 'OPERADOR'), async (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  const parsed = z.object({ status: z.enum(['RECONHECIDO', 'RESOLVIDO']), note: z.string().trim().max(1000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Situação inválida.' });
  const result = await pool.query(`UPDATE alerts SET status=$1,
    acknowledged_by=CASE WHEN $1='RECONHECIDO' THEN $2 ELSE acknowledged_by END,
    acknowledged_at=CASE WHEN $1='RECONHECIDO' THEN NOW() ELSE acknowledged_at END,
    resolved_by=CASE WHEN $1='RESOLVIDO' THEN $2 ELSE resolved_by END,
    resolved_at=CASE WHEN $1='RESOLVIDO' THEN NOW() ELSE resolved_at END,
    resolution_note=COALESCE($3,resolution_note) WHERE id=$4 AND status <> 'RESOLVIDO' RETURNING id`,
    [parsed.data.status, req.user!.id, parsed.data.note || null, id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Alerta não encontrado ou já resolvido.' });
  await audit(req.user!.id, `ALERTA_${parsed.data.status}`, 'ALERT', id, { note: parsed.data.note || null });
  broadcast('alert.updated', { id, status: parsed.data.status });
  return res.json({ message: 'Alerta atualizado.' });
});

app.get('/api/floor-plan', authenticate, async (_req, res) => {
  const rooms = await pool.query(`SELECT r.id, r.code, r.name, r.floor_label AS "floorLabel", r.is_restricted AS "isRestricted",
    r.map_x AS x, r.map_y AS y, d.name AS "departmentName", r.data_origin AS "dataOrigin",
    COUNT(a.id)::int AS "assetCount" FROM rooms r LEFT JOIN departments d ON d.id=r.department_id
    LEFT JOIN assets a ON a.last_room_id=r.id AND a.archived_at IS NULL GROUP BY r.id,d.name ORDER BY r.name`);
  res.json({ data: rooms.rows, planStatus: 'PLANTA_ILUSTRATIVA_AGUARDANDO_VALIDACAO', message: 'Esquema demonstrativo. Substitua pela planta arquitetônica oficial aprovada pela instituição.' });
});

app.get('/api/gateways', authenticate, allowRoles('ADMIN', 'GESTOR'), async (_req, res) => {
  const result = await pool.query(`SELECT g.id, g.code, g.name, g.status, g.last_seen_at AS "lastSeenAt", r.name AS "roomName", g.data_origin AS "dataOrigin"
    FROM gateways g LEFT JOIN rooms r ON r.id=g.room_id ORDER BY g.name`);
  res.json({ data: result.rows, mqttConnected: mqttClient.connected });
});

app.post('/api/simulator/observation', authenticate, allowRoles('ADMIN', 'GESTOR'), async (req, res) => {
  if (process.env.DEMO_MODE !== 'true') return res.status(403).json({ error: 'O modo de demonstração está desativado.' });
  if (!mqttClient.connected) return res.status(503).json({ error: 'O serviço local de rastreamento MQTT ainda não está conectado.' });
  const parsed = z.object({ tagId: z.string().min(2).max(140), gatewayCode: z.string().min(2).max(80), rssi: z.number().int().min(-120).max(0).default(-65) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Etiqueta ou gateway inválido.' });
  const event = { eventId: crypto.randomUUID(), source: 'SIMULATED', ...parsed.data, detectedAt: new Date().toISOString() };
  mqttClient.publish(mqttTopic, JSON.stringify(event), { qos: 1 }, (error) => {
    if (error) console.error('[MQTT] Falha ao publicar evento simulado:', error.message);
  });
  await audit(req.user!.id, 'EVENTO_RASTREAMENTO_SIMULADO', 'TRACKING_EVENT', null, { tagId: event.tagId, gatewayCode: event.gatewayCode });
  return res.status(202).json({ message: 'Observação enviada ao processamento local.', eventId: event.eventId });
});

app.get('/api/notifications', authenticate, async (req, res) => {
  const result = await pool.query(`SELECT id, title, message, severity, read_at AS "readAt", created_at AS "createdAt"
    FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [req.user!.id]);
  res.json({ data: result.rows });
});

app.post('/api/notifications/:id/read', authenticate, async (req, res) => {
  const id = routeId(req);
  if (!id) return res.status(400).json({ error: 'Identificador inválido.' });
  const result = await pool.query('UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING id,read_at AS "readAt"', [id, req.user!.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Notificação não encontrada para este usuário.' });
  await audit(req.user!.id, 'NOTIFICACAO_MARCADA_COMO_LIDA', 'NOTIFICATION', id);
  return res.json({ message: 'Notificação marcada como lida.', data: result.rows[0] });
});

app.get('/api/admin/users', authenticate, allowRoles('ADMIN'), async (_req, res) => {
  const result = await pool.query('SELECT id, name, email, role, active, created_at AS "createdAt" FROM users ORDER BY name');
  res.json({ data: result.rows });
});

app.post('/api/admin/users', authenticate, allowRoles('ADMIN'), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(3).max(140), email: z.string().email(), password: z.string().min(12).max(128), role: z.enum(['ADMIN','GESTOR','OPERADOR','CONSULTA']) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Revise nome, e-mail, perfil e senha (mínimo de 12 caracteres).' });
  const hash = await bcrypt.hash(parsed.data.password, 12);
  try {
    const result = await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role,active',
      [parsed.data.name, parsed.data.email.toLowerCase(), hash, parsed.data.role]);
    await audit(req.user!.id, 'USUARIO_CADASTRADO', 'USER', result.rows[0].id, { role: parsed.data.role });
    return res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return res.status(409).json({ error: 'Já existe um usuário com esse e-mail.' });
    throw error;
  }
});

mqttClient.on('connect', () => {
  console.log('[MQTT] Conectado ao broker local.');
  mqttClient.subscribe(mqttTopic, { qos: 1 });
});
mqttClient.on('reconnect', () => console.log('[MQTT] Tentando restabelecer conexão local...'));
mqttClient.on('error', (error) => console.warn('[MQTT] Serviço indisponível:', error.message));

async function processObservation(payload: Buffer) {
  const parsed = z.object({ eventId: z.string().min(8).max(120), source: z.enum(['SIMULATED', 'HARDWARE']),
    tagId: z.string().min(2).max(140), gatewayCode: z.string().min(2).max(80), rssi: z.number().int().min(-120).max(0), detectedAt: z.string().datetime() }).safeParse(JSON.parse(payload.toString()));
  if (!parsed.success) { console.warn('[Rastreamento] Evento MQTT descartado por formato inválido.'); return; }
  const event = parsed.data;
  const lookup = await pool.query(`SELECT a.id AS asset_id, a.asset_number, a.name AS asset_name, a.department_id AS assigned_department_id,
    g.id AS gateway_id, g.room_id, r.department_id AS detected_department_id, r.name AS room_name, d.name AS detected_department_name
    FROM assets a JOIN gateways g ON g.code=$2 LEFT JOIN rooms r ON r.id=g.room_id
    LEFT JOIN departments d ON d.id=r.department_id WHERE a.tracking_tag_id=$1 AND a.archived_at IS NULL`, [event.tagId, event.gatewayCode]);
  if (!lookup.rowCount) { console.warn(`[Rastreamento] Etiqueta ou gateway sem cadastro: ${event.tagId}/${event.gatewayCode}`); return; }
  const found = lookup.rows[0];
  const client = await pool.connect();
  let committedAlertId: string | null = null;
  try {
    await client.query('BEGIN');
    const inserted = await client.query(`INSERT INTO location_events(event_id,asset_id,gateway_id,room_id,rssi,confidence,source,detected_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(event_id) DO NOTHING RETURNING id`,
      [event.eventId, found.asset_id, found.gateway_id, found.room_id, event.rssi, found.room_id ? 'ESTIMADA' : 'INDETERMINADA', event.source, event.detectedAt]);
    if (!inserted.rowCount) { await client.query('ROLLBACK'); return; }
    const eventDbId = inserted.rows[0].id;
    await client.query(`UPDATE assets SET last_detected_at=$1, last_room_id=COALESCE($2,last_room_id),
      tracking_status=$3, updated_at=NOW()
      WHERE id=$4 AND (last_detected_at IS NULL OR last_detected_at <= $1)`, [event.detectedAt, found.room_id, trackingStatusForObservation(Boolean(found.room_id)), found.asset_id]);
    await client.query(`UPDATE gateways SET status='ONLINE', last_seen_at=GREATEST(COALESCE(last_seen_at,$1),$1) WHERE id=$2`, [event.detectedAt, found.gateway_id]);

    const differentDepartment = found.detected_department_id && found.assigned_department_id && found.detected_department_id !== found.assigned_department_id;
    if (differentDepartment) {
      const authorization = await client.query(`SELECT 1 FROM movement_requests WHERE asset_id=$1 AND destination_department_id=$2
        AND status='APROVADA' AND (expected_return_at IS NULL OR expected_return_at > NOW()) LIMIT 1`, [found.asset_id, found.detected_department_id]);
      if (!authorization.rowCount) {
        const existing = await client.query(`SELECT id FROM alerts WHERE asset_id=$1 AND alert_type='MOVIMENTO_FORA_DO_SETOR' AND status <> 'RESOLVIDO' LIMIT 1`, [found.asset_id]);
        if (!existing.rowCount) {
          const created = await client.query(`INSERT INTO alerts(asset_id,location_event_id,alert_type,severity,title,description)
            VALUES($1,$2,'MOVIMENTO_FORA_DO_SETOR','ALTO','Equipamento detectado fora do setor de referência',$3) RETURNING id`,
            [found.asset_id, eventDbId, `${found.asset_name} (${found.asset_number}) foi detectado em ${found.detected_department_name || 'setor não identificado'}. A ocorrência precisa ser verificada; não representa, por si só, evidência de irregularidade.`]);
          committedAlertId = created.rows[0].id as string;
          await client.query(`INSERT INTO notifications(user_id,title,message,severity)
            SELECT id,'Movimentação para verificação',$1,'ALTO' FROM users WHERE active=true AND role IN ('ADMIN','GESTOR')`,
            [`${found.asset_name} foi detectado fora do setor de referência.`]);
        }
      }
    }
    await client.query(`INSERT INTO audit_logs(action,entity_type,entity_id,details)
      VALUES('DETECCAO_DE_RASTREAMENTO','ASSET',$1,$2)`, [found.asset_id, JSON.stringify({ source: event.source, gatewayCode: event.gatewayCode, eventId: event.eventId })]);
    await client.query('COMMIT');
    if (committedAlertId) broadcast('alert.created', { id: committedAlertId, assetId: found.asset_id, severity: 'ALTO' });
    broadcast('asset.location.updated', { assetId: found.asset_id, roomId: found.room_id, detectedAt: event.detectedAt, confidence: found.room_id ? 'ESTIMADA' : 'INDETERMINADA' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Rastreamento] Falha ao processar evento:', error);
  } finally { client.release(); }
}

mqttClient.on('message', (topic, payload) => {
  if (topic === mqttTopic) void processObservation(payload).catch((error) => console.error('[MQTT] Erro no processador:', error));
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Falha inesperada.';
  if (/File too large|Formato inválido|Unexpected field|Too many files/.test(message)) return res.status(400).json({ error: message.includes('File too large') ? `A imagem excede o limite de ${maxAssetPhotoMb} MB.` : message });
  console.error('[API institucional]', error); return res.status(500).json({ error: 'Não foi possível concluir a operação local.' });
});

server.listen(port, () => console.log(`[HEOM] API local disponível em http://localhost:${port}`));

async function shutdown() {
  console.log('[HEOM] Encerrando serviços locais...');
  mqttClient.end(true);
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
