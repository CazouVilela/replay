#!/bin/bash
# Backup do banco de dados de producao
# Executar SEMPRE antes de alteracoes em schema/dados de producao
# IMPORTANTE: Executar na branch main (producao)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Verificar que esta na branch main
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "AVISO: Voce nao esta na branch main (esta em: $CURRENT_BRANCH)"
    echo "   O backup usa as credenciais do config/.env da branch ATUAL"
    read -p "   Continuar mesmo assim? [s/N]: " confirm
    if [ "$confirm" != "s" ] && [ "$confirm" != "S" ]; then
        echo "Cancelado."
        exit 0
    fi
fi

source "${PROJECT_DIR}/config/.env"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${PROJECT_DIR}/backups"
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "=== BACKUP DE PRODUCAO ==="
echo "Banco: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "Destino: $BACKUP_FILE"
echo ""

# Ajustar o comando abaixo conforme o banco do projeto:
# PostgreSQL:
# pg_dump -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} ${DB_NAME} | gzip > ${BACKUP_FILE}
#
# MySQL/MariaDB:
# mysqldump -h ${DB_HOST} -P ${DB_PORT} -u ${DB_USER} -p${DB_PASSWORD} ${DB_NAME} | gzip > ${BACKUP_FILE}
#
# SQLite:
# sqlite3 ${DB_NAME} ".backup '${BACKUP_FILE%.gz}'" && gzip ${BACKUP_FILE%.gz}

echo "TODO: Descomentar e ajustar o comando de backup para o banco deste projeto"
echo ""

# Verificar resultado
if [ -f "$BACKUP_FILE" ]; then
    echo "Backup criado: $BACKUP_FILE"
    echo "   Tamanho: $(du -h "$BACKUP_FILE" | cut -f1)"
else
    echo "Nenhum backup gerado (comando de backup ainda nao configurado)"
    echo "   Edite scripts/backup-prod-db.sh para configurar"
fi

# Manter apenas ultimos 10 backups
ls -t ${BACKUP_DIR}/*.sql.gz 2>/dev/null | tail -n +11 | xargs rm -f 2>/dev/null || true
echo ""
echo "Backups existentes:"
ls -lh ${BACKUP_DIR}/*.sql.gz 2>/dev/null || echo "  (nenhum)"
