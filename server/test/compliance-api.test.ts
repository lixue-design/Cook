import test from 'node:test';
import assert from 'node:assert/strict';
import { handleComplianceApiEvent, type ComplianceApiDependencies } from '../src/compliance-api';
import type { RpcExecutor } from '../src/recipe-api';

const identity = { userId: 'user-a', appId: 'wx-app', openId: 'open-a' };
const dependenciesWith = (rpc: RpcExecutor): ComplianceApiDependencies => ({
  getIdentity: async () => identity,
  rpc
});

test('agreement actions are public, versioned and validate type', async () => {
  let identityCalls = 0;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const dependencies: ComplianceApiDependencies = {
    getIdentity: async () => { identityCalls += 1; return identity; },
    rpc: {
      async call<T>(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        if (name === 'cook_agreement_latest') {
          return {
            serviceAgreementVersion: '2026-07-31',
            privacyPolicyVersion: '2026-07-31',
            requiredAgreementVersion: '2026-07-31'
          } as T;
        }
        if (name === 'cook_agreement_get') {
          return {
            type: args.p_type,
            version: args.p_version || '2026-07-31',
            title: '隐私政策',
            content: '正文'
          } as T;
        }
        return null as T;
      }
    }
  };
  const latest = await handleComplianceApiEvent({ action: 'agreements.latest' }, dependencies);
  assert.equal(latest.ok, true);
  const agreement = await handleComplianceApiEvent({
    action: 'agreements.get',
    payload: { type: 'privacy', version: '2026-07-31' }
  }, dependencies);
  assert.equal(agreement.ok, true);
  const invalid = await handleComplianceApiEvent({
    action: 'agreements.get',
    payload: { type: 'marketing' }
  }, dependencies);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.error.code, 'INVALID_ARGUMENT');
  assert.equal(identityCalls, 0);
  assert.equal(calls[0].name, 'cook_agreement_latest');
  assert.equal(calls[1].args.p_type, 'privacy');
  assert.equal(calls[1].args.p_version, '2026-07-31');
});

test('agreement status and confirmation use trusted owner scope', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_agreement_status') {
        return {
          agreedAgreementVersion: '2026-07-31',
          requiredAgreementVersion: '2026-08-05',
          requiresAgreementConfirm: true
        } as T;
      }
      if (name === 'cook_agreement_confirm') {
        return {
          agreedAgreementVersion: '2026-08-05',
          requiredAgreementVersion: '2026-08-05',
          requiresAgreementConfirm: false
        } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const status = await handleComplianceApiEvent({
    action: 'agreements.myStatus',
    payload: { userId: 'forged' }
  }, dependenciesWith(rpc));
  assert.equal(status.ok, true);
  const statusCall = calls.find((call) => call.name === 'cook_agreement_status');
  assert.equal(statusCall?.args.p_owner_id, identity.userId);

  const confirmed = await handleComplianceApiEvent({
    action: 'agreements.confirm',
    payload: { version: '2026-08-05', userId: 'forged' }
  }, dependenciesWith(rpc));
  assert.equal(confirmed.ok, true);
  const confirmCall = calls.find((call) => call.name === 'cook_agreement_confirm');
  assert.equal(confirmCall?.args.p_owner_id, identity.userId);
  assert.equal(confirmCall?.args.p_version, '2026-08-05');
  assert.equal(confirmCall?.args.p_source, 'forced');
  if (confirmed.ok) {
    const payload = confirmed.data as { requiresAgreementConfirm: boolean };
    assert.equal(payload.requiresAgreementConfirm, false);
  }
});

test('cancel request uses trusted owner and returns the trackable record', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_account_cancel_request_create') {
        return { id: args.p_request_id, status: 'submitted', submittedAt: '2026-07-31T12:00:00Z' } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleComplianceApiEvent({
    action: 'account.cancelRequest.create',
    payload: { ownerId: 'forged', reason: '不再使用' }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  assert.equal(calls[1].args.p_owner_id, identity.userId);
  assert.equal(calls[1].args.p_reason, '不再使用');
});

test('cancel request get and cancel use trusted owner scope', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_account_cancel_request_get') {
        return {
          id: '70000000-0000-4000-8000-000000000001',
          status: 'reviewing',
          submittedAt: '2026-07-31T12:00:00Z',
          updatedAt: '2026-08-01T12:00:00Z'
        } as T;
      }
      if (name === 'cook_account_cancel_request_cancel') {
        return {
          id: args.p_request_id,
          status: 'cancelled_by_user',
          submittedAt: '2026-07-31T12:00:00Z',
          updatedAt: '2026-08-01T12:00:00Z'
        } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const current = await handleComplianceApiEvent({
    action: 'account.cancelRequest.get',
    payload: { userId: 'forged' }
  }, dependenciesWith(rpc));
  assert.equal(current.ok, true);
  const getCall = calls.find((call) => call.name === 'cook_account_cancel_request_get');
  assert.equal(getCall?.args.p_owner_id, identity.userId);

  const cancelled = await handleComplianceApiEvent({
    action: 'account.cancelRequest.cancel',
    payload: { requestId: '70000000-0000-4000-8000-000000000001', userId: 'forged' }
  }, dependenciesWith(rpc));
  assert.equal(cancelled.ok, true);
  const cancelCall = calls.find((call) => call.name === 'cook_account_cancel_request_cancel');
  assert.equal(cancelCall?.args.p_owner_id, identity.userId);
  assert.equal(cancelCall?.args.p_request_id, '70000000-0000-4000-8000-000000000001');
  if (cancelled.ok) {
    const request = cancelled.data as { status: string };
    assert.equal(request.status, 'cancelled_by_user');
  }
});

test('cancel request rejects overlong reasons and missing identity before write', async () => {
  let calls = 0;
  const dependencies: ComplianceApiDependencies = {
    getIdentity: async () => ({ userId: '', appId: '', openId: '' }),
    rpc: { async call<T>() { calls += 1; return null as T; } }
  };
  const tooLong = await handleComplianceApiEvent({
    action: 'account.cancelRequest.create',
    payload: { reason: 'x'.repeat(501) }
  }, dependencies);
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) assert.equal(tooLong.error.code, 'INVALID_ARGUMENT');
  const missing = await handleComplianceApiEvent({
    action: 'account.cancelRequest.create',
    payload: { reason: '' }
  }, dependencies);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, 'UNAUTHENTICATED');
  assert.equal(calls, 0);
});
