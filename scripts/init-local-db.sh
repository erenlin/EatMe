#!/usr/bin/env bash
set -euo pipefail

ROOT="/app/database"

run_sql() {
    local file="$1"
    echo "Applying ${file}"

    psql -X -v ON_ERROR_STOP=1 \
        --username "$POSTGRES_USER" \
        --dbname "$POSTGRES_DB" \
        -c "SET search_path TO kitchen, public;" \
        -f "$ROOT/$file"
}

# Schema and supporting objects.
run_sql "schema/01_schema.sql"
run_sql "schema/02_indexes.sql"
run_sql "schema/04_triggers.sql"

# Make kitchen the default schema for application connections.
psql -X -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname "$POSTGRES_DB" \
    -c "ALTER ROLE \"$POSTGRES_USER\" IN DATABASE \"$POSTGRES_DB\" SET search_path = kitchen, public;"

# Logging must exist before functions that use it.
run_sql "functions/0_fn_logging/00_fn_logs.sql"

# Install the remaining application functions.
while IFS= read -r file; do
    run_sql "${file#"$ROOT/"}"
done < <(
    find "$ROOT/functions" \
        -type f \
        -name '*.sql' \
        ! -path '*/0_fn_logging/*' |
        LC_ALL=C sort
)

echo "EatMe local database initialized successfully."
