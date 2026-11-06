import { getPool } from './db';
import { getLiveness, getReadiness, type QueryExecutor } from './health';
import { EXPECTED_DATABASE_VERSION } from './schema-version';
import {
  handleRecipeApiEvent,
  type RecipeApiDependencies,
  type RecipeApiEvent,
  type RecipeApiResponse
} from './recipe-api';
import {
  handlePlanApiEvent,
  type PlanApiEvent,
  type PlanApiResponse
} from './plan-api';
import {
  handleBasketApiEvent,
  type BasketApiEvent,
  type BasketApiResponse
} from './basket-api';
import { handleAuthApiEvent, type AuthApiResponse } from './auth-api';
import { handleComplianceApiEvent, type ComplianceApiResponse } from './compliance-api';
import { runDueAccountCancellations } from './account-cancellation';
import {
  handleRecipeGenerationApiEvent,
  type RecipeGenerationApiEvent,
  type RecipeGenerationApiResponse
} from './recipe-generation-api';
import { observeAction } from './observability';

type CloudFunctionEvent = {
  action?: string;
  payload?: unknown;
  internalToken?: string;
  path?: string;
  rawPath?: string;
  httpMethod?: string;
  requestContext?: { http?: { method?: string } };
};

type CloudFunctionResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export const handleCloudFunctionEvent = async (
  event: CloudFunctionEvent,
  executor: QueryExecutor,
  expectedDatabaseVersion = EXPECTED_DATABASE_VERSION
): Promise<CloudFunctionResponse> => {
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
  const path = event.rawPath || event.path || '/health';
  let statusCode = 200;
  let payload: unknown;

  if (method !== 'GET') {
    statusCode = 405;
    payload = { error: 'Method Not Allowed' };
  } else if (path === '/health/live') {
    payload = getLiveness();
  } else if (path === '/health' || path === '/health/ready' || path === '/') {
    payload = await getReadiness(executor, expectedDatabaseVersion);
    statusCode = (payload as { status: string }).status === 'ok' ? 200 : 503;
  } else {
    statusCode = 404;
    payload = { error: 'Not Found' };
  }

  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(payload)
  };
};

const lazyPoolExecutor: QueryExecutor = {
  query(sql: string) {
    return getPool().query(sql);
  }
};

export const checkCloudBaseRecipeReadiness = async (
  dependencies: Pick<RecipeApiDependencies, 'rpc'>
): Promise<RecipeApiResponse> => {
  try {
    await dependencies.rpc.call('ai_dish_library_list_recipes', {
      p_owner_id: '__cloudbase_readiness_probe__'
    });
    return {
      ok: true,
      data: {
        status: 'ok',
        service: 'ai-dish-library',
        database: 'ok',
        expectedDatabaseVersion: EXPECTED_DATABASE_VERSION
      }
    };
  } catch (error) {
    const details = error as { code?: unknown };
    console.log('[cloudbase-readiness]', {
      code: String(details.code || 'UNKNOWN')
    });
    return {
      ok: false,
      error: { code: 'DATABASE_UNAVAILABLE', message: '数据库就绪检查失败' }
    };
  }
};

export const main = async (
  event: CloudFunctionEvent
): Promise<CloudFunctionResponse | RecipeApiResponse | PlanApiResponse | BasketApiResponse | AuthApiResponse | ComplianceApiResponse | RecipeGenerationApiResponse> => {
  if (event.action) {
    const action = event.action;
    return observeAction(action, async () => {
      const { cloudbaseRecipeDependencies, cloudbaseAccountCancellationDependencies } = await import('./cloudbase-runtime.js');
      if (action === 'system.accountCancellation.runDue') {
        const token = String(process.env.ACCOUNT_CANCELLATION_TIMER_TOKEN || '').trim();
        if (!token || event.internalToken !== token) {
          return { ok: false, error: { code: 'FORBIDDEN', message: '系统任务未获授权' } };
        }
        const result = await runDueAccountCancellations(cloudbaseAccountCancellationDependencies);
        return { ok: true, data: result };
      }
      if (action === 'health.ready') {
        return checkCloudBaseRecipeReadiness(cloudbaseRecipeDependencies);
      }
      if (action.startsWith('auth.')) {
        return handleAuthApiEvent(event, cloudbaseRecipeDependencies);
      }
      if (action.startsWith('agreements.') || action.startsWith('account.')) {
        return handleComplianceApiEvent(event, cloudbaseRecipeDependencies);
      }
      if (action.startsWith('plans.')) {
        return handlePlanApiEvent(event as PlanApiEvent, cloudbaseRecipeDependencies);
      }
      if (action.startsWith('generation.')) {
        return handleRecipeGenerationApiEvent(event as RecipeGenerationApiEvent, cloudbaseRecipeDependencies);
      }
      if (action.startsWith('baskets.')) {
        return handleBasketApiEvent(event as BasketApiEvent, cloudbaseRecipeDependencies);
      }
      return handleRecipeApiEvent(event as RecipeApiEvent, cloudbaseRecipeDependencies);
    }) as Promise<RecipeApiResponse | PlanApiResponse | BasketApiResponse | AuthApiResponse | ComplianceApiResponse | RecipeGenerationApiResponse>;
  }
  return handleCloudFunctionEvent(event, lazyPoolExecutor);
};
