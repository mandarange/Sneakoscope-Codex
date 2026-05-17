import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCommand, classifySql } from '../../src/core/db-safety.mjs';

const sqlCases = [
  ['DROP TABLE users', 'destructive', 'drop_table'],
  ['DROP DATABASE prod', 'destructive', 'drop_database'],
  ['TRUNCATE users', 'destructive', 'truncate'],
  ['DELETE FROM users', 'destructive', 'delete_without_where'],
  ['DELETE FROM users WHERE id = 1', 'write', 'delete_with_where'],
  ['UPDATE users SET admin = true', 'destructive', 'update_without_where'],
  ['UPDATE users SET admin = false WHERE id = 1', 'write', 'update_with_where'],
  ['ALTER TABLE users DROP COLUMN name', 'destructive', 'alter_table_drop'],
  ['ALTER TABLE users RENAME TO app_users', 'destructive', 'alter_table_rename'],
  ['CREATE OR REPLACE VIEW v AS SELECT 1', 'destructive', 'create_or_replace'],
  ['GRANT SELECT ON users TO anon', 'destructive', 'grant'],
  ['REVOKE SELECT ON users FROM anon', 'destructive', 'revoke'],
  ['ALTER TABLE users DISABLE ROW LEVEL SECURITY', 'destructive', 'disable_rls'],
  ['SELECT * FROM users', 'safe', 'select_star_without_limit'],
  ['SELECT * FROM users LIMIT 10', 'safe', null],
  ['WITH x AS (SELECT 1) SELECT * FROM x LIMIT 1', 'safe', null],
  ['-- DROP TABLE ignored\nSELECT 1', 'safe', null],
  ["SELECT 'DROP TABLE users' AS text LIMIT 1", 'safe', null],
  ['SELECT 1; DROP TABLE users', 'destructive', 'drop_table']
];

const commandCases = [
  ['supabase db reset', 'destructive', 'supabase_db_reset'],
  ['supabase migration up', 'write', 'supabase_migration_up'],
  ['prisma migrate reset', 'destructive', 'prisma_migrate_reset'],
  ['drizzle-kit push', 'destructive', 'drizzle_push']
];

const fixtureTables = [
  'users',
  'accounts',
  'sessions',
  'audit_events',
  'billing_profiles',
  'workspace_members',
  'api_keys',
  'feature_flags',
  'tenant_settings',
  'job_runs',
  'raw_events',
  'reports'
];

const generatedSqlCases = [
  ...fixtureTables.flatMap((table) => [
    [`DROP TABLE ${table}`, 'destructive', 'drop_table'],
    [`TRUNCATE TABLE ${table}`, 'destructive', 'truncate'],
    [`DELETE FROM ${table}`, 'destructive', 'delete_without_where'],
    [`UPDATE ${table} SET archived = true`, 'destructive', 'update_without_where'],
    [`ALTER TABLE ${table} DROP COLUMN old_value`, 'destructive', 'alter_table_drop'],
    [`ALTER TABLE ${table} RENAME TO ${table}_old`, 'destructive', 'alter_table_rename'],
    [`DELETE FROM ${table} WHERE id = 1`, 'write', 'delete_with_where'],
    [`UPDATE ${table} SET archived = true WHERE id = 1`, 'write', 'update_with_where'],
    [`INSERT INTO ${table} (id) VALUES (1)`, 'write', 'insert_or_upsert'],
    [`SELECT * FROM ${table} LIMIT 25`, 'safe', null]
  ]),
  ['DROP SCHEMA private CASCADE', 'destructive', 'drop_schema'],
  ['DROP EXTENSION pgcrypto', 'destructive', 'drop_extension'],
  ['DROP POLICY select_own ON users', 'destructive', 'drop_policy'],
  ['CREATE TABLE scratch (id bigint)', 'write', 'schema_change'],
  ['CREATE INDEX idx_users_id ON users (id)', 'write', 'schema_change'],
  ['ALTER TABLE users ADD COLUMN nickname text', 'write', 'schema_change'],
  ['COPY users FROM STDIN', 'write', 'bulk_copy_from'],
  ['WITH recent AS (SELECT * FROM users LIMIT 5) SELECT * FROM recent LIMIT 5', 'safe', null],
  ['EXPLAIN SELECT * FROM users LIMIT 1', 'safe', null],
  ['SHOW search_path', 'safe', null]
];

const generatedCommandCases = [
  ['supabase db reset --linked', 'destructive', 'supabase_db_reset'],
  ['supabase migration repair 20260517000000 --status reverted', 'destructive', 'supabase_migration_repair'],
  ['supabase db push', 'write', 'supabase_db_push'],
  ['supabase migration up --linked', 'write', 'supabase_migration_up'],
  ['supabase db diff', 'safe', 'supabase_migration_schema_read'],
  ['supabase db pull', 'safe', 'supabase_migration_schema_read'],
  ['supabase migration list', 'safe', 'supabase_migration_file_work'],
  ['supabase migration new add_profile_table', 'safe', 'supabase_migration_file_work'],
  ['prisma db push', 'destructive', 'prisma_db_push'],
  ['sequelize db:migrate:undo', 'destructive', 'sequelize_migrate_undo'],
  ['knex migrate:rollback', 'destructive', 'knex_migrate_rollback'],
  ['dropdb production', 'destructive', 'postgres_database_admin_command'],
  ['createdb replacement', 'destructive', 'postgres_database_admin_command'],
  ['psql -c "DROP TABLE users"', 'destructive', 'drop_table'],
  ['psql -c "DELETE FROM users WHERE id = 1"', 'write', 'delete_with_where'],
  ['psql -c "SELECT * FROM users LIMIT 10"', 'safe', null]
];

const allSqlCases = [...sqlCases, ...generatedSqlCases];
const allCommandCases = [...commandCases, ...generatedCommandCases];

test('DB safety golden cases classify destructive and safe shapes', () => {
  for (const [sql, level, reason] of allSqlCases) {
    const result = classifySql(sql);
    assert.equal(result.level, level, sql);
    if (reason) assert.ok(result.reasons.includes(reason), `${sql} missing ${reason}`);
  }
  for (const [command, level, reason] of allCommandCases) {
    const result = classifyCommand(command);
    assert.equal(result.level, level, command);
    if (reason) assert.ok(result.reasons.includes(reason), `${command} missing ${reason}`);
  }
  assert.ok(allSqlCases.length + allCommandCases.length >= 100);
});
