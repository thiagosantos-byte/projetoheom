import './env.js';
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 15,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  options: '-c timezone=America/Bahia'
});

pool.on('error', (error) => {
  console.error('[Banco de dados] Erro em conexão ociosa:', error.message);
});
