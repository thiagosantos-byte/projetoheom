#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${1:-$ROOT/backups/heom-demo-$STAMP}"
mkdir -p "$DEST"
[[ -f "$ROOT/apps/api/data/heom-demo.json" ]] && cp -p "$ROOT/apps/api/data/heom-demo.json" "$DEST/"
[[ -d "$ROOT/storage" ]] && cp -a "$ROOT/storage" "$DEST/"
echo "Backup demonstrativo criado em: $DEST"
