import { randomUUID } from 'node:crypto';
import type { RecipeApiDependencies, VerifiedIdentity } from './recipe-api';
import {
  executeRecipeGeneration,
  GenerationError,
  parseRecipeGenerationRequest,
  type NormalizedRecipeGenerationRequest
} from './recipe-generation-engine';

export type RecipeGenerationApiEvent = {
  action?: string;
  payload?: unknown;
};

type ApiSuccess = { ok: true; data: unknown };
type ApiFailure = { ok: false; error: { code: string; message: string }; requestId?: string };
export type RecipeGenerationApiResponse = ApiSuccess | ApiFailure;

type RecipeGenerationJobRow = {
  jobId: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  sourceType: 'link' | 'image' | 'text';
  provider: 'rules' | 'ai';
  input?: Record<string, unknown>;
  resultDraft?: Record<string, unknown> | null;
  warnings?: Array<{ code: string; message: string }>;
  explanations?: Array<{ code: string; message: string }>;
  error?: { code: string; message: string } | null;
  requestId: string;
  costUnits?: number;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
};

class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly requestId?: string) {
    super(message);
  }
}

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('INVALID_ARGUMENT', '请求参数格式不正确');
  }
  return value as Record<string, unknown>;
};

const parseUuid = (value: unknown, field: string): string => {
  const id = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError('INVALID_ARGUMENT', `${field}格式不正确`);
  }
  return id;
};

const ensureIdentity = async (dependencies: RecipeApiDependencies): Promise<VerifiedIdentity> => {
  const identity = await dependencies.getIdentity();
  if (!identity.userId || !identity.appId || !identity.openId) {
    throw new ApiError('UNAUTHENTICATED', '未获取到可信的微信用户身份');
  }
  const userId = await dependencies.rpc.call<string>('ai_dish_library_ensure_user', {
    p_user_id: identity.userId,
    p_wx_appid: identity.appId,
    p_wx_openid: identity.openId,
    p_wx_unionid: identity.unionId || null
  });
  return { ...identity, userId };
};

const parseCreatePayload = (payload: unknown, requestId: string): NormalizedRecipeGenerationRequest => {
  try {
    const request = parseRecipeGenerationRequest(asObject(payload));
    if (request.provider !== 'rules') {
      throw new GenerationError('GENERATION_PROVIDER_UNAVAILABLE', 'AI provider 暂未启用，请使用 rules');
    }
    return request;
  } catch (error) {
    if (error instanceof GenerationError) {
      throw new ApiError(error.code, error.message, requestId);
    }
    throw error;
  }
};

const createJob = async (
  dependencies: RecipeApiDependencies,
  identity: VerifiedIdentity,
  payload: unknown
): Promise<RecipeGenerationJobRow> => {
  const requestId = randomUUID();
  const normalized = parseCreatePayload(payload, requestId);
  const jobId = randomUUID();

  await dependencies.rpc.call<RecipeGenerationJobRow>('cook_recipe_generation_job_create', {
    p_owner_id: identity.userId,
    p_job_id: jobId,
    p_source_type: normalized.sourceType,
    p_provider: normalized.provider,
    p_input_payload: normalized.input,
    p_request_id: requestId
  });

  const execution = await executeRecipeGeneration({
    sourceType: normalized.sourceType,
    provider: normalized.provider,
    input: normalized.input
  }, { createRequestId: () => requestId });

  const completed = await dependencies.rpc.call<RecipeGenerationJobRow | null>('cook_recipe_generation_job_complete', {
    p_owner_id: identity.userId,
    p_job_id: jobId,
    p_status: execution.ok ? 'succeeded' : 'failed',
    p_result_draft: execution.ok ? execution.data.draft : null,
    p_warnings: execution.ok ? execution.data.warnings : [],
    p_explanations: execution.ok ? execution.data.explanations : [],
    p_error_code: execution.ok ? null : execution.error.code,
    p_error_message: execution.ok ? null : execution.error.message,
    p_cost_units: 0
  });
  if (!completed) throw new ApiError('INTERNAL_ERROR', '生成任务状态更新失败', requestId);
  return completed;
};

const getJob = async (
  dependencies: RecipeApiDependencies,
  identity: VerifiedIdentity,
  payload: unknown
): Promise<RecipeGenerationJobRow> => {
  const jobId = parseUuid(asObject(payload).jobId, '生成任务 ID');
  const job = await dependencies.rpc.call<RecipeGenerationJobRow | null>('cook_recipe_generation_job_get', {
    p_owner_id: identity.userId,
    p_job_id: jobId
  });
  if (!job) throw new ApiError('NOT_FOUND', '生成任务不存在');
  return job;
};

const cancelJob = async (
  dependencies: RecipeApiDependencies,
  identity: VerifiedIdentity,
  payload: unknown
): Promise<RecipeGenerationJobRow> => {
  const jobId = parseUuid(asObject(payload).jobId, '生成任务 ID');
  const job = await dependencies.rpc.call<RecipeGenerationJobRow | null>('cook_recipe_generation_job_cancel', {
    p_owner_id: identity.userId,
    p_job_id: jobId
  });
  if (!job) throw new ApiError('NOT_FOUND', '生成任务不存在');
  if (job.status !== 'cancelled') throw new ApiError('CONFLICT', '生成任务已完成，不能取消');
  return job;
};

const runAction = async (
  event: RecipeGenerationApiEvent,
  dependencies: RecipeApiDependencies,
  identity: VerifiedIdentity
): Promise<unknown> => {
  switch (event.action) {
    case 'generation.recipeJobs.create':
      return createJob(dependencies, identity, event.payload || {});
    case 'generation.recipeJobs.get':
      return getJob(dependencies, identity, event.payload || {});
    case 'generation.recipeJobs.cancel':
      return cancelJob(dependencies, identity, event.payload || {});
    default:
      throw new ApiError('NOT_FOUND', '未知的生成服务操作');
  }
};

export const handleRecipeGenerationApiEvent = async (
  event: RecipeGenerationApiEvent,
  dependencies: RecipeApiDependencies
): Promise<RecipeGenerationApiResponse> => {
  try {
    const identity = await ensureIdentity(dependencies);
    return { ok: true, data: await runAction(event, dependencies, identity) };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        ok: false,
        error: { code: error.code, message: error.message },
        ...(error.requestId ? { requestId: error.requestId } : {})
      };
    }
    const details = error as { code?: string };
    const invalid = details.code === '22023';
    return {
      ok: false,
      error: {
        code: invalid ? 'INVALID_ARGUMENT' : 'INTERNAL_ERROR',
        message: invalid ? '生成任务参数无效' : '生成服务暂时不可用，请稍后重试'
      }
    };
  }
};

export const recipeGenerationApiInternals = {
  parseUuid,
  parseCreatePayload
};
