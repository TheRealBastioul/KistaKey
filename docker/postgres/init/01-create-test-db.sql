-- Runs once, when the Postgres volume is first created.
-- Integration tests migrate and use this database (TEST_DATABASE_URL),
-- never the dev database, because audit_log is append-only.
CREATE DATABASE app_test;
