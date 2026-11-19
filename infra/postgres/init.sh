#!/bin/sh
# Runs once on first Postgres boot. The mint owns its database; coupured gets SELECT only.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE mint LOGIN PASSWORD '${MINT_DB_PASSWORD}';
CREATE DATABASE mint OWNER mint;
CREATE ROLE coupured_ro LOGIN PASSWORD '${COUPURED_RO_PASSWORD}';
SQL
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname mint <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO mint;
GRANT USAGE ON SCHEMA public TO coupured_ro;
GRANT CONNECT ON DATABASE mint TO coupured_ro;
-- tables and views the mint creates later become readable (never writable) by coupured
ALTER DEFAULT PRIVILEGES FOR ROLE mint IN SCHEMA public GRANT SELECT ON TABLES TO coupured_ro;
ALTER ROLE coupured_ro SET default_transaction_read_only = on;
SQL
