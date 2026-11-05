import { closePool, getPool } from './db';
import {
  adoptExistingMigration,
  migrateUp,
  renderAdoptExistingMigrationSql,
  rollbackLatest,
  verifyMigrations
} from './migrations';

const command = process.argv[2];

const run = async (): Promise<void> => {
  if (command === 'migrate') {
    const versions = await migrateUp(getPool());
    process.stdout.write(JSON.stringify({ applied: versions }) + '\n');
    return;
  }
  if (command === 'adopt') {
    const version = Number(process.argv[3]);
    if (!Number.isInteger(version) || version < 1) throw new Error('Usage: cli.js adopt <version>');
    const adopted = await adoptExistingMigration(getPool(), version);
    process.stdout.write(JSON.stringify({ adopted: adopted ? version : null }) + '\n');
    return;
  }
  if (command === 'render-adopt') {
    const version = Number(process.argv[3]);
    const schema = process.argv[4] || 'public';
    if (!Number.isInteger(version) || version < 1) {
      throw new Error('Usage: cli.js render-adopt <version> [schema]');
    }
    process.stdout.write(await renderAdoptExistingMigrationSql(version, schema));
    return;
  }
  if (command === 'rollback') {
    const version = await rollbackLatest(getPool());
    process.stdout.write(JSON.stringify({ rolledBack: version }) + '\n');
    return;
  }
  if (command === 'verify') {
    const state = await verifyMigrations(getPool());
    process.stdout.write(JSON.stringify(state) + '\n');
    return;
  }
  throw new Error('Usage: cli.js adopt <version>|render-adopt <version> [schema]|migrate|rollback|verify');
};

void run()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`database command failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(closePool);
