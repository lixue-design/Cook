import { randomUUID } from 'node:crypto';
import type { RpcExecutor, VerifiedIdentity } from './recipe-api';

export type ComplianceApiDependencies = {
  getIdentity(): Promise<VerifiedIdentity>;
  rpc: RpcExecutor;
};
export type ComplianceApiEvent = { action?: string; payload?: unknown };
export type ComplianceApiResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

class ApiError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
const asObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);
const parseOptionalUuid = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === '') return null;
  const id = String(value).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError('INVALID_ARGUMENT', `${field}格式不正确`);
  }
  return id;
};
const ownerFor = async (dependencies: ComplianceApiDependencies): Promise<string> => {
  const identity = await dependencies.getIdentity();
  if (!identity.userId || !identity.appId || !identity.openId) {
    throw new ApiError('UNAUTHENTICATED', '请先登录');
  }
  return dependencies.rpc.call<string>('ai_dish_library_ensure_user', {
    p_user_id: identity.userId,
    p_wx_appid: identity.appId,
    p_wx_openid: identity.openId,
    p_wx_unionid: identity.unionId || null
  });
};

export const handleComplianceApiEvent = async (
  event: ComplianceApiEvent,
  dependencies: ComplianceApiDependencies
): Promise<ComplianceApiResponse> => {
  try {
    if (event.action === 'agreements.latest') {
      const latest = await dependencies.rpc.call<Record<string, unknown> | null>('cook_agreement_latest', {});
      if (!latest) throw new ApiError('NOT_FOUND', '协议版本不存在');
      return { ok: true, data: latest };
    }
    if (event.action === 'agreements.get') {
      const payload = asObject(event.payload);
      const type = String(payload.type || '');
      if (type !== 'service' && type !== 'privacy') {
        throw new ApiError('INVALID_ARGUMENT', '协议类型无效');
      }
      const agreement = await dependencies.rpc.call<Record<string, unknown> | null>('cook_agreement_get', {
        p_type: type,
        p_version: payload.version ? String(payload.version).trim() : null
      });
      if (!agreement) throw new ApiError('NOT_FOUND', '协议版本不存在');
      return { ok: true, data: agreement };
    }
    if (event.action === 'agreements.myStatus') {
      const ownerId = await ownerFor(dependencies);
      const status = await dependencies.rpc.call<Record<string, unknown> | null>('cook_agreement_status', {
        p_owner_id: ownerId
      });
      if (!status) throw new ApiError('NOT_FOUND', '用户不存在');
      return { ok: true, data: status };
    }
    if (event.action === 'agreements.confirm') {
      const payload = asObject(event.payload);
      const version = String(payload.version || '').trim();
      if (!version) throw new ApiError('INVALID_ARGUMENT', '协议版本不能为空');
      const ownerId = await ownerFor(dependencies);
      const status = await dependencies.rpc.call<Record<string, unknown>>('cook_agreement_confirm', {
        p_owner_id: ownerId,
        p_version: version,
        p_source: 'forced'
      });
      return { ok: true, data: status };
    }
    if (event.action === 'account.cancelRequest.get') {
      const ownerId = await ownerFor(dependencies);
      const request = await dependencies.rpc.call<Record<string, unknown> | null>('cook_account_cancel_request_get', {
        p_owner_id: ownerId
      });
      return { ok: true, data: request };
    }
    if (event.action === 'account.cancelRequest.create') {
      const payload = asObject(event.payload);
      const reason = String(payload.reason || '').trim();
      if (reason.length > 500) throw new ApiError('INVALID_ARGUMENT', '注销原因不能超过 500 个字符');
      const ownerId = await ownerFor(dependencies);
      const request = await dependencies.rpc.call<Record<string, unknown>>('cook_account_cancel_request_create', {
        p_owner_id: ownerId,
        p_request_id: randomUUID(),
        p_reason: reason
      });
      return { ok: true, data: request };
    }
    if (event.action === 'account.cancelRequest.cancel') {
      const payload = asObject(event.payload);
      const ownerId = await ownerFor(dependencies);
      const request = await dependencies.rpc.call<Record<string, unknown> | null>('cook_account_cancel_request_cancel', {
        p_owner_id: ownerId,
        p_request_id: parseOptionalUuid(payload.requestId, '注销申请 ID')
      });
      if (!request) throw new ApiError('NOT_FOUND', '注销申请不存在或不可撤销');
      return { ok: true, data: request };
    }
    throw new ApiError('NOT_FOUND', '未知的合规服务操作');
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: { code: error.code, message: error.message } };
    const details = error as { code?: string };
    return {
      ok: false,
      error: details.code === '22023'
        ? { code: 'INVALID_ARGUMENT', message: '合规服务参数无效' }
        : { code: 'INTERNAL_ERROR', message: '服务暂时不可用，请稍后重试' }
    };
  }
};
