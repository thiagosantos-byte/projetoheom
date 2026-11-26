#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "ERRO: Node.js não foi encontrado. Instale o Node.js 22 ou uma versão LTS compatível." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Arquivo .env criado a partir de .env.example."
fi

printf '\nCONFIGURAÇÃO INICIAL DO HEOM\n'
printf 'O segredo JWT será gerado localmente e não será exibido.\n'
printf 'A senha administrativa é opcional no modo de demonstração.\n'
printf 'Pressione Enter para usar somente os perfis de teste sem senha.\n\n'

read -r -s -p 'Senha administrativa individual (opcional): ' ADMIN_PASSWORD
printf '\n'

if [[ -n "$ADMIN_PASSWORD" && ( ${#ADMIN_PASSWORD} -lt 14 || ! "$ADMIN_PASSWORD" =~ ^[A-Za-z0-9!@#\$%_-]+$ ) ]]; then
  unset ADMIN_PASSWORD
  echo 'ERRO: quando informada, a senha deve ter pelo menos 14 caracteres e usar somente letras, números ou ! @ # $ % _ -.' >&2
  exit 1
fi

JWT_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))")"
export JWT_SECRET ADMIN_PASSWORD

node <<'NODE'
const fs = require('node:fs');
const path = '.env';
let content = fs.readFileSync(path, 'utf8');
const updates = {
  JWT_SECRET: process.env.JWT_SECRET,
  INITIAL_ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
};

for (const [key, value] of Object.entries(updates)) {
  const expression = new RegExp(`^${key}=.*$`, 'm');
  if (!expression.test(content)) {
    console.error(`ERRO: a chave ${key} não existe no arquivo .env.`);
    process.exit(1);
  }
  content = content.replace(expression, `${key}=${JSON.stringify(value)}`);
}

fs.writeFileSync(path, content.replace(/\r\n/g, '\n'), { mode: 0o600 });
NODE

ADMIN_PASSWORD_CONFIGURED=false
if [[ -n "$ADMIN_PASSWORD" ]]; then ADMIN_PASSWORD_CONFIGURED=true; fi
unset JWT_SECRET ADMIN_PASSWORD
printf '\nConfiguração concluída.\n'
printf 'JWT_SECRET: gerado localmente (não exibido).\n'
if [[ "$ADMIN_PASSWORD_CONFIGURED" == true ]]; then printf 'INITIAL_ADMIN_PASSWORD: configurada.\n'; else printf 'INITIAL_ADMIN_PASSWORD: não configurada; use os perfis de teste sem senha.\n'; fi
printf '\nPróximo comando: bash ./scripts/iniciar.sh\n'
