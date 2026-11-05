import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleRecipeGenerationApiEvent,
  recipeGenerationApiInternals,
  type RecipeGenerationApiResponse
} from '../src/recipe-generation-api';
import type { CoverStorage, RecipeApiDependencies, RpcExecutor } from '../src/recipe-api';

const identity = { userId: 'cloud-user-a', appId: 'wx-app', openId: 'open-a' };
const jobId = '90000000-0000-4000-8000-000000000001';

const covers: CoverStorage = {
  async upload() {},
  async signedUrls() { return {}; }
};

const dependenciesWith = (rpc: RpcExecutor): RecipeApiDependencies => ({
  getIdentity: async () => identity,
  rpc,
  covers
});

const jobRow = (overrides: Record<string, unknown> = {}) => ({
  jobId,
  status: 'succeeded',
  sourceType: 'text',
  provider: 'rules',
  input: { text: '番茄炒蛋' },
  resultDraft: { title: '番茄炒蛋' },
  warnings: [],
  explanations: [],
  error: null,
  requestId: 'request-1',
  costUnits: 0,
  createdAt: '2026-08-05T10:00:00.000Z',
  updatedAt: '2026-08-05T10:00:00.000Z',
  completedAt: '2026-08-05T10:00:01.000Z',
  ...overrides
});

test('create runs rules provider and persists an owner-scoped succeeded job', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_recipe_generation_job_create') return jobRow({ status: 'running' }) as T;
      if (name === 'cook_recipe_generation_job_complete') {
        return jobRow({
          jobId: args.p_job_id,
          requestId: calls.find((call) => call.name === 'cook_recipe_generation_job_create')?.args.p_request_id,
          resultDraft: args.p_result_draft,
          warnings: args.p_warnings,
          explanations: args.p_explanations
        }) as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };

  const result = await handleRecipeGenerationApiEvent({
    action: 'generation.recipeJobs.create',
    payload: {
      sourceType: 'text',
      provider: 'rules',
      input: { text: '菜名：番茄炒蛋\n食材：番茄2个、鸡蛋3个\n步骤：炒熟。' },
      userId: 'forged-user'
    }
  }, dependenciesWith(rpc));

  assert.equal(result.ok, true);
  const createCall = calls.find((call) => call.name === 'cook_recipe_generation_job_create');
  const completeCall = calls.find((call) => call.name === 'cook_recipe_generation_job_complete');
  assert.equal(createCall?.args.p_owner_id, identity.userId);
  assert.equal(createCall?.args.p_source_type, 'text');
  assert.equal(createCall?.args.p_provider, 'rules');
  assert.equal(completeCall?.args.p_status, 'succeeded');
  assert.equal((completeCall?.args.p_result_draft as { title: string }).title, '番茄炒蛋');
  if (result.ok) {
    const job = result.data as { status: string; resultDraft: { title: string } };
    assert.equal(job.status, 'succeeded');
    assert.equal(job.resultDraft.title, '番茄炒蛋');
  }
});

test('provider failures are stored as failed jobs with stable errors', async () => {
  let completeArgs: Record<string, unknown> | undefined;
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_recipe_generation_job_create') return jobRow({ status: 'running' }) as T;
      if (name === 'cook_recipe_generation_job_complete') {
        completeArgs = args;
        return jobRow({
          status: 'failed',
          resultDraft: null,
          error: { code: args.p_error_code, message: args.p_error_message }
        }) as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleRecipeGenerationApiEvent({
    action: 'generation.recipeJobs.create',
    payload: { sourceType: 'image', provider: 'rules', input: { imageFileId: 'cloud://temp/recipe.jpg' } }
  }, dependenciesWith(rpc));

  assert.equal(result.ok, true);
  assert.equal(completeArgs?.p_status, 'failed');
  assert.equal(completeArgs?.p_error_code, 'IMAGE_RULES_INPUT_INSUFFICIENT');
  if (result.ok) {
    const job = result.data as { status: string; error: { code: string } };
    assert.equal(job.status, 'failed');
    assert.equal(job.error.code, 'IMAGE_RULES_INPUT_INSUFFICIENT');
  }
});

test('ai provider is rejected before job creation in the first version', async () => {
  let jobCalls = 0;
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      jobCalls += 1;
      return null as T;
    }
  };
  const result = await handleRecipeGenerationApiEvent({
    action: 'generation.recipeJobs.create',
    payload: { sourceType: 'text', provider: 'ai', input: { text: '番茄炒蛋' } }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, false);
  assert.equal((result as Extract<RecipeGenerationApiResponse, { ok: false }>).error.code, 'GENERATION_PROVIDER_UNAVAILABLE');
  assert.match((result as Extract<RecipeGenerationApiResponse, { ok: false }>).requestId || '', /^[0-9a-f-]{36}$/);
  assert.equal(jobCalls, 0);
});

test('get and cancel use trusted owner scope', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_recipe_generation_job_get') return jobRow() as T;
      if (name === 'cook_recipe_generation_job_cancel') return jobRow({ status: 'cancelled' }) as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const getResult = await handleRecipeGenerationApiEvent({
    action: 'generation.recipeJobs.get',
    payload: { jobId, userId: 'forged-user' }
  }, dependenciesWith(rpc));
  const cancelResult = await handleRecipeGenerationApiEvent({
    action: 'generation.recipeJobs.cancel',
    payload: { jobId, userId: 'forged-user' }
  }, dependenciesWith(rpc));
  assert.equal(getResult.ok, true);
  assert.equal(cancelResult.ok, true);
  assert.equal(calls.find((call) => call.name === 'cook_recipe_generation_job_get')?.args.p_owner_id, identity.userId);
  assert.equal(calls.find((call) => call.name === 'cook_recipe_generation_job_cancel')?.args.p_owner_id, identity.userId);
});

test('completed jobs cannot be cancelled', async () => {
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_recipe_generation_job_cancel') return jobRow({ status: 'succeeded' }) as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleRecipeGenerationApiEvent({
    action: 'generation.recipeJobs.cancel',
    payload: { jobId }
  }, dependenciesWith(rpc));
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'CONFLICT', message: '生成任务已完成，不能取消' }
  });
});

test('invalid job ids and create payloads are rejected before job RPCs', async () => {
  assert.throws(() => recipeGenerationApiInternals.parseUuid('bad', '生成任务 ID'));
  let jobCalls = 0;
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      jobCalls += 1;
      return null as T;
    }
  };
  const invalidEvents = [
    { action: 'generation.recipeJobs.get', payload: { jobId: 'bad' } },
    { action: 'generation.recipeJobs.create', payload: { sourceType: 'text', provider: 'rules', input: { text: '  ' } } }
  ];
  for (const event of invalidEvents) {
    const result = await handleRecipeGenerationApiEvent(event, dependenciesWith(rpc));
    assert.equal(result.ok, false);
    assert.equal((result as Extract<RecipeGenerationApiResponse, { ok: false }>).error.code, 'INVALID_ARGUMENT');
  }
  assert.equal(jobCalls, 0);
});
