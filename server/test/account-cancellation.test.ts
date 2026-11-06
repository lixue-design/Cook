import test from 'node:test';
import assert from 'node:assert/strict';
import { runDueAccountCancellations } from '../src/account-cancellation';
import type { RpcExecutor } from '../src/recipe-api';

test('due cancellation removes original and thumbnail covers before the database delete', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const removed: string[][] = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'cook_account_cancel_claim_due') {
        return [{ requestId: 'request-1', coverStorageKeys: ['recipe-covers/a.original.jpg', 'legacy/file.jpg'] }] as T;
      }
      if (name === 'cook_account_cancel_finalize_deletion') return true as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await runDueAccountCancellations({ rpc, removeCovers: async (paths) => { removed.push(paths); } });
  assert.deepEqual(result, { claimed: 1, completed: 1, retrying: 0 });
  assert.deepEqual(removed, [[
    'recipe-covers/a.original.jpg',
    'recipe-covers/a.thumbnail.webp',
    'legacy/file.jpg'
  ]]);
  assert.equal(calls[1].name, 'cook_account_cancel_finalize_deletion');
});

test('a storage or finalize failure becomes a retry instead of reporting completion', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'cook_account_cancel_claim_due') return [{ requestId: 'request-2', coverStorageKeys: [] }] as T;
      if (name === 'cook_account_cancel_finalize_deletion') return false as T;
      if (name === 'cook_account_cancel_mark_retry') return true as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await runDueAccountCancellations({ rpc, removeCovers: async () => {} });
  assert.deepEqual(result, { claimed: 1, completed: 0, retrying: 1 });
  const retry = calls.find((call) => call.name === 'cook_account_cancel_mark_retry');
  assert.equal(retry?.args.p_request_id, 'request-2');
  assert.equal(retry?.args.p_error_code, 'FINALIZE_NOT_CONFIRMED');
});
