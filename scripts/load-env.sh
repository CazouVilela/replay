#!/bin/bash
# Carrega configuracao do ambiente da branch atual
# Uso: source scripts/load-env.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_DIR}/config/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "ERRO: Arquivo config/.env nao encontrado"
    return 1 2>/dev/null || exit 1
fi

set -a
source "$ENV_FILE"
set +a

echo "Ambiente carregado: $APP_ENV (branch: $(git branch --show-current 2>/dev/null || echo 'desconhecido'))"
