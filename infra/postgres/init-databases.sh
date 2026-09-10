#!/bin/bash
set -e

# Docker only runs the scripts in docker-entrypoint-initdb.d the first time,
# when the data volume is still empty. If you add a new database to this
# list later, it won't show up on an existing volume, you have to create it
# by hand (or wipe the pgdata volume and start over).
for db in identity_db classroom_db content_db notification_db; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    SELECT 'CREATE DATABASE $db OWNER $POSTGRES_USER'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
EOSQL
done
