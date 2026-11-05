import { randomUUID } from 'node:crypto';
import type { RpcExecutor, VerifiedIdentity } from './recipe-api';
import { mergePlanIngredients } from './basket-merge';

export type BasketApiDependencies = {
  getIdentity(): Promise<VerifiedIdentity>;
  rpc: RpcExecutor;
};
export type BasketApiEvent = { action?: string; payload?: unknown };
type BasketApiSuccess = { ok: true; data: unknown };
type BasketApiFailure = { ok: false; error: { code: string; message: string } };
export type BasketApiResponse = BasketApiSuccess | BasketApiFailure;

type BasketItem = {
  id: string;
  name: string;
  category: string;
  amount?: string | number | null;
  amountText?: string;
  unit?: string | null;
  source: 'plan' | 'manual';
  sourceRefs?: unknown[];
  checked?: boolean;
  sortOrder?: number;
  normalizedName?: string;
};
type PlanBasketItem = Omit<BasketItem, 'source'> & { source: 'plan' };
type BasketRow = {
  id?: string | null;
  weekStartDate: string;
  lastSyncedAt?: string | null;
  items?: BasketItem[];
};
type PlanSnapshotRow = {
  planRecipeId: string;
  date: string;
  mealType: string;
  recipeSnapshot?: {
    originalRecipeId?: string;
    name?: string;
    cookTimeMinutes?: number | null;
    caloriesKcal?: number | null;
    ingredients?: Array<{
      group?: string;
      display?: string;
      items?: Array<{ name?: string; amount?: string; amountText?: string }>;
    }>;
  };
};
type DirectRecipeRow = {
  id: string;
  displayName?: string;
  durationMinutes?: number | null;
  caloriesKcal?: number | null;
  mainIngredients?: string;
  sideIngredients?: string;
  seasonings?: string;
};

class ApiError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
const CATEGORIES = ['主料', '辅料', '调料', '其他'];
const CATEGORY_MAP: Record<string, string> = {
  main: '主料', 主料: '主料',
  side: '辅料', 辅料: '辅料',
  seasoning: '调料', 调料: '调料',
  other: '其他', 其他: '其他'
};

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('INVALID_ARGUMENT', '请求参数格式不正确');
  }
  return value as Record<string, unknown>;
};
const requiredString = (value: unknown, field: string): string => {
  const text = String(value ?? '').trim();
  if (!text) throw new ApiError('INVALID_ARGUMENT', `${field}不能为空`);
  return text;
};
const parseDate = (value: unknown): string => {
  const date = requiredString(value, '周开始日期');
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new ApiError('INVALID_ARGUMENT', '日期格式应为 YYYY-MM-DD');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== Number(match[1])
    || parsed.getUTCMonth() + 1 !== Number(match[2])
    || parsed.getUTCDate() !== Number(match[3])
  ) throw new ApiError('INVALID_ARGUMENT', '日期无效');
  return date;
};
const parseWeekStart = (value: unknown): string => {
  const date = parseDate(value);
  if (new Date(`${date}T00:00:00.000Z`).getUTCDay() !== 1) {
    throw new ApiError('INVALID_ARGUMENT', '周开始日期必须是周一');
  }
  return date;
};
const parseUuid = (value: unknown, field: string): string => {
  const id = requiredString(value, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError('INVALID_ARGUMENT', `${field}格式不正确`);
  }
  return id;
};
const parseUuidList = (value: unknown, field: string): string[] => {
  if (!Array.isArray(value)) throw new ApiError('INVALID_ARGUMENT', `${field}必须是数组`);
  const result: string[] = [];
  const seen = new Set<string>();
  value.forEach((item) => {
    const id = parseUuid(item, field);
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  });
  if (!result.length) throw new ApiError('INVALID_ARGUMENT', `${field}不能为空`);
  if (result.length > 100) throw new ApiError('INVALID_ARGUMENT', `${field}最多 100 项`);
  return result;
};
const parseCategory = (value: unknown): string => {
  const category = String(value || '其他').trim();
  return CATEGORIES.includes(category) ? category : '其他';
};
const parseSortOrder = (value: unknown): number => {
  if (value === undefined || value === null || value === '') return 0;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0) throw new ApiError('INVALID_ARGUMENT', '排序值必须是非负整数');
  return result;
};
const normalizeIngredientName = (value: unknown): string => String(value ?? '')
  .normalize('NFKC')
  .trim()
  .replace(/[，,、；;。．.·•]/g, '')
  .replace(/\s+/g, ' ')
  .toLocaleLowerCase();
const parseAmount = (value: string): { amount: string | null; amountText: string; unit: string | null } => {
  const text = String(value || '').trim();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match || !match[2].trim()) return { amount: null, amountText: text, unit: null };
  return { amount: match[1], amountText: text, unit: match[2].trim() };
};
const splitDisplay = (display: string): Array<{ name: string; amountText: string }> => (
  String(display || '').split(/[、,，]/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = part.match(/^(.+?)(适量|少许|\d+(?:\.\d+)?\s*\S+)$/);
    return match
      ? { name: match[1].trim(), amountText: match[2].trim() }
      : { name: part, amountText: '' };
  })
);

const extractPlanItems = (
  snapshots: PlanSnapshotRow[],
  createId: () => string
): { items: PlanBasketItem[]; warnings: Array<{ code: string; message: string }> } => {
  const items: PlanBasketItem[] = [];
  const warnings: Array<{ code: string; message: string }> = [];
  for (const row of snapshots || []) {
    const snapshot = row.recipeSnapshot || {};
    const groups = Array.isArray(snapshot.ingredients) ? snapshot.ingredients : [];
    let ingredientCount = 0;
    groups.forEach((group) => {
      const category = CATEGORY_MAP[String(group.group || '')] || '其他';
      const rawItems = Array.isArray(group.items)
        ? group.items.map((item) => ({
          name: String(item.name || '').trim(),
          amountText: String(item.amountText || item.amount || '').trim()
        }))
        : splitDisplay(String(group.display || ''));
      rawItems.filter((item) => item.name).forEach((item) => {
        ingredientCount += 1;
        const parsed = parseAmount(item.amountText);
        items.push({
          id: createId(),
          name: item.name,
          category,
          amount: parsed.amount,
          amountText: parsed.amountText,
          unit: parsed.unit,
          source: 'plan',
          sourceRefs: [{
            planRecipeId: row.planRecipeId,
            ...(snapshot.originalRecipeId ? { recipeId: snapshot.originalRecipeId } : {}),
            date: row.date,
            mealType: row.mealType,
            recipeName: snapshot.name || '',
            cookTimeMinutes: snapshot.cookTimeMinutes ?? null,
            caloriesKcal: snapshot.caloriesKcal ?? null
          }],
          checked: false,
          sortOrder: items.length
        });
      });
    });
    if (!ingredientCount) {
      warnings.push({
        code: 'RECIPE_WITHOUT_INGREDIENTS',
        message: `${snapshot.name || '某菜谱'}没有可同步的食材，已跳过。`
      });
    }
  }
  if (!(snapshots || []).length) {
    warnings.push({ code: 'PLAN_EMPTY', message: '本周暂无计划，请先添加计划。' });
  }
  return { items, warnings };
};

const latestIngredientGroups = (recipe: DirectRecipeRow) => [
  { group: 'main', display: recipe.mainIngredients || '' },
  { group: 'side', display: recipe.sideIngredients || '' },
  { group: 'seasoning', display: recipe.seasonings || '' }
].filter((group) => group.display);

const refreshPlanSnapshotsFromCurrentRecipes = async (
  dependencies: BasketApiDependencies,
  ownerId: string,
  snapshots: PlanSnapshotRow[]
): Promise<PlanSnapshotRow[]> => {
  const lookups = new Map<string, Promise<DirectRecipeRow | null>>();
  const readRecipe = (recipeId: string) => {
    if (!lookups.has(recipeId)) {
      lookups.set(recipeId, dependencies.rpc.call<DirectRecipeRow | null>('ai_dish_library_get_recipe', {
        p_owner_id: ownerId,
        p_recipe_id: recipeId
      }));
    }
    return lookups.get(recipeId) as Promise<DirectRecipeRow | null>;
  };
  return Promise.all((snapshots || []).map(async (row) => {
    const snapshot = row.recipeSnapshot || {};
    const recipeId = String(snapshot.originalRecipeId || '').trim();
    // 随手记或已删除菜谱没有可读取的原菜谱，继续使用计划快照。
    if (!recipeId) return row;
    const recipe = await readRecipe(recipeId);
    if (!recipe) return row;
    return {
      ...row,
      recipeSnapshot: {
        ...snapshot,
        ingredients: latestIngredientGroups(recipe)
      }
    };
  }));
};

const ensureIdentity = async (dependencies: BasketApiDependencies): Promise<VerifiedIdentity> => {
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

const mapBasket = (row: BasketRow, warnings: unknown[] = []): Record<string, unknown> => {
  const items = (row.items || []).map((item) => ({
    ...item,
    id: String(item.id || ''),
    name: String(item.name || ''),
    category: parseCategory(item.category),
    // 小程序列表展示完整用量；数值字段仅用于服务端合并。
    amount: String(item.amountText || (item.amount === null || item.amount === undefined ? '' : item.amount)),
    amountText: String(item.amountText || ''),
    unit: String(item.unit || ''),
    checked: Boolean(item.checked),
    source: item.source,
    sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs : []
  }));
  return {
    id: row.id || null,
    weekStartDate: row.weekStartDate,
    lastSyncedAt: row.lastSyncedAt || null,
    items,
    warnings
  };
};

const getBasket = async (
  dependencies: BasketApiDependencies,
  ownerId: string,
  weekStartDate: string,
  warnings: unknown[] = []
) => mapBasket(await dependencies.rpc.call<BasketRow>('cook_basket_get_week', {
  p_owner_id: ownerId,
  p_week_start_date: weekStartDate
}), warnings);

const syncPlanSnapshotsToBasket = async (
  dependencies: BasketApiDependencies,
  ownerId: string,
  weekStartDate: string,
  snapshots: PlanSnapshotRow[],
  warnings: Array<{ code: string; message: string }>
): Promise<Record<string, unknown>> => {
  const refreshedSnapshots = await refreshPlanSnapshotsFromCurrentRecipes(dependencies, ownerId, snapshots || []);
  const extracted = extractPlanItems(refreshedSnapshots, randomUUID);
  const mergedItems = mergePlanIngredients(extracted.items);
  await dependencies.rpc.call<boolean>('cook_basket_replace_plan_items', {
    p_owner_id: ownerId,
    p_week_start_date: weekStartDate,
    p_basket_id: randomUUID(),
    p_items: mergedItems
  });
  return getBasket(dependencies, ownerId, weekStartDate, warnings.concat(extracted.warnings));
};

const runAction = async (
  event: BasketApiEvent,
  dependencies: BasketApiDependencies,
  identity: VerifiedIdentity
): Promise<unknown> => {
  const payload = asObject(event.payload || {});
  const weekStartDate = parseWeekStart(payload.weekStartDate);
  switch (event.action) {
    case 'baskets.week.get':
      return getBasket(dependencies, identity.userId, weekStartDate);
    case 'baskets.week.syncFromPlan': {
      const mode = String(payload.mode || 'replace_plan_items');
      if (mode !== 'replace_plan_items') throw new ApiError('INVALID_ARGUMENT', 'MVP 仅支持替换计划来源项');
      const snapshots = await dependencies.rpc.call<PlanSnapshotRow[]>('cook_basket_plan_snapshots', {
        p_owner_id: identity.userId,
        p_week_start_date: weekStartDate
      });
      return syncPlanSnapshotsToBasket(dependencies, identity.userId, weekStartDate, snapshots || [], []);
    }
    case 'baskets.week.syncSelected': {
      const mode = String(payload.mode || 'replace_selected_plan_items');
      if (mode !== 'replace_selected_plan_items') throw new ApiError('INVALID_ARGUMENT', '仅支持替换选中计划来源项');
      const selectedIds = parseUuidList(payload.planRecipeIds, '计划菜品 ID');
      const selectedSet = new Set(selectedIds);
      const snapshots = await dependencies.rpc.call<PlanSnapshotRow[]>('cook_basket_plan_snapshots', {
        p_owner_id: identity.userId,
        p_week_start_date: weekStartDate
      });
      const selectedSnapshots = (snapshots || []).filter((item) => selectedSet.has(item.planRecipeId));
      if (!selectedSnapshots.length) throw new ApiError('NOT_FOUND', '选中的计划菜品不存在');
      const foundIds = new Set(selectedSnapshots.map((item) => item.planRecipeId));
      const missingCount = selectedIds.filter((id) => !foundIds.has(id)).length;
      const warnings = missingCount
        ? [{ code: 'PLAN_ITEM_NOT_FOUND', message: `${missingCount} 个选中计划菜品不存在，已同步其余菜品。` }]
        : [];
      return syncPlanSnapshotsToBasket(dependencies, identity.userId, weekStartDate, selectedSnapshots, warnings);
    }
    case 'baskets.week.addRecipe': {
      const recipeId = parseUuid(payload.recipeId, '菜谱 ID');
      const recipe = await dependencies.rpc.call<DirectRecipeRow | null>('ai_dish_library_get_recipe', {
        p_owner_id: identity.userId,
        p_recipe_id: recipeId
      });
      if (!recipe) throw new ApiError('NOT_FOUND', '菜谱不存在');
      const extracted = extractPlanItems([{
        planRecipeId: recipeId,
        date: weekStartDate,
        mealType: 'recipe_detail',
        recipeSnapshot: {
          name: recipe.displayName || '',
          ingredients: [
            { group: 'main', display: recipe.mainIngredients || '' },
            { group: 'side', display: recipe.sideIngredients || '' },
            { group: 'seasoning', display: recipe.seasonings || '' }
          ].filter((group) => group.display)
        }
      }], randomUUID);
      const items = mergePlanIngredients(extracted.items).map((item) => ({
        ...item,
        sourceRefs: [{
          recipeId,
          recipeName: recipe.displayName || '',
          source: 'recipe_detail',
          cookTimeMinutes: recipe.durationMinutes ?? null,
          caloriesKcal: recipe.caloriesKcal ?? null
        }]
      }));
      const added = await dependencies.rpc.call<boolean>('cook_basket_add_recipe_items', {
        p_owner_id: identity.userId,
        p_week_start_date: weekStartDate,
        p_basket_id: randomUUID(),
        p_recipe_id: recipeId,
        p_items: items
      });
      const warnings = items.length
        ? []
        : [{ code: 'RECIPE_WITHOUT_INGREDIENTS', message: '该菜谱没有可添加的食材。' }];
      return {
        ...await getBasket(dependencies, identity.userId, weekStartDate, warnings),
        added
      };
    }
    case 'baskets.items.create': {
      const name = requiredString(payload.name, '食材名称');
      const row = await dependencies.rpc.call<BasketItem>('cook_basket_create_manual_item', {
        p_owner_id: identity.userId,
        p_week_start_date: weekStartDate,
        p_basket_id: randomUUID(),
        p_item_id: randomUUID(),
        p_payload: {
          name,
          normalizedName: normalizeIngredientName(name),
          category: parseCategory(payload.category),
          amount: payload.amount === undefined ? '' : String(payload.amount),
          amountText: String(payload.amountText || ''),
          unit: String(payload.unit || ''),
          sortOrder: parseSortOrder(payload.sortOrder)
        }
      });
      return mapBasket({ weekStartDate, items: [row] }).items;
    }
    case 'baskets.items.update': {
      const body: Record<string, unknown> = {};
      if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
        body.name = requiredString(payload.name, '食材名称');
        body.normalizedName = normalizeIngredientName(body.name);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'category')) body.category = parseCategory(payload.category);
      if (Object.prototype.hasOwnProperty.call(payload, 'amount')) body.amount = String(payload.amount ?? '');
      if (Object.prototype.hasOwnProperty.call(payload, 'amountText')) body.amountText = String(payload.amountText ?? '');
      if (Object.prototype.hasOwnProperty.call(payload, 'unit')) body.unit = String(payload.unit ?? '');
      if (Object.prototype.hasOwnProperty.call(payload, 'checked')) {
        if (typeof payload.checked !== 'boolean') throw new ApiError('INVALID_ARGUMENT', '勾选状态必须是布尔值');
        body.checked = payload.checked;
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'sortOrder')) body.sortOrder = parseSortOrder(payload.sortOrder);
      const row = await dependencies.rpc.call<BasketItem | null>('cook_basket_update_item', {
        p_owner_id: identity.userId,
        p_item_id: parseUuid(payload.itemId, '菜篮项 ID'),
        p_payload: body
      });
      if (!row) throw new ApiError('NOT_FOUND', '菜篮项不存在');
      return mapBasket({ weekStartDate, items: [row] }).items;
    }
    case 'baskets.items.toggle': {
      if (typeof payload.checked !== 'boolean') throw new ApiError('INVALID_ARGUMENT', '勾选状态必须是布尔值');
      const row = await dependencies.rpc.call<BasketItem | null>('cook_basket_toggle_item', {
        p_owner_id: identity.userId,
        p_item_id: parseUuid(payload.itemId, '菜篮项 ID'),
        p_checked: payload.checked
      });
      if (!row) throw new ApiError('NOT_FOUND', '菜篮项不存在');
      return mapBasket({ weekStartDate, items: [row] }).items;
    }
    case 'baskets.items.delete': {
      const deleted = await dependencies.rpc.call<boolean>('cook_basket_delete_item', {
        p_owner_id: identity.userId,
        p_item_id: parseUuid(payload.itemId, '菜篮项 ID')
      });
      if (!deleted) throw new ApiError('NOT_FOUND', '菜篮项不存在');
      return { deleted: true };
    }
    case 'baskets.items.clear': {
      const completedOnly = Boolean(payload.completedOnly);
      const deletedCount = await dependencies.rpc.call<number>('cook_basket_clear_items', {
        p_owner_id: identity.userId,
        p_week_start_date: weekStartDate,
        p_completed_only: completedOnly
      });
      return { deletedCount };
    }
    case 'baskets.items.checkAll':
      if (typeof payload.checked !== 'boolean') throw new ApiError('INVALID_ARGUMENT', '勾选状态必须是布尔值');
      await dependencies.rpc.call<number>('cook_basket_check_all', {
        p_owner_id: identity.userId,
        p_week_start_date: weekStartDate,
        p_checked: payload.checked
      });
      return getBasket(dependencies, identity.userId, weekStartDate);
    default:
      throw new ApiError('NOT_FOUND', '未知的菜篮服务操作');
  }
};

export const handleBasketApiEvent = async (
  event: BasketApiEvent,
  dependencies: BasketApiDependencies
): Promise<BasketApiResponse> => {
  try {
    const identity = await ensureIdentity(dependencies);
    return { ok: true, data: await runAction(event, dependencies, identity) };
  } catch (error) {
    if (error instanceof ApiError) return { ok: false, error: { code: error.code, message: error.message } };
    const details = error as { code?: string };
    return {
      ok: false,
      error: {
        code: details.code === '22023' ? 'INVALID_ARGUMENT' : 'INTERNAL_ERROR',
        message: details.code === '22023' ? '菜篮参数无效' : '服务暂时不可用，请稍后重试'
      }
    };
  }
};

export const basketApiInternals = {
  parseWeekStart,
  parseAmount,
  parseUuidList,
  splitDisplay,
  extractPlanItems,
  refreshPlanSnapshotsFromCurrentRecipes,
  mapBasket,
  normalizeIngredientName
};
