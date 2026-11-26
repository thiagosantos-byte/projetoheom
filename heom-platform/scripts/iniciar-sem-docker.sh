#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

fail() { echo "ERRO: $1" >&2; exit 1; }

command -v node >/dev/null 2>&1 || fail 'Node.js não foi encontrado. Instale uma versão LTS compatível.'
command -v npm >/dev/null 2>&1 || fail 'npm não foi encontrado. Reinstale o Node.js incluindo npm.'

if [[ ! -f .env ]]; then
  echo 'Arquivo .env não encontrado. Criando a partir do modelo...'
  cp .env.example .env
fi

node --input-type=module <<'NODE'
import fs from 'node:fs';
const content = fs.readFileSync('.env', 'utf8');
const entries = Object.fromEntries(content.split(/\r?\n/).filter(line => line && !line.trim().startsWith('#') && line.includes('=')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^"|"$/g, '')];
}));
if (!entries.JWT_SECRET || entries.JWT_SECRET.includes('SUBSTITUA_POR_') || entries.JWT_SECRET.length < 32) {
  console.error('ERRO: JWT_SECRET ausente ou inválido. Execute: bash ./scripts/configurar-ambiente.sh'); process.exit(1);
}
if ((!entries.INITIAL_ADMIN_PASSWORD || entries.INITIAL_ADMIN_PASSWORD.length < 14) && entries.ENABLE_DEMO_PROFILES !== 'true') {
  console.error('ERRO: configure uma senha administrativa ou habilite ENABLE_DEMO_PROFILES=true para entrar pelos cartões sem senha.'); process.exit(1);
}
NODE

if [[ ! -d node_modules ]]; then
  echo 'Instalando dependências npm...'
  npm install
fi

# Corrige instalações em que o npm bloqueou o postinstall do esbuild.
if ! node -e "require('esbuild')" >/dev/null 2>&1; then
  echo 'Preparando o esbuild para o Vite...'
  npm install-scripts approve esbuild >/dev/null 2>&1 || true
  npm rebuild esbuild || fail 'Não foi possível preparar o esbuild. Execute: npm install-scripts approve esbuild && npm rebuild esbuild'
fi

mkdir -p apps/api/data
printf '\nIniciando HEOM em modo de demonstração local, sem Docker...\n'
printf 'Persistência: arquivo JSON local (apps/api/data/heom-demo.json)\n'
printf 'Rastreamento: simulador interno (sem MQTT e sem hardware real)\n'
printf 'Interface: http://localhost:5173\n'
printf 'API:       http://localhost:4000/api/health\n'
printf 'Para encerrar, pressione Ctrl+C.\n\n'
npm run dev:local
