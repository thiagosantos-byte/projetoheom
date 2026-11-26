#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"
command -v node >/dev/null 2>&1 || { echo 'Instale Node.js 22.x.' >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo 'npm não foi encontrado.' >&2; exit 1; }
exec npm run dev
