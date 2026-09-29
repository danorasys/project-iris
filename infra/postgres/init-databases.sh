#!/bin/bash
set -e

# Postgres only runs this the first time, when the data volume is empty. A
# database added to the list later has to be created by hand on an existing
# volume (or wipe the volume and start over).
# The names go in as psql variables and %I quotes them, so a user like
# "change-me-user" (with dashes) works too.
for db in identity_db classroom_db content_db notification_db; do
  psql -v ON_ERROR_STOP=1 -v db="$db" -v owner="$POSTGRES_USER" --username "$POSTGRES_USER" <<-'EOSQL'
    SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'owner')
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db')\gexec
EOSQL
done
