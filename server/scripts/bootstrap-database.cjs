'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

const adminDatabaseUrl = String(process.env.ADMIN_DATABASE_URL || '').trim();
const targetDatabaseName = String(process.env.TARGET_DATABASE_NAME || 'cook').trim();

if (!adminDatabaseUrl) {
  throw new Error('ADMIN_DATABASE_URL is required');
}
if (!/^[a-z][a-z0-9_]*$/.test(targetDatabaseName)) {
  throw new Error('TARGET_DATABASE_NAME must start with a lowercase letter and contain only lowercase letters, digits, or underscores');
}

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const migrationsDirectory = path.resolve(__dirname, '../../database/migrations');

const targetDatabaseUrl = () => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${targetDatabaseName}`;
  return url.toString();
};

const loadMigrations = async () => {
  const filenames = await fs.readdir(migrationsDirectory);
  const upFiles = filenames.filter((name) => /^\d{4}_.+\.up\.sql$/.test(name)).sort();
  const migrations = [];

  for (const filename of upFiles) {
    const match = filename.match(/^(\d{4})_(.+)\.up\.sql$/);
    if (!match) continue;
    const downFilename = `${match[1]}_${match[2]}.down.sql`;
    await fs.access(path.join(migrationsDirectory, downFilename));
    const sql = await fs.readFile(path.join(migrationsDirectory, filename), 'utf8');
    migrations.push({
      version: Number(match[1]),
      name: match[2],
      checksum: createHash('sha256').update(sql).digest('hex'),
      sql
    });
  }

  const versions = new Set();
  for (const migration of migrations) {
    if (versions.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    versions.add(migration.version);
  }
  return migrations;
};

const ensureDatabase = async () => {
  const client = new Client({
    connectionString: adminDatabaseUrl,
    application_name: 'cook-database-bootstrap'
  });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDatabaseName]);
    if (existing.rowCount) return false;
    await client.query(
      `CREATE DATABASE ${quoteIdentifier(targetDatabaseName)} TEMPLATE template0 ENCODING 'UTF8'`
    );
    return true;
  } finally {
    await client.end();
  }
};

const applyMigrations = async (migrations) => {
  const client = new Client({
    connectionString: targetDatabaseUrl(),
    application_name: 'cook-database-bootstrap'
  });
  const applied = [];
  await client.connect();
  try {
    for (const migration of migrations) {
      await client.query('BEGIN');
      try {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('cook_ai_dish_library_migrations'))");
        await client.query(`
          CREATE TABLE IF NOT EXISTS schema_migrations (
            version integer PRIMARY KEY CHECK (version > 0),
            name text NOT NULL,
            checksum char(64) NOT NULL,
            applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
          )
        `);
        const existing = await client.query(
          'SELECT checksum FROM schema_migrations WHERE version = $1',
          [migration.version]
        );
        if (existing.rowCount) {
          if (existing.rows[0].checksum.trim() !== migration.checksum) {
            throw new Error(`Checksum mismatch for migration ${migration.version}`);
          }
        } else {
          await client.query(migration.sql);
          await client.query(
            'INSERT INTO schema_migrations(version, name, checksum) VALUES ($1, $2, $3)',
            [migration.version, migration.name, migration.checksum]
          );
          applied.push(migration.version);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    const state = await client.query(
      'SELECT version, name FROM schema_migrations ORDER BY version'
    );
    return { applied, versions: state.rows };
  } finally {
    await client.end();
  }
};

const run = async () => {
  const migrations = await loadMigrations();
  const created = await ensureDatabase();
  const state = await applyMigrations(migrations);
  process.stdout.write(`${JSON.stringify({
    database: targetDatabaseName,
    created,
    applied: state.applied,
    versions: state.versions
  }, null, 2)}\n`);
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  process.stderr.write(`database bootstrap failed: ${message}\n`);
  process.exitCode = 1;
});
