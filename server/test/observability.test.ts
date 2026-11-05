import test from 'node:test';
import assert from 'node:assert/strict';
import { observeAction } from '../src/observability';

test('action observation logs only safe metadata and adds request id to failures', async () => {
  const logs: unknown[] = [];
  const response = await observeAction('recipes.create', async () => ({
    ok: false,
    error: {
      code: 'INVALID_ARGUMENT',
      message: 'secret@example.com DATABASE_URL=postgres://private'
    }
  }), {
    createRequestId: () => 'request-123',
    now: (() => {
      const values = [100, 112];
      return () => values.shift() || 112;
    })(),
    log: (entry) => logs.push(entry)
  });
  assert.equal(response.ok, false);
  if (!response.ok) assert.equal(response.error.requestId, 'request-123');
  assert.deepEqual(logs, [{
    event: 'action.complete',
    requestId: 'request-123',
    action: 'recipes.create',
    outcome: 'failure',
    durationMs: 12,
    code: 'INVALID_ARGUMENT'
  }]);
  const serialized = JSON.stringify(logs);
  assert.doesNotMatch(serialized, /secret@example|postgres|private/);
});

test('warnings are logged as nonfatal success codes without messages', async () => {
  const logs: unknown[] = [];
  const response = await observeAction('plans.week.generate', async () => ({
    ok: true,
    data: {
      warnings: [
        { code: 'INSUFFICIENT_RECIPES', message: 'user private recipe title' },
        { code: 'bad code', message: 'ignored' }
      ]
    }
  }), {
    createRequestId: () => 'request-456',
    now: () => 10,
    log: (entry) => logs.push(entry)
  });
  assert.equal(response.ok, true);
  assert.deepEqual(logs, [{
    event: 'action.complete',
    requestId: 'request-456',
    action: 'plans.week.generate',
    outcome: 'success',
    durationMs: 0,
    warningCodes: ['INSUFFICIENT_RECIPES']
  }]);
  assert.doesNotMatch(JSON.stringify(logs), /private recipe title/);
});

test('unexpected handler failures return a stable sanitized error', async () => {
  const response = await observeAction('baskets.week.syncFromPlan', async () => {
    throw new Error('SQL SELECT password FROM secrets');
  }, {
    createRequestId: () => 'request-789',
    now: () => 0,
    log() {}
  });
  assert.deepEqual(response, {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: '服务暂时不可用，请稍后重试',
      requestId: 'request-789'
    }
  });
});
