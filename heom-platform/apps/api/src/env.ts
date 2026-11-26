import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Os scripts npm das workspaces são executados em apps/api; a configuração fica na raiz do monorepo.
const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '../.env')
];
const envPath = candidates.find((candidate) => existsSync(candidate));
if (envPath) dotenv.config({ path: envPath });
