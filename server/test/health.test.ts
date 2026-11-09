import { createServer } from 'node:http';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestHandler } from '../src/app';
import {
  checkCloudBaseRecipeReadiness,
  handleCloudFunctionEvent,
  parseAccountCancellationTimerEvent
} from '../src/cloud-function';
import type { QueryExecutor } from '../src/health';
import { EXPECTED_DATABASE_VERSION } from '../src/schema-version';

const healthyExecutor: QueryExecutor = {
  async query(sql: string) {
    return { rows: [{ version: sql.includes('schema_migrations') ? EXPECTED_DATABASE_VERSION : undefined }] };
  }
};

const failingExecutor: QueryExecutor = {
  async query() {
    throw new Error('database unavailable');
  }
};

const adminAssetRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'b1000000-0000-4000-8000-000000000001',
  canonical_dish_id: 'a1000000-0000-4000-8000-000000000001',
  dish_name: '番茄炒蛋',
  normalized_name: '番茄炒蛋',
  dish_status: 'ACTIVE',
  status: 'READY',
  provider: 'rules',
  provider_model: null,
  storage_key: 'tomato.webp',
  mime_type: 'image/webp',
  width: 768,
  height: 768,
  is_current: true,
  failure_code: null,
  failure_summary: null,
  updated_at: '2026-08-05T00:00:00.000Z',
  created_at: '2026-08-04T00:00:00.000Z',
  ...overrides
});

test('HTTP liveness and readiness health checks pass', async () => {
  const server = createServer(createRequestHandler(healthyExecutor));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const live = await fetch(`${baseUrl}/health/live`);
    assert.equal(live.status, 200);
    assert.deepEqual(await live.json(), {
      status: 'ok', service: 'ai-dish-library', database: 'not_checked'
    });
    const ready = await fetch(`${baseUrl}/health/ready`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), {
      status: 'ok', service: 'ai-dish-library', database: 'ok', databaseVersion: EXPECTED_DATABASE_VERSION,
      expectedDatabaseVersion: EXPECTED_DATABASE_VERSION
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('HTTP readiness returns 503 without exposing database errors', async () => {
  const server = createServer(createRequestHandler(failingExecutor));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: 'error', service: 'ai-dish-library', database: 'error',
      expectedDatabaseVersion: EXPECTED_DATABASE_VERSION
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('CloudBase function entry uses index.main-compatible response', async () => {
  const response = await handleCloudFunctionEvent({ path: '/health/ready', httpMethod: 'GET' }, healthyExecutor);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(response.body), {
    status: 'ok', service: 'ai-dish-library', database: 'ok', databaseVersion: EXPECTED_DATABASE_VERSION,
    expectedDatabaseVersion: EXPECTED_DATABASE_VERSION
  });
});

test('account cancellation timer accepts only its named trigger with a protected message', () => {
  assert.deepEqual(parseAccountCancellationTimerEvent({
    Type: 'Timer',
    TriggerName: 'account-cancellation-daily',
    Message: JSON.stringify({
      action: 'system.accountCancellation.runDue',
      internalToken: 'timer-secret'
    })
  }), {
    action: 'system.accountCancellation.runDue',
    internalToken: 'timer-secret'
  });
  assert.equal(parseAccountCancellationTimerEvent({
    Type: 'Timer',
    TriggerName: 'another-trigger',
    Message: JSON.stringify({
      action: 'system.accountCancellation.runDue',
      internalToken: 'timer-secret'
    })
  }), null);
  assert.equal(parseAccountCancellationTimerEvent({
    Type: 'Timer',
    TriggerName: 'account-cancellation-daily',
    Message: '{not json}'
  }), null);
});

test('HTTP readiness rejects an empty version-0 migration table', async () => {
  const versionZeroExecutor: QueryExecutor = {
    async query(sql: string) {
      return { rows: [{ version: sql.includes('schema_migrations') ? 0 : undefined }] };
    }
  };
  const server = createServer(createRequestHandler(versionZeroExecutor));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: 'error', service: 'ai-dish-library', database: 'error', databaseVersion: 0,
      expectedDatabaseVersion: EXPECTED_DATABASE_VERSION
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('HTTP dish image generate returns a rules placeholder for ops completion', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const executor: QueryExecutor = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes('FROM dish_aliases') || sql.includes('FROM canonical_dishes')) return { rows: [] };
      if (sql.includes('INSERT INTO canonical_dishes')) return { rows: [] };
      return { rows: [] };
    }
  };
  const server = createServer(createRequestHandler(executor));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/dish-images/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ dishName: '神秘新菜', provider: 'rules' })
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as {
      provider: string;
      generationJobId: null;
      image: { status: string; source: string };
    };
    assert.equal(payload.provider, 'rules');
    assert.equal(payload.generationJobId, null);
    assert.equal(payload.image.status, 'pending_ops');
    assert.equal(payload.image.source, 'placeholder');
    assert.ok(calls.some((call) => call.sql.includes('INSERT INTO canonical_dishes')));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('HTTP admin APIs are disabled without ADMIN_API_TOKEN', async () => {
  const server = createServer(createRequestHandler(healthyExecutor));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/admin/dish-images`);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Admin API disabled' });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('HTTP admin APIs require token and route list, update, regenerate and alias operations', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const executor: QueryExecutor = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes('ORDER BY asset.updated_at')) return { rows: [adminAssetRow()] };
      if (sql.includes('FROM dish_assets asset') && sql.includes('WHERE asset.id')) return { rows: [adminAssetRow()] };
      if (sql.includes('SET is_current = false')) return { rows: [] };
      if (sql.includes('UPDATE dish_assets asset')) {
        if (sql.includes("status = 'PENDING'")) return { rows: [adminAssetRow({ status: 'PENDING', is_current: false })] };
        return { rows: [adminAssetRow({ storage_key: 'ops/tomato.webp', is_current: true })] };
      }
      if (sql.includes('FROM canonical_dishes')) {
        return { rows: [{ id: 'a1000000-0000-4000-8000-000000000001', display_name: '番茄炒蛋', status: 'ACTIVE' }] };
      }
      if (sql.includes('INSERT INTO dish_aliases')) {
        return {
          rows: [{
            id: 'c1000000-0000-4000-8000-000000000001',
            canonical_dish_id: 'a1000000-0000-4000-8000-000000000001',
            raw_name: '西红柿炒鸡蛋',
            normalized_name: '西红柿炒鸡蛋',
            locale: 'zh-CN',
            created_by: 'ops-user',
            created_at: '2026-08-05T00:00:00.000Z'
          }]
        };
      }
      if (sql.includes('INSERT INTO admin_audit_logs')) return { rows: [] };
      throw new Error(`unexpected ${sql}`);
    }
  };
  const server = createServer(createRequestHandler(executor, undefined, '', undefined, 'secret-token'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const unauthorized = await fetch(`${baseUrl}/api/admin/dish-images`);
    assert.equal(unauthorized.status, 401);

    const headers = {
      authorization: 'Bearer secret-token',
      'content-type': 'application/json',
      'x-admin-actor': 'ops-user'
    };
    const list = await fetch(`${baseUrl}/api/admin/dish-images?status=READY&q=番茄`, { headers });
    assert.equal(list.status, 200);
    assert.equal(((await list.json()) as { items: Array<{ dishName: string }> }).items[0].dishName, '番茄炒蛋');

    const update = await fetch(`${baseUrl}/api/admin/dish-images/b1000000-0000-4000-8000-000000000001`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ storageKey: 'ops/tomato.webp', isCurrent: true, reason: 'replace' })
    });
    assert.equal(update.status, 200);
    assert.equal(((await update.json()) as { asset: { storageKey: string } }).asset.storageKey, 'ops/tomato.webp');

    const regenerate = await fetch(`${baseUrl}/api/admin/dish-images/b1000000-0000-4000-8000-000000000001/regenerate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'retry' })
    });
    assert.equal(regenerate.status, 200);
    assert.equal(((await regenerate.json()) as { generationJobId: null; provider: string }).provider, 'rules');

    const alias = await fetch(`${baseUrl}/api/admin/dish-aliases`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        canonicalDishId: 'a1000000-0000-4000-8000-000000000001',
        rawName: '西红柿炒鸡蛋'
      })
    });
    assert.equal(alias.status, 200);
    assert.equal(((await alias.json()) as { alias: { normalizedName: string } }).alias.normalizedName, '西红柿炒鸡蛋');
    assert.ok(calls.some((call) => call.sql.includes('INSERT INTO admin_audit_logs')));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('CloudBase readiness rejects a database behind an explicitly expected version', async () => {
  const response = await handleCloudFunctionEvent(
    { path: '/health/ready', httpMethod: 'GET' },
    healthyExecutor,
    EXPECTED_DATABASE_VERSION + 1
  );
  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    status: 'error', service: 'ai-dish-library', database: 'error', databaseVersion: EXPECTED_DATABASE_VERSION,
    expectedDatabaseVersion: EXPECTED_DATABASE_VERSION + 1
  });
});

test('CloudBase package root exports index.main', async () => {
  const entry = require(path.resolve(__dirname, '../../index.js')) as {
    main(event: { path: string; httpMethod: string }): Promise<{ statusCode: number; body: string }>;
  };
  assert.equal(typeof entry.main, 'function');
  const response = await entry.main({ path: '/health/live', httpMethod: 'GET' });
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).status, 'ok');
});

test('CloudBase recipe readiness probes the server-only PG RPC', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const response = await checkCloudBaseRecipeReadiness({
    rpc: {
      async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
        calls.push({ name, args });
        return [] as T;
      }
    }
  });
  assert.deepEqual(calls, [{
    name: 'ai_dish_library_list_recipes',
    args: { p_owner_id: '__cloudbase_readiness_probe__' }
  }]);
  assert.deepEqual(response, {
    ok: true,
    data: {
      status: 'ok', service: 'ai-dish-library', database: 'ok',
      expectedDatabaseVersion: EXPECTED_DATABASE_VERSION
    }
  });
});
