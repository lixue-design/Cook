import { randomUUID } from 'node:crypto';

type ApiResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; requestId?: string } };
type SafeLog = {
  event: 'action.complete';
  requestId: string;
  action: string;
  outcome: 'success' | 'failure';
  code?: string;
  warningCodes?: string[];
  durationMs: number;
};
type ObserveOptions = {
  createRequestId?: () => string;
  now?: () => number;
  log?: (entry: SafeLog) => void;
};

const safeAction = (value: unknown): string => {
  const action = String(value || '');
  return /^[a-z][a-z0-9._-]{0,79}$/i.test(action) ? action : 'unknown';
};
const warningCodes = (response: ApiResponse): string[] => {
  if (!response.ok || !response.data || typeof response.data !== 'object') return [];
  const warnings = (response.data as { warnings?: unknown }).warnings;
  if (!Array.isArray(warnings)) return [];
  return warnings.map((warning) => (
    warning && typeof warning === 'object' ? String((warning as { code?: unknown }).code || '') : ''
  )).filter((code) => /^[A-Z][A-Z0-9_]{0,63}$/.test(code));
};

export const observeAction = async (
  actionValue: unknown,
  handler: () => Promise<ApiResponse>,
  options: ObserveOptions = {}
): Promise<ApiResponse> => {
  const action = safeAction(actionValue);
  const requestId = (options.createRequestId || randomUUID)();
  const now = options.now || Date.now;
  const startedAt = now();
  let response: ApiResponse;
  try {
    response = await handler();
  } catch {
    response = { ok: false, error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试' } };
  }
  const entry: SafeLog = {
    event: 'action.complete',
    requestId,
    action,
    outcome: response.ok ? 'success' : 'failure',
    durationMs: Math.max(0, now() - startedAt)
  };
  const warnings = warningCodes(response);
  if (warnings.length) entry.warningCodes = warnings;
  if (!response.ok) entry.code = response.error.code;
  (options.log || ((value) => console.log('[action]', JSON.stringify(value))))(entry);
  if (!response.ok) {
    return { ...response, error: { ...response.error, requestId } };
  }
  return response;
};

export const observabilityInternals = { safeAction, warningCodes };
