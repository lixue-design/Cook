import type { RpcExecutor, VerifiedIdentity } from './recipe-api';

export type AuthApiDependencies = {
  getIdentity(): Promise<VerifiedIdentity>;
  rpc: RpcExecutor;
};
export type AuthApiEvent = { action?: string; payload?: unknown };
export type AuthApiResponse =
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
const ensureIdentity = async (
  dependencies: AuthApiDependencies,
  createIfMissing: boolean
): Promise<VerifiedIdentity> => {
  const identity = await dependencies.getIdentity();
  if (!identity.userId || !identity.appId || !identity.openId) {
    throw new ApiError('UNAUTHENTICATED', '请先完成微信登录');
  }
  const userId = await dependencies.rpc.call<string | null>('ai_dish_library_ensure_user', {
    p_user_id: identity.userId,
    p_wx_appid: identity.appId,
    p_wx_openid: identity.openId,
    p_wx_unionid: identity.unionId || null,
    p_create: createIfMissing
  });
  if (!userId) throw new ApiError('UNAUTHENTICATED', '请先完成微信登录');
  return { ...identity, userId };
};

export const handleAuthApiEvent = async (
  event: AuthApiEvent,
  dependencies: AuthApiDependencies
): Promise<AuthApiResponse> => {
  try {
    if (event.action === 'auth.logout') return { ok: true, data: { loggedOut: true } };
    if (event.action === 'auth.wechatLogin') {
      const payload = asObject(event.payload);
      const agreementVersion = String(payload.agreedAgreementVersion || '').trim();
      if (!agreementVersion) throw new ApiError('INVALID_ARGUMENT', '请先阅读并同意用户协议和隐私政策');
      const identity = await ensureIdentity(dependencies, true);
      const initializedProfile = await dependencies.rpc.call<Record<string, unknown>>('cook_auth_assign_default_profile', {
        p_user_id: identity.userId
      });
      const user = await dependencies.rpc.call<Record<string, unknown>>('cook_auth_update_profile', {
        p_user_id: identity.userId,
        p_nickname: String(initializedProfile.nickName || '').trim(),
        p_avatar_url: String(initializedProfile.avatarUrl || '').trim(),
        p_agreement_version: agreementVersion
      });
      return { ok: true, data: { user } };
    }
    const identity = await ensureIdentity(dependencies, false);
    if (event.action === 'auth.me') {
      const user = await dependencies.rpc.call<Record<string, unknown> | null>('cook_auth_get_user', {
        p_user_id: identity.userId
      });
      if (!user) throw new ApiError('UNAUTHENTICATED', '用户登录态无效');
      if (user.status !== 'active') throw new ApiError('FORBIDDEN', '当前账号不可用');
      return { ok: true, data: user };
    }
    throw new ApiError('NOT_FOUND', '未知的登录服务操作');
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: { code: error.code, message: error.message } };
    const details = error as { code?: string };
    if (details.code === '22023') {
      return { ok: false, error: { code: 'INVALID_ARGUMENT', message: '登录参数无效' } };
    }
    if (details.code === '42501') {
      return { ok: false, error: { code: 'FORBIDDEN', message: '当前账号不可用' } };
    }
    return { ok: false, error: { code: 'INTERNAL_ERROR', message: '登录服务暂时不可用' } };
  }
};
