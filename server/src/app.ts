import type { IncomingMessage, ServerResponse } from 'node:http';
import { getLiveness, getReadiness, type QueryExecutor } from './health';
import { EXPECTED_DATABASE_VERSION } from './schema-version';
import {
  createAdminDishAlias,
  createDishImageGenerationPlaceholder,
  listAdminDishImages,
  regenerateAdminDishImage,
  hasExactDishImageMatch,
  readDishImage,
  searchDishImages,
  updateAdminDishImage,
  type AdminDishImageStatus,
  type AdminDishImageUpdateInput,
  type AdminOperationContext
} from './dish-image-library';

export type DishImageFallback = (dishName: string) => Promise<void>;

const writeJson = (response: ServerResponse, statusCode: number, payload: unknown): void => {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(JSON.stringify(payload));
};

const readJsonBody = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid JSON body');
  return parsed as Record<string, unknown>;
};

const headerValue = (request: IncomingMessage, name: string): string => {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
};

const extractAdminToken = (request: IncomingMessage): string => {
  const authorization = headerValue(request, 'authorization').trim();
  if (authorization.toLowerCase().startsWith('bearer ')) return authorization.slice(7).trim();
  return headerValue(request, 'x-admin-token').trim();
};

const authorizeAdminRequest = (
  request: IncomingMessage,
  response: ServerResponse,
  adminApiToken: string
): boolean => {
  if (!adminApiToken) {
    writeJson(response, 403, { error: 'Admin API disabled' });
    return false;
  }
  if (extractAdminToken(request) !== adminApiToken) {
    writeJson(response, 401, { error: 'Unauthorized' });
    return false;
  }
  return true;
};

const adminContextFromRequest = (
  request: IncomingMessage,
  body: Record<string, unknown> = {}
): AdminOperationContext => ({
  actorId: headerValue(request, 'x-admin-actor').trim() || 'admin-api',
  reason: typeof body.reason === 'string' ? body.reason.trim() || undefined : undefined,
  requestId: headerValue(request, 'x-request-id').trim()
    || (typeof body.requestId === 'string' ? body.requestId.trim() || undefined : undefined)
});

const optionalString = (body: Record<string, unknown>, key: string): string | null | undefined => {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${key} must be a string`);
  return value;
};

const optionalNumber = (body: Record<string, unknown>, key: string): number | null | undefined => {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return null;
  if (typeof value !== 'number') throw new Error(`${key} must be a number`);
  return value;
};

const optionalBoolean = (body: Record<string, unknown>, key: string): boolean | undefined => {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (typeof value !== 'boolean') throw new Error(`${key} must be a boolean`);
  return value;
};

const adminDishImageUpdateInputFromBody = (body: Record<string, unknown>): AdminDishImageUpdateInput => ({
  status: body.status === undefined
    ? undefined
    : String(body.status).trim().toUpperCase() as AdminDishImageStatus,
  storageKey: optionalString(body, 'storageKey'),
  mimeType: optionalString(body, 'mimeType'),
  width: optionalNumber(body, 'width'),
  height: optionalNumber(body, 'height'),
  provider: optionalString(body, 'provider') ?? undefined,
  providerModel: optionalString(body, 'providerModel'),
  isCurrent: optionalBoolean(body, 'isCurrent'),
  failureCode: optionalString(body, 'failureCode'),
  failureSummary: optionalString(body, 'failureSummary')
});

export const createRequestHandler = (
  executor: QueryExecutor,
  expectedDatabaseVersion = EXPECTED_DATABASE_VERSION,
  imageStorageRoot = '',
  imageFallback?: DishImageFallback,
  adminApiToken = ''
) => (
  request: IncomingMessage,
  response: ServerResponse
): void => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname === '/api/admin/dish-images') {
    if (request.method !== 'GET') {
      writeJson(response, 405, { error: 'Method Not Allowed' });
      return;
    }
    if (!authorizeAdminRequest(request, response, adminApiToken)) return;
    void listAdminDishImages(executor, {
      status: url.searchParams.get('status') || undefined,
      q: url.searchParams.get('q') || undefined,
      limit: Number(url.searchParams.get('limit') || 50)
    }).then((items) => {
      writeJson(response, 200, { items });
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Admin dish image list failed';
      writeJson(response, 400, { error: message });
    });
    return;
  }
  const adminRegenerateMatch = url.pathname.match(/^\/api\/admin\/dish-images\/([0-9a-f-]+)\/regenerate$/i);
  if (adminRegenerateMatch) {
    if (request.method !== 'POST') {
      writeJson(response, 405, { error: 'Method Not Allowed' });
      return;
    }
    if (!authorizeAdminRequest(request, response, adminApiToken)) return;
    void readJsonBody(request).then((body) => (
      regenerateAdminDishImage(executor, adminRegenerateMatch[1], adminContextFromRequest(request, body))
    )).then((payload) => {
      writeJson(response, 200, payload);
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Admin dish image regenerate failed';
      writeJson(response, 400, { error: message });
    });
    return;
  }
  const adminImageMatch = url.pathname.match(/^\/api\/admin\/dish-images\/([0-9a-f-]+)$/i);
  if (adminImageMatch) {
    if (request.method !== 'PATCH') {
      writeJson(response, 405, { error: 'Method Not Allowed' });
      return;
    }
    if (!authorizeAdminRequest(request, response, adminApiToken)) return;
    void readJsonBody(request).then((body) => (
      updateAdminDishImage(
        executor,
        adminImageMatch[1],
        adminDishImageUpdateInputFromBody(body),
        adminContextFromRequest(request, body)
      )
    )).then((asset) => {
      writeJson(response, 200, { asset });
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Admin dish image update failed';
      writeJson(response, 400, { error: message });
    });
    return;
  }
  if (url.pathname === '/api/admin/dish-aliases') {
    if (request.method !== 'POST') {
      writeJson(response, 405, { error: 'Method Not Allowed' });
      return;
    }
    if (!authorizeAdminRequest(request, response, adminApiToken)) return;
    void readJsonBody(request).then((body) => (
      createAdminDishAlias(
        executor,
        {
          canonicalDishId: String(body.canonicalDishId || ''),
          rawName: String(body.rawName || ''),
          locale: typeof body.locale === 'string' ? body.locale : undefined
        },
        adminContextFromRequest(request, body)
      )
    )).then((alias) => {
      writeJson(response, 200, { alias });
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Admin dish alias create failed';
      writeJson(response, 400, { error: message });
    });
    return;
  }
  if (url.pathname === '/api/dish-images/generate') {
    if (request.method !== 'POST') {
      writeJson(response, 405, { error: 'Method Not Allowed' });
      return;
    }
    void readJsonBody(request).then((body) => {
      const dishName = String(body.dishName || '').trim();
      const provider = String(body.provider || 'rules').trim() as 'rules' | 'ai';
      return createDishImageGenerationPlaceholder(executor, dishName, provider);
    }).then((payload) => {
      writeJson(response, 200, payload);
    }).catch((error) => {
      const message = error instanceof Error ? error.message : 'Image generation placeholder failed';
      writeJson(response, 400, { error: message });
    });
    return;
  }
  if (request.method !== 'GET') {
    writeJson(response, 405, { error: 'Method Not Allowed' });
    return;
  }
  if (url.pathname === '/health/live') {
    writeJson(response, 200, getLiveness());
    return;
  }
  if (url.pathname === '/health' || url.pathname === '/health/ready') {
    void getReadiness(executor, expectedDatabaseVersion).then((payload) => {
      writeJson(response, payload.status === 'ok' ? 200 : 503, payload);
    });
    return;
  }
  if (url.pathname === '/api/dish-images/search') {
    const keyword = url.searchParams.get('q') || '';
    const requestedLimit = Number(url.searchParams.get('limit') || 20);
    void searchDishImages(executor, keyword, requestedLimit).then(async (items) => {
      if (!hasExactDishImageMatch(items) && imageFallback && keyword.trim()) {
        await imageFallback(keyword);
        return searchDishImages(executor, keyword, requestedLimit);
      }
      return items;
    }).then((items) => {
      writeJson(response, 200, { keyword, items });
    }).catch(() => {
      writeJson(response, 500, { error: 'Image search failed' });
    });
    return;
  }
  const imageMatch = url.pathname.match(/^\/api\/dish-images\/([0-9a-f-]+)$/i);
  if (imageMatch) {
    void readDishImage(executor, imageMatch[1], imageStorageRoot).then((image) => {
      if (!image) {
        writeJson(response, 404, { error: 'Image not found' });
        return;
      }
      response.writeHead(200, {
        'content-type': image.mimeType,
        'content-length': image.content.length,
        'cache-control': 'public, max-age=3600'
      });
      response.end(image.content);
    }).catch(() => {
      writeJson(response, 500, { error: 'Image read failed' });
    });
    return;
  }
  writeJson(response, 404, { error: 'Not Found' });
};
