import { createHash, randomUUID } from 'node:crypto';
import { createCustomCoverStorageKeys, listCoverStorageKeyFor } from './recipe-cover-storage.js';

export type VerifiedIdentity = {
  userId: string;
  appId: string;
  openId: string;
  unionId?: string;
};

export type RpcExecutor = {
  call<T>(name: string, args: Record<string, unknown>): Promise<T>;
};

export type CoverStorage = {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  signedUrls(paths: string[]): Promise<Record<string, string>>;
};

export type RecipeApiDependencies = {
  getIdentity(): Promise<VerifiedIdentity>;
  rpc: RpcExecutor;
  covers: CoverStorage;
};

export type RecipeApiEvent = {
  action?: string;
  payload?: unknown;
};

type ApiSuccess = { ok: true; data: unknown };
type ApiFailure = { ok: false; error: { code: string; message: string } };
export type RecipeApiResponse = ApiSuccess | ApiFailure;

type RecipeRow = {
  id: string;
  rawName: string;
  displayName: string;
  canonicalDishId: string;
  coverMode: 'FOLLOW_LIBRARY' | 'PINNED_ASSET' | 'CUSTOM';
  customCoverStorageKey?: string | null;
  categoryId?: string | null;
  categoryName?: string;
  durationMinutes?: number | null;
  caloriesKcal?: number | null;
  mainIngredients?: string;
  sideIngredients?: string;
  seasonings?: string;
  steps?: Array<{ id?: string; text?: string; imageUrl?: string }>;
};

type RecipeGroupRow = {
  id: string;
  name: string;
  sortOrder?: number;
  recipes: RecipeRow[];
  recipeCount?: number;
  hasMore?: boolean;
  nextOffset?: number | null;
};

const MAX_COVER_BYTES = 5 * 1024 * 1024;
const LIST_THUMBNAIL_SIZE = 480;
const LIST_THUMBNAIL_WEBP_QUALITY = 78;
const RECIPE_LIST_PAGE_SIZE = 20;
const MAX_RECIPE_LIST_OFFSET = 10_000;
const COVER_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

class ApiError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('INVALID_ARGUMENT', '请求参数格式不正确');
  }
  return value as Record<string, unknown>;
};

const stringValue = (value: unknown, field: string, required = false): string => {
  const result = String(value ?? '').trim();
  if (required && !result) throw new ApiError('INVALID_ARGUMENT', `${field}不能为空`);
  return result;
};

const optionalPositiveInteger = (value: unknown, field: string, maximum: number): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError('INVALID_ARGUMENT', `${field}必须是正整数`);
  }
  if (parsed > maximum) throw new ApiError('INVALID_ARGUMENT', `${field}不能超过${maximum}`);
  return parsed;
};

const optionalNonNegativeInteger = (value: unknown, field: string, maximum: number): number => {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ApiError('INVALID_ARGUMENT', `${field}必须是非负整数`);
  }
  if (parsed > maximum) throw new ApiError('INVALID_ARGUMENT', `${field}不能超过${maximum}`);
  return parsed;
};

const isTemporaryClientFile = (value: string): boolean => (
  /^(wxfile|http:\/\/tmp|https:\/\/tmp|file):/i.test(value)
);

const parseRecipeId = (value: unknown): string => {
  const id = stringValue(value, '菜谱 ID', true);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError('INVALID_ARGUMENT', '菜谱 ID 格式不正确');
  }
  return id;
};

const parseSteps = (value: unknown): Array<{ id: string; text: string; imageUrl: string }> => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ApiError('INVALID_ARGUMENT', '制作步骤格式不正确');
  if (value.length > 100) throw new ApiError('INVALID_ARGUMENT', '制作步骤不能超过 100 条');
  return value.map((item, index) => {
    const step = asObject(item);
    const text = stringValue(step.text, '步骤内容');
    if (Array.from(text).length > 500) throw new ApiError('INVALID_ARGUMENT', '单个制作步骤不能超过500个字符');
    return {
      id: stringValue(step.id, '步骤 ID') || `step-${index + 1}`,
      text,
      imageUrl: (() => {
        const imageUrl = stringValue(step.imageUrl, '步骤图片');
        return isTemporaryClientFile(imageUrl) ? '' : imageUrl;
      })()
    };
  });
};

const userStoragePrefix = (userId: string): string => (
  createHash('sha256').update(userId).digest('hex').slice(0, 32)
);

const parseRecipePayload = (value: unknown, identity: VerifiedIdentity): Record<string, unknown> => {
  const payload = asObject(value);
  const rawName = stringValue(payload.rawName ?? payload.name ?? payload.title, '菜名', true);
  const displayName = stringValue(payload.displayName ?? payload.name ?? payload.title ?? rawName, '展示菜名', true);
  if (Array.from(rawName).length > 12 || Array.from(displayName).length > 12) {
    throw new ApiError('INVALID_ARGUMENT', '菜名不能超过12个字');
  }
  const category = stringValue(payload.category, '分类');
  if (Array.from(category).length > 8) throw new ApiError('INVALID_ARGUMENT', '分类名称不能超过8个字符');
  const storageKey = stringValue(payload.customCoverStorageKey, '封面存储路径');
  if (storageKey && !storageKey.startsWith(`${userStoragePrefix(identity.userId)}/`)) {
    throw new ApiError('FORBIDDEN', '不能使用其他用户的封面');
  }
  const coverMode = storageKey ? 'CUSTOM' : 'FOLLOW_LIBRARY';
  return {
    rawName,
    displayName,
    category,
    durationMinutes: optionalPositiveInteger(payload.durationMinutes ?? payload.duration, '用时', 999),
    caloriesKcal: optionalPositiveInteger(payload.caloriesKcal ?? payload.calories, '热量', 9999),
    coverMode,
    customCoverStorageKey: storageKey || null,
    mainIngredients: stringValue(payload.mainIngredients, '主料'),
    sideIngredients: stringValue(payload.sideIngredients, '辅料'),
    seasonings: stringValue(payload.seasonings, '调料'),
    steps: parseSteps(payload.steps)
  };
};

const durationLabel = (value: number | null | undefined): string => (
  value === null || value === undefined ? '' : `${value}分钟`
);

const caloriesLabel = (value: number | null | undefined): string => (
  value === null || value === undefined ? '' : `${value}kcal`
);

const ingredientItems = (display: string): Array<{ name: string; amount: string }> => (
  String(display || '').split(/[、,，]/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const matched = part.match(/^(.+?)(适量|少许|\d+(?:\.\d+)?\s*(?:千克|公斤|毫升|克|斤|两|个|颗|根|片|瓣|勺|杯|盒|袋|g|kg|ml|l))$/i);
    return matched ? { name: matched[1].trim(), amount: matched[2].trim() } : { name: part, amount: '' };
  })
);

const coverKeysFromGroups = (groups: RecipeGroupRow[]): string[] => (
  [...new Set(groups.flatMap((group) => group.recipes)
    .map((recipe) => listCoverStorageKeyFor(recipe.customCoverStorageKey))
    .filter(Boolean))]
);

const toListRecipe = (row: RecipeRow, signedUrls: Record<string, string>): Record<string, unknown> => {
  const coverKey = listCoverStorageKeyFor(row.customCoverStorageKey);
  const coverUrl = coverKey ? signedUrls[coverKey] || '' : '';
  return {
    id: row.id,
    title: row.displayName,
    coverUrl,
    duration: durationLabel(row.durationMinutes),
    calories: caloriesLabel(row.caloriesKcal),
    crop: { width: 64, height: 64, left: 0, top: 0 }
  };
};

const toDetailRecipe = (row: RecipeRow, coverUrl: string): Record<string, unknown> => ({
  id: row.id,
  category: row.categoryName || '未分类',
  categoryId: row.categoryId || '',
  title: row.displayName,
  rawName: row.rawName,
  displayName: row.displayName,
  canonicalDishId: row.canonicalDishId,
  coverMode: row.coverMode,
  customCoverStorageKey: row.customCoverStorageKey || '',
  coverUrl,
  heroImage: coverUrl,
  duration: durationLabel(row.durationMinutes),
  calories: caloriesLabel(row.caloriesKcal),
  durationMinutes: row.durationMinutes ?? null,
  caloriesKcal: row.caloriesKcal ?? null,
  mainIngredients: row.mainIngredients || '',
  sideIngredients: row.sideIngredients || '',
  seasonings: row.seasonings || '',
  ingredients: [
    { group: '主料', display: row.mainIngredients || '', items: ingredientItems(row.mainIngredients || '') },
    { group: '辅料', display: row.sideIngredients || '', items: ingredientItems(row.sideIngredients || '') },
    { group: '调料', display: row.seasonings || '', items: ingredientItems(row.seasonings || '') }
  ].filter((group) => group.display),
  steps: row.steps || []
});

const ensureIdentity = async (dependencies: RecipeApiDependencies): Promise<VerifiedIdentity> => {
  const identity = await dependencies.getIdentity();
  if (!identity.userId || !identity.appId || !identity.openId) {
    throw new ApiError('UNAUTHENTICATED', '未获取到可信的微信用户身份');
  }
  const resolvedUserId = await dependencies.rpc.call<string>('ai_dish_library_ensure_user', {
    p_user_id: identity.userId,
    p_wx_appid: identity.appId,
    p_wx_openid: identity.openId,
    p_wx_unionid: identity.unionId || null
  });
  return { ...identity, userId: resolvedUserId };
};

const mapRecipeGroups = async (
  dependencies: RecipeApiDependencies,
  groups: RecipeGroupRow[]
): Promise<Array<Record<string, unknown>>> => {
  const signedUrls = await dependencies.covers.signedUrls(coverKeysFromGroups(groups || []));
  return (groups || []).map((group) => ({
    id: group.id,
    name: group.name,
    recipeCount: Number.isInteger(group.recipeCount) ? group.recipeCount : (group.recipes || []).length,
    hasMore: Boolean(group.hasMore),
    nextOffset: group.nextOffset === null || group.nextOffset === undefined ? null : Number(group.nextOffset),
    recipes: (group.recipes || []).map((recipe) => toListRecipe(recipe, signedUrls))
  }));
};

const parseRecipeListPage = (value: unknown): { categoryId: string; offset: number } => {
  if (value === undefined || value === null) return { categoryId: '', offset: 0 };
  const payload = asObject(value);
  const categoryId = stringValue(payload.categoryId, '分类 ID');
  if (categoryId.length > 200) throw new ApiError('INVALID_ARGUMENT', '分类 ID格式不正确');
  return {
    categoryId,
    offset: optionalNonNegativeInteger(payload.offset, '分页偏移量', MAX_RECIPE_LIST_OFFSET)
  };
};

const listRecipePage = async (
  dependencies: RecipeApiDependencies,
  identity: VerifiedIdentity,
  page: { categoryId: string; offset: number }
): Promise<unknown> => {
  const groups = await dependencies.rpc.call<RecipeGroupRow[]>('ai_dish_library_list_recipes', {
    p_owner_id: identity.userId,
    p_category_id: page.categoryId || null,
    p_offset: page.offset,
    p_limit: RECIPE_LIST_PAGE_SIZE
  });
  return mapRecipeGroups(dependencies, groups || []);
};

// Search, plan selection and source-list refreshes need the complete current
// catalogue. The list page itself uses listRecipePage above and never calls this.
const listRecipeCatalog = async (dependencies: RecipeApiDependencies, identity: VerifiedIdentity): Promise<unknown> => {
  const groups = await dependencies.rpc.call<RecipeGroupRow[]>('ai_dish_library_list_recipes', {
    p_owner_id: identity.userId
  });
  return mapRecipeGroups(dependencies, groups || []);
};

const getRecipe = async (
  dependencies: RecipeApiDependencies,
  identity: VerifiedIdentity,
  recipeId: string
): Promise<Record<string, unknown> | null> => {
  const row = await dependencies.rpc.call<RecipeRow | null>('ai_dish_library_get_recipe', {
    p_owner_id: identity.userId,
    p_recipe_id: recipeId
  });
  if (!row) return null;
  const urls = row.customCoverStorageKey
    ? await dependencies.covers.signedUrls([row.customCoverStorageKey])
    : {};
  return toDetailRecipe(row, row.customCoverStorageKey ? urls[row.customCoverStorageKey] || '' : '');
};

/**
 * `sharp` is optional at runtime: a cover must never make the whole recipe
 * function unavailable when a deployment runtime cannot load its native image
 * module. In that case uploadCover falls back to the original image, which is
 * also the compatibility path for older covers.
 */
const createListThumbnail = async (bytes: Buffer): Promise<Buffer> => {
  const { default: sharp } = await import('sharp');
  return sharp(bytes, { failOn: 'none' })
    .rotate()
    .resize(LIST_THUMBNAIL_SIZE, LIST_THUMBNAIL_SIZE, {
      fit: 'cover',
      position: 'attention',
      withoutEnlargement: true
    })
    .webp({ quality: LIST_THUMBNAIL_WEBP_QUALITY })
    .toBuffer();
};

const uploadCover = async (
  dependencies: RecipeApiDependencies,
  identity: VerifiedIdentity,
  value: unknown
): Promise<unknown> => {
  const payload = asObject(value);
  const contentType = stringValue(payload.contentType, '图片类型', true).toLowerCase();
  const extension = COVER_MIME_EXTENSIONS[contentType];
  if (!extension) throw new ApiError('UNSUPPORTED_MEDIA_TYPE', '只支持 JPEG、PNG 或 WebP 图片');
  const base64 = stringValue(payload.base64, '图片内容', true).replace(/^data:[^;]+;base64,/, '');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length) throw new ApiError('INVALID_ARGUMENT', '图片内容不能为空');
  if (bytes.length > MAX_COVER_BYTES) throw new ApiError('UPLOAD_TOO_LARGE', '图片不能超过5MB');
  const prefix = userStoragePrefix(identity.userId);
  const id = randomUUID();
  const keys = createCustomCoverStorageKeys(prefix, id, extension);

  // Upload the thumbnail first. If conversion or thumbnail storage is not
  // available, preserve the original under the older key shape so list views
  // automatically fall back to it instead of showing a broken image.
  try {
    const thumbnail = await createListThumbnail(bytes);
    await dependencies.covers.upload(keys.thumbnail, thumbnail, 'image/webp');
    await dependencies.covers.upload(keys.original, bytes, contentType);
    const urls = await dependencies.covers.signedUrls([keys.original]);
    return { storageKey: keys.original, coverUrl: urls[keys.original] || '' };
  } catch {
    const fallbackPath = `${prefix}/${id}.${extension}`;
    await dependencies.covers.upload(fallbackPath, bytes, contentType);
    const urls = await dependencies.covers.signedUrls([fallbackPath]);
    return { storageKey: fallbackPath, coverUrl: urls[fallbackPath] || '' };
  }
};

const runAction = async (
  event: RecipeApiEvent,
  dependencies: RecipeApiDependencies,
  identity: VerifiedIdentity
): Promise<unknown> => {
  const payload = event.payload;
  switch (event.action) {
    case 'recipes.list':
      return listRecipePage(dependencies, identity, parseRecipeListPage(payload));
    case 'recipes.catalog':
      return listRecipeCatalog(dependencies, identity);
    case 'recipes.detail':
      return getRecipe(dependencies, identity, parseRecipeId(asObject(payload).id));
    case 'recipes.create': {
      const recipePayload = parseRecipePayload(payload, identity);
      const created = await dependencies.rpc.call<RecipeRow>('ai_dish_library_create_recipe', {
        p_owner_id: identity.userId,
        p_recipe_id: randomUUID(),
        p_canonical_dish_id: randomUUID(),
        p_decision_id: randomUUID(),
        p_alias_id: randomUUID(),
        p_payload: recipePayload
      });
      const urls = created.customCoverStorageKey
        ? await dependencies.covers.signedUrls([created.customCoverStorageKey])
        : {};
      return toDetailRecipe(created, created.customCoverStorageKey ? urls[created.customCoverStorageKey] || '' : '');
    }
    case 'recipes.update': {
      const body = asObject(payload);
      const recipeId = parseRecipeId(body.id);
      const updated = await dependencies.rpc.call<RecipeRow | null>('ai_dish_library_update_recipe', {
        p_owner_id: identity.userId,
        p_recipe_id: recipeId,
        p_alias_id: randomUUID(),
        p_payload: parseRecipePayload(body, identity)
      });
      if (!updated) return null;
      const urls = updated.customCoverStorageKey
        ? await dependencies.covers.signedUrls([updated.customCoverStorageKey])
        : {};
      return toDetailRecipe(updated, updated.customCoverStorageKey ? urls[updated.customCoverStorageKey] || '' : '');
    }
    case 'recipes.delete':
      return dependencies.rpc.call<boolean>('ai_dish_library_delete_recipe', {
        p_owner_id: identity.userId,
        p_recipe_id: parseRecipeId(asObject(payload).id)
      });
    case 'categories.list': {
      const groups = await dependencies.rpc.call<RecipeGroupRow[]>('ai_dish_library_list_recipes', {
        p_owner_id: identity.userId,
        p_category_id: null,
        p_offset: 0,
        p_limit: 1
      });
      return (groups || []).map((group) => ({
        id: group.id,
        name: group.name,
        recipeCount: Number.isInteger(group.recipeCount) ? group.recipeCount : (group.recipes || []).length
      }));
    }
    case 'categories.create': {
      const name = stringValue(asObject(payload).name, '分类名称', true);
      await dependencies.rpc.call('ai_dish_library_create_category', {
        p_owner_id: identity.userId,
        p_category_id: `${identity.userId}:category:${randomUUID().replace(/-/g, '')}`,
        p_name: name
      });
      return listRecipeCatalog(dependencies, identity);
    }
    case 'categories.rename': {
      const body = asObject(payload);
      await dependencies.rpc.call('ai_dish_library_rename_category', {
        p_owner_id: identity.userId,
        p_category_id: stringValue(body.id, '分类 ID', true),
        p_name: stringValue(body.name, '分类名称', true)
      });
      return listRecipeCatalog(dependencies, identity);
    }
    case 'categories.delete':
      await dependencies.rpc.call('ai_dish_library_delete_category', {
        p_owner_id: identity.userId,
        p_category_id: stringValue(asObject(payload).id, '分类 ID', true)
      });
      return listRecipeCatalog(dependencies, identity);
    case 'categories.reorder': {
      const orderedIds = asObject(payload).orderedIds;
      if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
        throw new ApiError('INVALID_ARGUMENT', '分类顺序格式不正确');
      }
      await dependencies.rpc.call('ai_dish_library_reorder_categories', {
        p_owner_id: identity.userId,
        p_ordered_ids: orderedIds
      });
      return listRecipeCatalog(dependencies, identity);
    }
    case 'covers.upload':
      return uploadCover(dependencies, identity, payload);
    default:
      throw new ApiError('NOT_FOUND', '未知的菜谱服务操作');
  }
};

export const handleRecipeApiEvent = async (
  event: RecipeApiEvent,
  dependencies: RecipeApiDependencies
): Promise<RecipeApiResponse> => {
  try {
    const identity = await ensureIdentity(dependencies);
    return { ok: true, data: await runAction(event, dependencies, identity) };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    const maybeError = error as { code?: string; message?: string };
    const duplicate = maybeError.code === '23505' || /duplicate|unique/i.test(maybeError.message || '');
    return {
      ok: false,
      error: {
        code: duplicate ? 'CONFLICT' : 'INTERNAL_ERROR',
        message: duplicate ? '名称已存在' : '服务暂时不可用，请稍后重试'
      }
    };
  }
};

export const recipeApiInternals = {
  userStoragePrefix,
  parseRecipePayload,
  toListRecipe,
  toDetailRecipe,
  listCoverStorageKeyFor
};
