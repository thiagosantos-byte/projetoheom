import './env.js';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';

async function main() {
  const name = process.env.INITIAL_ADMIN_NAME || 'Administrador local';
  const email = (process.env.INITIAL_ADMIN_EMAIL || 'admin@heom.local').toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('Defina INITIAL_ADMIN_PASSWORD com pelo menos 12 caracteres no arquivo .env.');
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users(name, email, password_hash, role)
     VALUES ($1, $2, $3, 'ADMIN')
     ON CONFLICT (email) DO NOTHING`, [name, email, passwordHash]
  );

  if (process.env.DEMO_MODE === 'true') {
    const departments = [
      ['DEMO-UTI', 'UTI — exemplo demonstrativo', 'Setor fictício para testes. Não representa cadastro oficial do HEOM.'],
      ['DEMO-ENG', 'Engenharia Clínica — exemplo', 'Setor fictício para testes.'],
      ['DEMO-ENF', 'Enfermaria — exemplo demonstrativo', 'Setor fictício para testes.'],
      ['DEMO-ALM', 'Almoxarifado — exemplo demonstrativo', 'Setor fictício para testes.']
    ];
    for (const [code, depName, description] of departments) {
      await pool.query(
        `INSERT INTO departments(code, name, description, data_origin)
         VALUES ($1, $2, $3, 'SIMULADO') ON CONFLICT (code) DO NOTHING`,
        [code, depName, description]
      );
    }
    const deps = await pool.query(`SELECT id, code FROM departments WHERE code LIKE 'DEMO-%'`);
    const byCode = new Map<string, string>(deps.rows.map((row: { id: string; code: string }) => [row.code, row.id] as const));
    const roomSeeds = [
      ['DEMO-SALA-UTI', 'Sala demonstrativa UTI', 'DEMO-UTI', true],
      ['DEMO-SALA-ENG', 'Bancada demonstrativa', 'DEMO-ENG', false],
      ['DEMO-SALA-ENF', 'Sala demonstrativa enfermaria', 'DEMO-ENF', false],
      ['DEMO-SALA-ALM', 'Área demonstrativa de guarda', 'DEMO-ALM', false]
    ] as const;
    for (const [code, roomName, depCode, restricted] of roomSeeds) {
      await pool.query(
        `INSERT INTO rooms(code, name, department_id, floor_label, is_restricted, data_origin)
         VALUES ($1, $2, $3, 'Pavimento ilustrativo', $4, 'SIMULADO') ON CONFLICT (code) DO NOTHING`,
        [code, roomName, byCode.get(depCode), restricted]
      );
    }
    const rooms = await pool.query(`SELECT id, code, department_id FROM rooms WHERE code LIKE 'DEMO-SALA-%'`);
    const roomByCode = new Map<string, { id: string; code: string; department_id: string }>(rooms.rows.map((row: { id: string; code: string; department_id: string }) => [row.code, row] as const));
    await pool.query(
      `INSERT INTO gateways(code, name, room_id, status, data_origin)
       VALUES ('DEMO-GW-01', 'Gateway demonstrativo 01', $1, 'SEM_COMUNICACAO', 'SIMULADO')
       ON CONFLICT (code) DO NOTHING`, [roomByCode.get('DEMO-SALA-UTI')?.id]
    );
    const assets = [
      ['SIM-HEOM-001', 'Monitor multiparamétrico demonstrativo', 'Monitorização', 'DEMO-UTI', 'DEMO-SALA-UTI', 'TAG-DEMO-001'],
      ['SIM-HEOM-002', 'Bomba de infusão demonstrativa', 'Infusão', 'DEMO-UTI', 'DEMO-SALA-UTI', 'TAG-DEMO-002'],
      ['SIM-HEOM-003', 'Cadeira de rodas demonstrativa', 'Mobilidade', 'DEMO-ENF', 'DEMO-SALA-ENF', 'TAG-DEMO-003'],
      ['SIM-HEOM-004', 'Analisador demonstrativo', 'Engenharia clínica', 'DEMO-ENG', 'DEMO-SALA-ENG', 'TAG-DEMO-004']
    ] as const;
    for (const [assetNumber, assetName, category, depCode, roomCode, tag] of assets) {
      const room = roomByCode.get(roomCode);
      await pool.query(
        `WITH asset_identity AS (SELECT gen_random_uuid() AS id)
         INSERT INTO assets(id, asset_number, name, category, department_id, room_id, last_room_id,
          tracking_tag_id, qr_code, tracking_status, operational_status, criticality, data_origin)
         SELECT asset_identity.id, $1, $2, $3, $4, $5, NULL, $6, 'HEOM-ASSET:' || asset_identity.id::text, 'RASTREAMENTO_DESATIVADO', 'EM_OPERACAO', 'MEDIA', 'SIMULADO' FROM asset_identity
         ON CONFLICT (asset_number) DO NOTHING`,
        [assetNumber, assetName, category, byCode.get(depCode), room?.id, tag]
      );
    }
    console.log('Dados demonstrativos criados com identificação SIMULADO.');
  }
  console.log(`Usuário administrador verificado: ${email}`);
}

main().catch((error) => {
  console.error('Falha ao popular banco:', error);
  process.exitCode = 1;
}).finally(async () => pool.end());
