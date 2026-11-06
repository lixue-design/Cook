import { thumbnailStorageKeyFor } from './recipe-cover-storage.js';
import type { RpcExecutor } from './recipe-api';

type DueCancellation = {
  requestId?: string;
  coverStorageKeys?: unknown;
};

export type AccountCancellationDependencies = {
  rpc: RpcExecutor;
  removeCovers(paths: string[]): Promise<void>;
};

const asStringArray = (value: unknown): string[] => (
  Array.isArray(value)
    ? [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
    : []
);

const errorCode = (error: unknown): string => {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code || '').trim();
    if (code) return code.slice(0, 80);
  }
  return 'ACCOUNT_CANCELLATION_FAILED';
};

/**
 * Called only by the CloudBase timer. It claims due work server-side, removes
 * user cover files, then commits the owner-scoped database deletion atomically.
 */
export const runDueAccountCancellations = async (
  dependencies: AccountCancellationDependencies,
  limit = 20
): Promise<{ claimed: number; completed: number; retrying: number }> => {
  const due = await dependencies.rpc.call<DueCancellation[]>('cook_account_cancel_claim_due', {
    p_limit: Math.min(Math.max(Math.trunc(limit) || 20, 1), 50)
  });
  let completed = 0;
  let retrying = 0;

  for (const item of due || []) {
    const requestId = String(item.requestId || '').trim();
    if (!requestId) continue;
    try {
      const originals = asStringArray(item.coverStorageKeys);
      const coverPaths = [...new Set(originals.flatMap((path) => [path, thumbnailStorageKeyFor(path)]).filter(Boolean))];
      if (coverPaths.length) await dependencies.removeCovers(coverPaths);
      const finalized = await dependencies.rpc.call<boolean>('cook_account_cancel_finalize_deletion', {
        p_request_id: requestId
      });
      if (!finalized) {
        const error = new Error('账号数据删除未确认完成');
        Object.assign(error, { code: 'FINALIZE_NOT_CONFIRMED' });
        throw error;
      }
      completed += 1;
    } catch (error) {
      await dependencies.rpc.call<boolean>('cook_account_cancel_mark_retry', {
        p_request_id: requestId,
        p_error_code: errorCode(error)
      });
      retrying += 1;
    }
  }

  return { claimed: (due || []).length, completed, retrying };
};
