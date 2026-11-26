#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"
fail(){ echo "ERRO: $1" >&2; exit 1; }
command -v node >/dev/null 2>&1 || fail 'Node.js não foi encontrado.'
command -v npm >/dev/null 2>&1 || fail 'npm não foi encontrado.'
[[ -f .env ]] || fail 'Arquivo .env não encontrado. Execute bash ./scripts/configurar-ambiente.sh.'
node --input-type=module <<'NODE'
import fs from 'node:fs';
const lines=fs.readFileSync('.env','utf8').split(/\r?\n/);
const env=Object.fromEntries(lines.filter(x=>x.trim()&&!x.trim().startsWith('#')&&x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).trim().replace(/^"|"$/g,'')]}));
if(!env.JWT_SECRET||env.JWT_SECRET.length<32||env.JWT_SECRET.includes('SUBSTITUA_POR_')){console.error('JWT_SECRET não configurado.');process.exit(1)}
if(!env.DATABASE_URL){console.error('DATABASE_URL não configurada.');process.exit(1)}
if(!env.MQTT_URL){console.error('MQTT_URL não configurada.');process.exit(1)}
NODE
if [[ ! -d node_modules ]]; then npm install; fi
if ! node -e "require('esbuild')" >/dev/null 2>&1; then npm install-scripts approve esbuild || true; npm rebuild esbuild; fi
printf '
Validando PostgreSQL local e aplicando migrações...\n'
npm run db:migrate
npm run db:seed
printf '
Iniciando HEOM no modo institucional nativo.\n'
printf 'Dependências: PostgreSQL e Mosquitto instalados como serviços do Windows/Linux.\n'
printf 'API: http://localhost:4000/api/health\nInterface: http://localhost:5173\n'
printf 'Pressione Ctrl+C para encerrar os processos Node. Os serviços nativos continuam sob controle do sistema operacional.\n\n'
export VITE_DEV_HOST="${VITE_DEV_HOST:-0.0.0.0}"
npm run dev:infra
