import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTestDatabaseConfig } from './support/test-database';

test('database integration tests require TEST_DATABASE_URL and never fall back to DATABASE_URL', () => {
  assert.throws(
    () => loadTestDatabaseConfig({ DATABASE_URL: 'postgresql://localhost/dish_library' }),
    /TEST_DATABASE_URL is required/
  );
});

test('database integration tests reject the application database URL', () => {
  const shared = 'postgresql://localhost/dish_library_test';
  assert.throws(
    () => loadTestDatabaseConfig({ TEST_DATABASE_URL: shared, DATABASE_URL: shared }),
    /must not equal DATABASE_URL/
  );
});

test('database integration tests require an explicitly named test database', () => {
  assert.throws(
    () => loadTestDatabaseConfig({ TEST_DATABASE_URL: 'postgresql://localhost/dish_library' }),
    /standalone test marker/
  );
  const config = loadTestDatabaseConfig({
    TEST_DATABASE_URL: 'postgresql://localhost/dish_library_test'
  });
  assert.match(config.schemaName, /^phase1_test_[0-9]+_[a-f0-9]{32}$/);
});
