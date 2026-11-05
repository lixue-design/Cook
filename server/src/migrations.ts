import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Pool, PoolClient } from 'pg';

type Migration = {
  version: number;
  name: string;
  checksum: string;
  upPath: string;
  downPath: string;
};

type SchemaSnapshotRow = {
  object_type: string;
  object_name: string;
  definition: string;
};

export type MigrationState = {
  currentVersion: number;
  appliedVersions: number[];
  availableVersions: number[];
};

export const defaultMigrationsDirectory = (): string => (
  process.env.MIGRATIONS_DIR || path.resolve(__dirname, '../../../database/migrations')
);

const checksum = (content: string): string => createHash('sha256').update(content).digest('hex');

export const loadMigrations = async (directory = defaultMigrationsDirectory()): Promise<Migration[]> => {
  const filenames = await fs.readdir(directory);
  const upFiles = filenames.filter((name) => /^\d{4}_.+\.up\.sql$/.test(name)).sort();
  const migrations = await Promise.all(upFiles.map(async (filename) => {
    const match = filename.match(/^(\d{4})_(.+)\.up\.sql$/);
    if (!match) throw new Error(`Invalid migration filename: ${filename}`);
    const downFilename = `${match[1]}_${match[2]}.down.sql`;
    const upPath = path.join(directory, filename);
    const downPath = path.join(directory, downFilename);
    await fs.access(downPath);
    const sql = await fs.readFile(upPath, 'utf8');
    return {
      version: Number(match[1]),
      name: match[2],
      checksum: checksum(sql),
      upPath,
      downPath
    };
  }));

  const versions = new Set<number>();
  for (const migration of migrations) {
    if (versions.has(migration.version)) throw new Error(`Duplicate migration version: ${migration.version}`);
    versions.add(migration.version);
  }
  return migrations;
};

const ensureMigrationTable = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY CHECK (version > 0),
      name text NOT NULL,
      checksum char(64) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
  `);
};

const withMigrationLock = async <T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('cook_ai_dish_library_migrations'))");
    await ensureMigrationTable(client);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value: string): string => `'${value.replaceAll("'", "''")}'`;

const migrationObjectNames = (sql: string): { tables: string[]; functions: string[] } => ({
  tables: [...sql.matchAll(/CREATE TABLE\s+([a-z_][a-z0-9_]*)/gi)].map((match) => match[1]),
  functions: [...sql.matchAll(/CREATE FUNCTION\s+([a-z_][a-z0-9_]*)/gi)].map((match) => match[1])
});

const schemaSnapshot = async (
  client: PoolClient,
  schema: string,
  tables: string[],
  functions: string[]
): Promise<SchemaSnapshotRow[]> => {
  const result = await client.query<SchemaSnapshotRow>(`
    WITH selected_tables AS (
      SELECT c.oid, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname = ANY($2::text[])
    ), snapshot AS (
      SELECT 'column'::text AS object_type,
             t.relname || '.' || a.attnum::text AS object_name,
             concat_ws('|', a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull::text,
               coalesce(pg_get_expr(d.adbin, d.adrelid), '')) AS definition
      FROM selected_tables t
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
      LEFT JOIN pg_attrdef d ON d.adrelid = t.oid AND d.adnum = a.attnum
      UNION ALL
      SELECT 'constraint', t.relname || '.' || con.conname,
             con.contype::text || '|' || pg_get_constraintdef(con.oid, true)
      FROM selected_tables t JOIN pg_constraint con ON con.conrelid = t.oid
      UNION ALL
      SELECT 'index', t.relname || '.' || i.relname, pg_get_indexdef(i.oid)
      FROM selected_tables t
      JOIN pg_index x ON x.indrelid = t.oid
      JOIN pg_class i ON i.oid = x.indexrelid
      UNION ALL
      SELECT 'trigger', t.relname || '.' || g.tgname, pg_get_triggerdef(g.oid, true)
      FROM selected_tables t JOIN pg_trigger g ON g.tgrelid = t.oid AND NOT g.tgisinternal
      UNION ALL
      SELECT 'function', p.proname, pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 AND p.proname = ANY($3::text[])
    )
    SELECT object_type, object_name,
           replace(replace(definition, quote_ident($1::text) || '.', ''), $1::text || '.', '') AS definition
    FROM snapshot ORDER BY object_type, object_name, definition
  `, [schema, tables, functions]);
  return result.rows;
};

const schemaSnapshotSql = (schema: string, tables: string[], functions: string[]): string => {
  const schemaLiteral = quoteLiteral(schema);
  const tableArray = `ARRAY[${tables.map(quoteLiteral).join(', ')}]::text[]`;
  const functionArray = `ARRAY[${functions.map(quoteLiteral).join(', ')}]::text[]`;
  return `
    WITH selected_tables AS (
      SELECT c.oid, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = ${schemaLiteral} AND c.relkind = 'r' AND c.relname = ANY(${tableArray})
    ), snapshot AS (
      SELECT 'column'::text AS object_type,
             t.relname || '.' || a.attnum::text AS object_name,
             concat_ws('|', a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull::text,
               coalesce(pg_get_expr(d.adbin, d.adrelid), '')) AS definition
      FROM selected_tables t
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum > 0 AND NOT a.attisdropped
      LEFT JOIN pg_attrdef d ON d.adrelid = t.oid AND d.adnum = a.attnum
      UNION ALL
      SELECT 'constraint', t.relname || '.' || con.conname,
             con.contype::text || '|' || pg_get_constraintdef(con.oid, true)
      FROM selected_tables t JOIN pg_constraint con ON con.conrelid = t.oid
      UNION ALL
      SELECT 'index', t.relname || '.' || i.relname, pg_get_indexdef(i.oid)
      FROM selected_tables t
      JOIN pg_index x ON x.indrelid = t.oid
      JOIN pg_class i ON i.oid = x.indexrelid
      UNION ALL
      SELECT 'trigger', t.relname || '.' || g.tgname, pg_get_triggerdef(g.oid, true)
      FROM selected_tables t JOIN pg_trigger g ON g.tgrelid = t.oid AND NOT g.tgisinternal
      UNION ALL
      SELECT 'function', p.proname, pg_get_functiondef(p.oid)
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = ${schemaLiteral} AND p.proname = ANY(${functionArray})
    )
    SELECT object_type, object_name,
           replace(replace(definition, quote_ident(${schemaLiteral}::text) || '.', ''),
             ${schemaLiteral}::text || '.', '') AS definition
    FROM snapshot
  `;
};

export const renderAdoptExistingMigrationSql = async (
  version: number,
  targetSchema = 'public',
  directory = defaultMigrationsDirectory()
): Promise<string> => {
  if (!/^[a-z_][a-z0-9_]*$/.test(targetSchema)) {
    throw new Error(`Invalid target schema: ${targetSchema}`);
  }
  const migrations = await loadMigrations(directory);
  const migration = migrations.find((item) => item.version === version);
  if (!migration) throw new Error(`Migration ${version} is not available locally`);

  const sql = await fs.readFile(migration.upPath, 'utf8');
  const names = migrationObjectNames(sql);
  const target = quoteIdentifier(targetSchema);
  const scratchSchema = `migration_adopt_${String(version).padStart(4, '0')}`;
  const scratch = quoteIdentifier(scratchSchema);
  const expectedTable = `migration_adopt_expected_${String(version).padStart(4, '0')}`;
  const actualTable = `migration_adopt_actual_${String(version).padStart(4, '0')}`;

  return `BEGIN;
SELECT pg_advisory_xact_lock(hashtext('cook_ai_dish_library_migrations'));
CREATE TABLE IF NOT EXISTS ${target}.schema_migrations (
  version integer PRIMARY KEY CHECK (version > 0),
  name text NOT NULL,
  checksum char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $migration_adopt_history$
BEGIN
  IF EXISTS (
    SELECT 1 FROM ${target}.schema_migrations
    WHERE version = ${migration.version} AND btrim(checksum) <> ${quoteLiteral(migration.checksum)}
  ) THEN
    RAISE EXCEPTION 'Checksum mismatch for migration ${migration.version}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM ${target}.schema_migrations WHERE version = ${migration.version})
     AND EXISTS (SELECT 1 FROM ${target}.schema_migrations) THEN
    RAISE EXCEPTION 'Cannot adopt into a non-empty migration history';
  END IF;
END;
$migration_adopt_history$;
CREATE SCHEMA ${scratch};
SET LOCAL search_path TO ${scratch}, pg_catalog;
${sql.trim()}
CREATE TEMP TABLE ${quoteIdentifier(expectedTable)} ON COMMIT DROP AS
${schemaSnapshotSql(scratchSchema, names.tables, names.functions)};
SET LOCAL search_path TO ${target}, pg_catalog;
CREATE TEMP TABLE ${quoteIdentifier(actualTable)} ON COMMIT DROP AS
${schemaSnapshotSql(targetSchema, names.tables, names.functions)};
DO $migration_adopt_schema$
BEGIN
  IF EXISTS (
    (SELECT * FROM ${quoteIdentifier(expectedTable)} EXCEPT SELECT * FROM ${quoteIdentifier(actualTable)})
    UNION ALL
    (SELECT * FROM ${quoteIdentifier(actualTable)} EXCEPT SELECT * FROM ${quoteIdentifier(expectedTable)})
  ) THEN
    RAISE EXCEPTION 'Cannot adopt migration ${migration.version}; existing schema does not match the migration';
  END IF;
END;
$migration_adopt_schema$;
DROP SCHEMA ${scratch} CASCADE;
INSERT INTO ${target}.schema_migrations(version, name, checksum)
VALUES (${migration.version}, ${quoteLiteral(migration.name)}, ${quoteLiteral(migration.checksum)})
ON CONFLICT (version) DO NOTHING;
COMMIT;\n`;
};

export const adoptExistingMigration = async (
  pool: Pool,
  version: number,
  directory = defaultMigrationsDirectory()
): Promise<boolean> => {
  const migrations = await loadMigrations(directory);
  const migration = migrations.find((item) => item.version === version);
  if (!migration) throw new Error(`Migration ${version} is not available locally`);

  return withMigrationLock(pool, async (client) => {
    const recorded = await client.query<{ checksum: string }>(
      'SELECT checksum FROM schema_migrations WHERE version = $1', [version]
    );
    if (recorded.rowCount) {
      if (recorded.rows[0].checksum.trim() !== migration.checksum) {
        throw new Error(`Checksum mismatch for migration ${version}`);
      }
      return false;
    }
    const otherVersions = await client.query<{ version: number }>(
      'SELECT version FROM schema_migrations ORDER BY version'
    );
    if (otherVersions.rowCount) throw new Error('Cannot adopt into a non-empty migration history');

    const current = await client.query<{ schema: string }>('SELECT current_schema() AS schema');
    const targetSchema = current.rows[0].schema;
    const sql = await fs.readFile(migration.upPath, 'utf8');
    const names = migrationObjectNames(sql);
    const missing = await client.query<{ name: string }>(`
      SELECT name FROM unnest($2::text[]) AS missing(name)
      WHERE to_regclass(format('%I.%I', $1::text, name)) IS NULL
    `, [targetSchema, names.tables]);
    if (missing.rowCount) {
      throw new Error(`Cannot adopt migration ${version}; missing tables: ${missing.rows.map((row) => row.name).join(', ')}`);
    }

    const scratchSchema = `migration_adopt_${process.pid}_${Date.now()}`;
    await client.query(`CREATE SCHEMA ${quoteIdentifier(scratchSchema)}`);
    await client.query(`SET LOCAL search_path TO ${quoteIdentifier(scratchSchema)}, pg_catalog`);
    await client.query(sql);
    const expected = await schemaSnapshot(client, scratchSchema, names.tables, names.functions);
    const actual = await schemaSnapshot(client, targetSchema, names.tables, names.functions);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Cannot adopt migration ${version}; existing schema does not match the migration`);
    }
    await client.query(`SET LOCAL search_path TO ${quoteIdentifier(targetSchema)}, pg_catalog`);
    await client.query(`DROP SCHEMA ${quoteIdentifier(scratchSchema)} CASCADE`);
    await client.query(
      'INSERT INTO schema_migrations(version, name, checksum) VALUES ($1, $2, $3)',
      [migration.version, migration.name, migration.checksum]
    );
    return true;
  });
};

export const migrateUp = async (pool: Pool, directory = defaultMigrationsDirectory()): Promise<number[]> => {
  const migrations = await loadMigrations(directory);
  const appliedNow: number[] = [];

  for (const migration of migrations) {
    await withMigrationLock(pool, async (client) => {
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE version = $1',
        [migration.version]
      );
      if (existing.rowCount) {
        if (existing.rows[0].checksum.trim() !== migration.checksum) {
          throw new Error(`Checksum mismatch for migration ${migration.version}`);
        }
        return;
      }
      const sql = await fs.readFile(migration.upPath, 'utf8');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations(version, name, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.name, migration.checksum]
      );
      appliedNow.push(migration.version);
    });
  }
  return appliedNow;
};

export const rollbackLatest = async (pool: Pool, directory = defaultMigrationsDirectory()): Promise<number | null> => {
  const migrations = await loadMigrations(directory);
  return withMigrationLock(pool, async (client) => {
    const latest = await client.query<{ version: number; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version DESC LIMIT 1'
    );
    if (!latest.rowCount) return null;
    const version = latest.rows[0].version;
    const migration = migrations.find((item) => item.version === version);
    if (!migration) throw new Error(`No rollback file for applied migration ${version}`);
    if (latest.rows[0].checksum.trim() !== migration.checksum) {
      throw new Error(`Checksum mismatch for migration ${version}`);
    }
    const sql = await fs.readFile(migration.downPath, 'utf8');
    await client.query(sql);
    await client.query('DELETE FROM schema_migrations WHERE version = $1', [version]);
    return version;
  });
};

export const verifyMigrations = async (
  pool: Pool,
  directory = defaultMigrationsDirectory()
): Promise<MigrationState> => {
  const migrations = await loadMigrations(directory);
  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    const result = await client.query<{ version: number; checksum: string }>(
      'SELECT version, checksum FROM schema_migrations ORDER BY version'
    );
    const byVersion = new Map(migrations.map((item) => [item.version, item]));
    for (const applied of result.rows) {
      const migration = byVersion.get(applied.version);
      if (!migration) throw new Error(`Applied migration ${applied.version} has no local file`);
      if (applied.checksum.trim() !== migration.checksum) {
        throw new Error(`Checksum mismatch for migration ${applied.version}`);
      }
    }
    const appliedVersions = result.rows.map((row) => row.version);
    return {
      currentVersion: appliedVersions.at(-1) || 0,
      appliedVersions,
      availableVersions: migrations.map((item) => item.version)
    };
  } finally {
    client.release();
  }
};
