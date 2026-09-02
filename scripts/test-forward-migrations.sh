#!/usr/bin/env sh
set -eu

if [ -z "${PGURL:-}" ]; then
  echo "PGURL is required." >&2
  exit 1
fi

for migration in lib/db/drizzle/*.sql; do
  case "$migration" in
    *0013_*)
      psql "$PGURL" -v ON_ERROR_STOP=1 -c \
        "INSERT INTO \"user\" (id, email, plan) VALUES ('migration-enterprise', 'migration-enterprise@example.com', 'enterprise');"
      ;;
  esac
  psql "$PGURL" -v ON_ERROR_STOP=1 -f "$migration"
done

backfilled_limit=$(psql "$PGURL" -v ON_ERROR_STOP=1 -Atc \
  "SELECT \"enterpriseMonthlyLeadLimit\" FROM \"user\" WHERE id = 'migration-enterprise';")
if [ "$backfilled_limit" != "999999" ]; then
  echo "Enterprise compatibility allowance was not backfilled." >&2
  exit 1
fi
