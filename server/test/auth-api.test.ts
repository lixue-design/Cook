import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAuthApiEvent, type AuthApiDependencies } from '../src/auth-api';
import type { RpcExecutor } from '../src/recipe-api';

const identity = { userId: 'user-a', appId: 'wx-app', openId: 'open-a' };
const dependenciesWith = (rpc: RpcExecutor): AuthApiDependencies => ({
  getIdentity: async () => identity,
  rpc
});

test('login trusts server identity and records agreement with public profile', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_auth_assign_default_profile') {
        return { id: identity.userId, nickName: '食光旅人 A7K2', avatarUrl: '/assets/profile/preset-avatar-3.png' } as T;
      }
      if (name === 'cook_auth_update_profile') {
        return {
          id: identity.userId,
          status: 'active',
          agreedAgreementVersion: '2026-07-31',
          requiredAgreementVersion: '2026-07-31',
          requiresAgreementConfirm: false
        } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleAuthApiEvent({
    action: 'auth.wechatLogin',
    payload: {
      userId: 'forged',
      agreedAgreementVersion: '2026-07-31',
      profile: { nickName: '半勺用户', avatarUrl: 'https://example.test/avatar.png' }
    }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  assert.equal(calls[0].args.p_user_id, identity.userId);
  assert.equal(calls[1].name, 'cook_auth_assign_default_profile');
  assert.equal(calls[2].args.p_agreement_version, '2026-07-31');
  assert.equal(calls[2].args.p_nickname, '食光旅人 A7K2');
});

test('login requires agreement and me rejects inactive users', async () => {
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_auth_get_user') return { id: identity.userId, status: 'blocked' } as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const missingAgreement = await handleAuthApiEvent({
    action: 'auth.wechatLogin',
    payload: {}
  }, dependenciesWith(rpc));
  assert.equal(missingAgreement.ok, false);
  if (!missingAgreement.ok) assert.equal(missingAgreement.error.code, 'INVALID_ARGUMENT');
  const me = await handleAuthApiEvent({ action: 'auth.me' }, dependenciesWith(rpc));
  assert.equal(me.ok, false);
  if (!me.ok) assert.equal(me.error.code, 'FORBIDDEN');
});

test('me returns agreement confirmation status and stale login versions are rejected', async () => {
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_auth_get_user') {
        return {
          id: identity.userId,
          status: 'active',
          agreedAgreementVersion: '2026-07-31',
          requiredAgreementVersion: '2026-08-05',
          requiresAgreementConfirm: true
        } as T;
      }
      if (name === 'cook_auth_assign_default_profile') {
        return { id: identity.userId, nickName: '食光旅人 A7K2', avatarUrl: '/assets/profile/preset-avatar-3.png' } as T;
      }
      if (name === 'cook_auth_update_profile') {
        const error = new Error('invalid agreement version') as Error & { code?: string };
        error.code = '22023';
        throw error;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const me = await handleAuthApiEvent({ action: 'auth.me' }, dependenciesWith(rpc));
  assert.equal(me.ok, true);
  if (me.ok) {
    const user = me.data as { requiresAgreementConfirm: boolean; requiredAgreementVersion: string };
    assert.equal(user.requiresAgreementConfirm, true);
    assert.equal(user.requiredAgreementVersion, '2026-08-05');
  }

  const staleLogin = await handleAuthApiEvent({
    action: 'auth.wechatLogin',
    payload: {
      agreedAgreementVersion: '2026-07-31',
      profile: {}
    }
  }, dependenciesWith(rpc));
  assert.equal(staleLogin.ok, false);
  if (!staleLogin.ok) assert.equal(staleLogin.error.code, 'INVALID_ARGUMENT');
});

test('missing trusted identity is unauthenticated and logout is non-destructive', async () => {
  let calls = 0;
  const missing = await handleAuthApiEvent({ action: 'auth.me' }, {
    getIdentity: async () => ({ userId: '', appId: '', openId: '' }),
    rpc: { async call<T>() { calls += 1; return null as T; } }
  });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, 'UNAUTHENTICATED');
  assert.equal(calls, 0);
  const logout = await handleAuthApiEvent({ action: 'auth.logout' }, dependenciesWith({
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      throw new Error(`unexpected ${name}`);
    }
  }));
  assert.deepEqual(logout, { ok: true, data: { loggedOut: true } });
});
