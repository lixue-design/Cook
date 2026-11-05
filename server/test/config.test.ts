import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config';

test('configuration requires DATABASE_URL', () => {
  assert.throws(() => loadConfig({}), /DATABASE_URL is required/);
});

test('configuration parses CloudBase/local environment values', () => {
  const config = loadConfig({
    DATABASE_URL: 'postgresql://example.invalid/database',
    DATABASE_SSL: 'true',
    DATABASE_POOL_MAX: '7',
    DATABASE_CONNECTION_TIMEOUT_MS: '2500',
    PORT: '8080',
    HOST: '0.0.0.0',
    NODE_ENV: 'test',
    ADMIN_API_TOKEN: 'local-admin-token'
  });
  assert.equal(config.port, 8080);
  assert.equal(config.databaseSsl, true);
  assert.equal(config.databasePoolMax, 7);
  assert.equal(config.databaseConnectionTimeoutMs, 2500);
  assert.equal(config.adminApiToken, 'local-admin-token');
});

test('configuration rejects invalid booleans and integers', () => {
  assert.throws(
    () => loadConfig({ DATABASE_URL: 'postgresql://example.invalid/db', DATABASE_SSL: 'yes' }),
    /DATABASE_SSL must be true or false/
  );
  assert.throws(
    () => loadConfig({ DATABASE_URL: 'postgresql://example.invalid/db', PORT: '0' }),
    /PORT must be an integer/
  );
});
