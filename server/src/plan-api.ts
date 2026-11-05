import { randomUUID } from 'node:crypto';
import type {
  CoverStorage,
  RpcExecutor,
  VerifiedIdentity
} from './recipe-api';
import { listCoverStorageKeyFor } from './recipe-cover-storage';
import {
  generateWeekPlan,
  type WeekPlanPreferences,
  type WeekPlanCandidate,
  type WeekPlanWarning
} from './week-plan-generator';

export type PlanApiDependencies = {
  getIdentity(): Promise<VerifiedIdentity>;
  rpc: RpcExecutor;
  covers: CoverStorage;
};

export type PlanApiEvent = {
  action?: string;
  payload?: unknown;
};

type ApiSuccess = { ok: true; data: unknown };
type ApiFailure = { ok: false; error: { code: string; message: string } };
export type PlanApiResponse = ApiSuccess | ApiFailure;

type PlanSnapshot = {
  originalRecipeId?: string | null;
  name?: string;
  coverStorageKey?: string | null;
  cookTimeMinutes?: number | null;
  caloriesKcal?: number | null;
  ingredients?: unknown[];
  steps?: unknown[];
};

type PlanRecipeRow = {
  id: string;
  recipeId?: string | null;
  source: 'manual' | 'generated';
  sortOrder?: number;
  recipeSnapshot: PlanSnapshot;
};

type DayMealRow = {
  id: 'breakfast' | 'lunch' | 'dinner';
  name: string;
  recipes: PlanRecipeRow[];
};

export type PlanPreferences = {
  hasBreakfast: boolean;
  breakfastPreference: string;
  lunchPreference: string;
  dinnerPreference: string;
  stapleFoods: string[];
  dislikedIngredients: string[];
  servings: number;
  weekdayMaxCookTimeMinutes: number;
  weekendMaxCookTimeMinutes: number;
  configured: boolean;
  updatedAt: string | null;
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

const stringValue = (value: unknown, field: string): string => {
  const result = String(value ?? '').trim();
  if (!result) throw new ApiError('INVALID_ARGUMENT', `${field}不能为空`);
  return result;
};

const parseDate = (value: unknown): string => {
  const date = stringValue(value, '日期');
  const matched = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) throw new ApiError('INVALID_ARGUMENT', '日期格式应为 YYYY-MM-DD');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== Number(matched[1])
    || parsed.getUTCMonth() + 1 !== Number(matched[2])
    || parsed.getUTCDate() !== Number(matched[3])
  ) throw new ApiError('INVALID_ARGUMENT', '日期无效');
  return date;
};

const parseWeekStartDate = (value: unknown): string => {
  const date = parseDate(value);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (parsed.getUTCDay() !== 1) throw new ApiError('INVALID_ARGUMENT', '周开始日期必须是周一');
  return date;
};

const parseMonth = (value: unknown): string => {
  const month = stringValue(value, '月份');
  const matched = month.match(/^(\d{4})-(\d{2})$/);
  if (!matched) throw new ApiError('INVALID_ARGUMENT', '月份格式应为 YYYY-MM');
  const monthNumber = Number(matched[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new ApiError('INVALID_ARGUMENT', '月份无效');
  return month;
};

const parseMealType = (value: unknown): DayMealRow['id'] => {
  const mealType = stringValue(value, '餐段');
  if (!['breakfast', 'lunch', 'dinner'].includes(mealType)) {
    throw new ApiError('INVALID_ARGUMENT', '餐段必须是早餐、午餐或晚餐');
  }
  return mealType as DayMealRow['id'];
};

const parseUuid = (value: unknown, field: string): string => {
  const id = stringValue(value, field);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError('INVALID_ARGUMENT', `${field}格式不正确`);
  }
  return id;
};

const parseSortOrder = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0) throw new ApiError('INVALID_ARGUMENT', '排序值必须是非负整数');
  return result;
};

const parseCloneMode = (value: unknown): 'replace' | 'merge' => {
  const mode = stringValue(value, '复刻模式');
  if (!['replace', 'merge'].includes(mode)) {
    throw new ApiError('INVALID_ARGUMENT', '复刻模式必须是 replace 或 merge');
  }
  return mode as 'replace' | 'merge';
};

const requireConfirmToken = (value: unknown): void => {
  if (String(value || '').trim() !== 'CONFIRM') {
    throw new ApiError('INVALID_ARGUMENT', '批量操作需要确认标记');
  }
};

const parseTemplateName = (value: unknown): string => {
  const name = stringValue(value, '模板名称');
  if (Array.from(name).length > 60) throw new ApiError('INVALID_ARGUMENT', '模板名称不能超过 60 个字符');
  return name;
};

const parseTemplateApplyMode = (value: unknown): 'replace' | 'merge' => {
  if (value === undefined || value === null || value === '') return 'replace';
  const mode = String(value).trim();
  if (!['replace', 'merge'].includes(mode)) {
    throw new ApiError('INVALID_ARGUMENT', '模板应用模式必须是 replace 或 merge');
  }
  return mode as 'replace' | 'merge';
};

const DEFAULT_PLAN_PREFERENCES: PlanPreferences = {
  hasBreakfast: true,
  breakfastPreference: 'quick',
  lunchPreference: 'quick',
  dinnerPreference: 'balanced',
  stapleFoods: ['米饭'],
  dislikedIngredients: [],
  servings: 2,
  weekdayMaxCookTimeMinutes: 45,
  weekendMaxCookTimeMinutes: 90,
  configured: false,
  updatedAt: null
};

const optionalBoolean = (value: unknown, fallback: boolean, field: string): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new ApiError('INVALID_ARGUMENT', `${field}必须是布尔值`);
  return value;
};

const preferenceText = (value: unknown, fallback: string, field: string): string => {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  if (!text || Array.from(text).length > 40) {
    throw new ApiError('INVALID_ARGUMENT', `${field}长度必须为 1-40 个字符`);
  }
  return text;
};

const positiveInteger = (
  value: unknown,
  fallback: number,
  field: string,
  minimum: number,
  maximum: number
): number => {
  if (value === undefined || value === null || value === '') return fallback;
  const result = Number(value);
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new ApiError('INVALID_ARGUMENT', `${field}必须是 ${minimum}-${maximum} 的整数`);
  }
  return result;
};

const textList = (
  value: unknown,
  fallback: string[],
  field: string,
  maximumItems: number,
  maximumLength: number,
  requireOne: boolean
): string[] => {
  if (value === undefined || value === null) return fallback;
  if (!Array.isArray(value)) throw new ApiError('INVALID_ARGUMENT', `${field}必须是数组`);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = String(item ?? '').trim();
    if (!text) continue;
    if (Array.from(text).length > maximumLength) {
      throw new ApiError('INVALID_ARGUMENT', `${field}每项不能超过 ${maximumLength} 个字符`);
    }
    if (!seen.has(text)) {
      seen.add(text);
      result.push(text);
    }
  }
  if (requireOne && !result.length) throw new ApiError('INVALID_ARGUMENT', `${field}不能为空`);
  if (result.length > maximumItems) throw new ApiError('INVALID_ARGUMENT', `${field}最多 ${maximumItems} 项`);
  return result;
};

const parsePlanPreferences = (value: unknown): PlanPreferences => {
  const payload = asObject(value || {});
  return {
    hasBreakfast: optionalBoolean(payload.hasBreakfast, DEFAULT_PLAN_PREFERENCES.hasBreakfast, '是否吃早餐'),
    breakfastPreference: preferenceText(payload.breakfastPreference, DEFAULT_PLAN_PREFERENCES.breakfastPreference, '早餐偏好'),
    lunchPreference: preferenceText(payload.lunchPreference, DEFAULT_PLAN_PREFERENCES.lunchPreference, '午餐偏好'),
    dinnerPreference: preferenceText(payload.dinnerPreference, DEFAULT_PLAN_PREFERENCES.dinnerPreference, '晚餐偏好'),
    stapleFoods: textList(payload.stapleFoods, DEFAULT_PLAN_PREFERENCES.stapleFoods, '常用主食', 12, 20, true),
    dislikedIngredients: textList(payload.dislikedIngredients, DEFAULT_PLAN_PREFERENCES.dislikedIngredients, '忌口食材', 30, 20, false),
    servings: positiveInteger(payload.servings, DEFAULT_PLAN_PREFERENCES.servings, '用餐人数', 1, 12),
    weekdayMaxCookTimeMinutes: positiveInteger(
      payload.weekdayMaxCookTimeMinutes,
      DEFAULT_PLAN_PREFERENCES.weekdayMaxCookTimeMinutes,
      '工作日可接受耗时',
      5,
      240
    ),
    weekendMaxCookTimeMinutes: positiveInteger(
      payload.weekendMaxCookTimeMinutes,
      DEFAULT_PLAN_PREFERENCES.weekendMaxCookTimeMinutes,
      '周末可接受耗时',
      5,
      360
    ),
    configured: true,
    updatedAt: null
  };
};

const normalizePlanPreferences = (value: unknown): PlanPreferences => {
  const payload = asObject(value || {});
  return {
    ...parsePlanPreferences(payload),
    configured: Boolean(payload.configured),
    updatedAt: payload.updatedAt == null ? null : String(payload.updatedAt)
  };
};

const ensureIdentity = async (dependencies: PlanApiDependencies): Promise<VerifiedIdentity> => {
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

const getPlanPreferences = async (
  dependencies: PlanApiDependencies,
  identity: VerifiedIdentity
): Promise<PlanPreferences> => {
  const preferences = await dependencies.rpc.call<PlanPreferences>('cook_plan_preferences_get', {
    p_owner_id: identity.userId
  });
  return normalizePlanPreferences(preferences || DEFAULT_PLAN_PREFERENCES);
};

const coverKeys = (meals: DayMealRow[]): string[] => (
  [...new Set(meals.flatMap((meal) => meal.recipes || [])
    .map((item) => listCoverStorageKeyFor(item.recipeSnapshot?.coverStorageKey))
    .filter(Boolean))]
);

const mapRecipe = (row: PlanRecipeRow, urls: Record<string, string>): Record<string, unknown> => {
  const snapshot = row.recipeSnapshot || {};
  const coverStorageKey = listCoverStorageKeyFor(snapshot.coverStorageKey);
  return {
    id: row.id,
    recipeId: row.recipeId || snapshot.originalRecipeId || null,
    title: snapshot.name || '',
    coverUrl: coverStorageKey ? urls[coverStorageKey] || '' : '',
    duration: snapshot.cookTimeMinutes == null ? '' : `${snapshot.cookTimeMinutes}分钟`,
    calories: snapshot.caloriesKcal == null ? '' : `${snapshot.caloriesKcal}kcal`,
    source: row.source,
    sortOrder: row.sortOrder ?? 0,
    recipeSnapshot: snapshot
  };
};

const mapDay = async (rows: DayMealRow[], covers: CoverStorage): Promise<unknown> => {
  const meals = rows || [];
  const urls = await covers.signedUrls(coverKeys(meals));
  return meals.map((meal) => ({
    id: meal.id,
    name: meal.name,
    recipes: (meal.recipes || []).map((recipe) => mapRecipe(recipe, urls))
  }));
};

const addDays = (date: string, offset: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};

const weekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

const weekStartForDate = (date: string): string => {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() - ((parsed.getUTCDay() + 6) % 7));
  return parsed.toISOString().slice(0, 10);
};

const monthDates = (month: string): string[] => {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
};

const compareDate = (left: string, right: string): number => left.localeCompare(right);

const monthDateRange = (
  month: string,
  startDateValue?: unknown,
  endDateValue?: unknown
): string[] => {
  const dates = monthDates(month);
  const first = dates[0];
  const last = dates[dates.length - 1];
  const startDate = startDateValue === undefined || startDateValue === null || startDateValue === ''
    ? first
    : parseDate(startDateValue);
  const endDate = endDateValue === undefined || endDateValue === null || endDateValue === ''
    ? last
    : parseDate(endDateValue);
  if (!startDate.startsWith(`${month}-`) || !endDate.startsWith(`${month}-`)) {
    throw new ApiError('INVALID_ARGUMENT', '日期范围必须在目标月份内');
  }
  if (compareDate(startDate, endDate) > 0) throw new ApiError('INVALID_ARGUMENT', '开始日期不能晚于结束日期');
  return dates.filter((date) => compareDate(date, startDate) >= 0 && compareDate(date, endDate) <= 0);
};

const getWeek = async (
  dependencies: PlanApiDependencies,
  identity: VerifiedIdentity,
  weekStartDate: string,
  warnings: WeekPlanWarning[] = []
): Promise<Record<string, unknown>> => {
  const days = await Promise.all(Array.from({ length: 7 }, async (_, index) => {
    const date = addDays(weekStartDate, index);
    const rows = await dependencies.rpc.call<DayMealRow[]>('cook_plan_get_day', {
      p_owner_id: identity.userId,
      p_date: date
    });
    const mapped = await mapDay(rows, dependencies.covers) as Array<{
      id: DayMealRow['id'];
      name: string;
      recipes: Array<Record<string, unknown>>;
    }>;
    return {
      id: date,
      date,
      weekday: weekdayNames[index],
      day: Number(date.slice(-2)),
      isToday: date === new Date().toISOString().slice(0, 10),
      meals: mapped.map((meal) => ({
        type: meal.id,
        name: meal.name,
        items: meal.recipes
      }))
    };
  }));
  return { weekStartDate, days, warnings };
};

const getMonth = async (
  dependencies: PlanApiDependencies,
  identity: VerifiedIdentity,
  month: string
): Promise<Record<string, unknown>> => {
  const days = await Promise.all(monthDates(month).map(async (date) => {
    const rows = await dependencies.rpc.call<DayMealRow[]>('cook_plan_get_day', {
      p_owner_id: identity.userId,
      p_date: date
    });
    const parsed = new Date(`${date}T00:00:00.000Z`);
    const mapped = await mapDay(rows, dependencies.covers) as Array<{
      id: DayMealRow['id'];
      name: string;
      recipes: Array<Record<string, unknown>>;
    }>;
    return {
      id: date,
      date,
      day: parsed.getUTCDate(),
      weekday: weekdayNames[(parsed.getUTCDay() + 6) % 7],
      weekStartDate: weekStartForDate(date),
      meals: mapped.map((meal) => ({
        type: meal.id,
        name: meal.name,
        items: meal.recipes
      }))
    };
  }));
  return {
    month,
    days,
    summary: {
      totalDays: days.length,
      plannedDays: days.filter((day) => day.meals.some((meal) => meal.items.length)).length
    }
  };
};

const readDayRows = async (
  dependencies: PlanApiDependencies,
  ownerId: string,
  date: string
): Promise<DayMealRow[]> => dependencies.rpc.call<DayMealRow[]>('cook_plan_get_day', {
  p_owner_id: ownerId,
  p_date: date
});

const dayRecipeCount = (rows: DayMealRow[]): number => (
  (rows || []).reduce((sum, meal) => sum + (meal.recipes || []).length, 0)
);

const normalizeIngredientName = (value: unknown): string => (
  String(value ?? '')
    .trim()
    .replace(/(适量|少许|少量|若干)$/u, '')
    .replace(/\d+(?:\.\d+)?\s*(克|g|kg|千克|斤|个|颗|根|片|块|勺|匙|ml|毫升|升|l|杯|碗|只|枚|粒|把|张|包|袋|条|朵|瓣|头|段)?$/iu, '')
    .trim()
);

const ingredientNamesFromDisplay = (value: unknown): string[] => (
  String(value ?? '')
    .split(/[、,，;；]/u)
    .map(normalizeIngredientName)
    .filter(Boolean)
);

const ingredientNamesFromSnapshot = (snapshot: PlanSnapshot): string[] => {
  const result: string[] = [];
  for (const group of Array.isArray(snapshot.ingredients) ? snapshot.ingredients : []) {
    if (!group || typeof group !== 'object') continue;
    const record = group as { items?: unknown[]; display?: unknown };
    let hasStructuredItems = false;
    if (Array.isArray(record.items)) {
      for (const item of record.items) {
        if (!item || typeof item !== 'object') continue;
        const name = normalizeIngredientName((item as { name?: unknown }).name);
        if (name) {
          hasStructuredItems = true;
          result.push(name);
        }
      }
    }
    if (!hasStructuredItems) {
      result.push(...ingredientNamesFromDisplay(record.display));
    }
  }
  return result;
};

const recipeUniqueKey = (recipe: PlanRecipeRow): string => {
  const snapshot = recipe.recipeSnapshot || {};
  return String(
    recipe.recipeId
    || snapshot.originalRecipeId
    || String(snapshot.name || '').trim()
    || recipe.id
  );
};

const getMonthStats = async (
  dependencies: PlanApiDependencies,
  identity: VerifiedIdentity,
  month: string,
  dates: string[]
): Promise<Record<string, unknown>> => {
  let totalMealItems = 0;
  let plannedDays = 0;
  const emptyDates: string[] = [];
  const uniqueRecipeKeys = new Set<string>();
  const ingredientCounts = new Map<string, number>();

  for (const date of dates) {
    const rows = await readDayRows(dependencies, identity.userId, date);
    const dateCount = dayRecipeCount(rows);
    if (dateCount > 0) plannedDays += 1;
    else emptyDates.push(date);
    totalMealItems += dateCount;
    for (const meal of rows || []) {
      for (const recipe of meal.recipes || []) {
        uniqueRecipeKeys.add(recipeUniqueKey(recipe));
        for (const name of ingredientNamesFromSnapshot(recipe.recipeSnapshot || {})) {
          ingredientCounts.set(name, (ingredientCounts.get(name) || 0) + 1);
        }
      }
    }
  }

  const topIngredients = Array.from(ingredientCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, 'zh-Hans'))
    .slice(0, 10);

  return {
    month,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    totalDays: dates.length,
    plannedDays,
    totalMealItems,
    uniqueRecipeCount: uniqueRecipeKeys.size,
    topIngredients,
    emptyDates
  };
};

const removePlanRecipes = async (
  dependencies: PlanApiDependencies,
  ownerId: string,
  date: string,
  rows: DayMealRow[],
  predicate: (recipe: PlanRecipeRow) => boolean = () => true
): Promise<number> => {
  let removed = 0;
  for (const meal of rows || []) {
    for (const recipe of meal.recipes || []) {
      if (!predicate(recipe)) continue;
      const deleted = await dependencies.rpc.call<boolean>('cook_plan_remove_recipe', {
        p_owner_id: ownerId,
        p_date: date,
        p_meal_type: meal.id,
        p_plan_recipe_id: recipe.id
      });
      if (deleted) removed += 1;
    }
  }
  return removed;
};

const getMonthWithOperation = async (
  dependencies: PlanApiDependencies,
  identity: VerifiedIdentity,
  month: string,
  operation: Record<string, unknown>
): Promise<Record<string, unknown>> => ({
  operation,
  month: await getMonth(dependencies, identity, month)
});

const runAction = async (
  event: PlanApiEvent,
  dependencies: PlanApiDependencies,
  identity: VerifiedIdentity
): Promise<unknown> => {
  const payload = asObject(event.payload || {});
  switch (event.action) {
    case 'plans.week.get':
      return getWeek(dependencies, identity, parseWeekStartDate(payload.weekStartDate));
    case 'plans.month.get':
      return getMonth(dependencies, identity, parseMonth(payload.month));
    case 'plans.month.stats': {
      const month = parseMonth(payload.month);
      return getMonthStats(
        dependencies,
        identity,
        month,
        monthDateRange(month, payload.startDate, payload.endDate)
      );
    }
    case 'plans.month.clear': {
      const month = parseMonth(payload.month);
      requireConfirmToken(payload.confirmToken);
      const dates = monthDateRange(month, payload.startDate, payload.endDate);
      const removedCount = Number(await dependencies.rpc.call<number>('cook_plan_clear_range', {
        p_owner_id: identity.userId,
        p_start_date: dates[0],
        p_end_date: dates[dates.length - 1]
      }) || 0);
      return getMonthWithOperation(dependencies, identity, month, {
        type: 'clear',
        affectedDates: dates.length,
        removedCount
      });
    }
    case 'plans.week.clear': {
      const weekStartDate = parseWeekStartDate(payload.weekStartDate);
      const removedCount = Number(await dependencies.rpc.call<number>('cook_plan_clear_range', {
        p_owner_id: identity.userId,
        p_start_date: weekStartDate,
        p_end_date: addDays(weekStartDate, 6)
      }) || 0);
      const week = await getWeek(dependencies, identity, weekStartDate);
      return { ...week, operation: { type: 'clear', affectedDates: 7, removedCount } };
    }
    case 'plans.month.fillFromWeek': {
      const month = parseMonth(payload.month);
      requireConfirmToken(payload.confirmToken);
      const sourceWeekStartDate = parseWeekStartDate(payload.sourceWeekStartDate);
      const dates = monthDateRange(month, payload.startDate, payload.endDate);
      let filledDates = 0;
      let clonedCount = 0;
      for (const targetDate of dates) {
        const targetRows = await readDayRows(dependencies, identity.userId, targetDate);
        if (dayRecipeCount(targetRows) > 0) continue;
        const dayIndex = (new Date(`${targetDate}T00:00:00.000Z`).getUTCDay() + 6) % 7;
        const sourceDate = addDays(sourceWeekStartDate, dayIndex);
        if (sourceDate === targetDate) continue;
        const cloned = await dependencies.rpc.call<{
          sourceCount: number;
          clonedCount: number;
        }>('cook_plan_clone_day', {
          p_owner_id: identity.userId,
          p_source_date: sourceDate,
          p_target_date: targetDate,
          p_mode: 'replace'
        });
        if (Number(cloned?.clonedCount || 0) > 0) filledDates += 1;
        clonedCount += Number(cloned?.clonedCount || 0);
      }
      return getMonthWithOperation(dependencies, identity, month, {
        type: 'fillFromWeek',
        sourceWeekStartDate,
        scannedDates: dates.length,
        filledDates,
        clonedCount
      });
    }
    case 'plans.week.generate': {
      const weekStartDate = parseWeekStartDate(payload.weekStartDate);
      if (typeof payload.overwrite !== 'boolean') {
        throw new ApiError('INVALID_ARGUMENT', 'overwrite 必须是布尔值');
      }
      const preferences = await getPlanPreferences(dependencies, identity);
      const candidates = await dependencies.rpc.call<WeekPlanCandidate[]>('cook_plan_generation_candidates', {
        p_owner_id: identity.userId
      });
      const generated = generateWeekPlan(weekStartDate, candidates || [], randomUUID, preferences as WeekPlanPreferences);
      const persisted = await dependencies.rpc.call<{ conflict?: boolean }>('cook_plan_generate_week', {
        p_owner_id: identity.userId,
        p_week_start_date: weekStartDate,
        p_overwrite: payload.overwrite,
        p_entries: generated.entries
      });
      if (persisted?.conflict) throw new ApiError('CONFLICT', '本周已有计划，请确认后覆盖');
      return getWeek(dependencies, identity, weekStartDate, generated.warnings);
    }
    case 'plans.day.get': {
      const rows = await dependencies.rpc.call<DayMealRow[]>('cook_plan_get_day', {
        p_owner_id: identity.userId,
        p_date: parseDate(payload.date)
      });
      return mapDay(rows, dependencies.covers);
    }
    case 'plans.day.clone': {
      const sourceDate = parseDate(payload.sourceDate);
      const targetDate = parseDate(payload.targetDate);
      if (sourceDate === targetDate) throw new ApiError('INVALID_ARGUMENT', '源日期和目标日期不能相同');
      const mode = parseCloneMode(payload.mode);
      const cloned = await dependencies.rpc.call<{
        sourceDate: string;
        targetDate: string;
        mode: 'replace' | 'merge';
        sourceCount: number;
        clonedCount: number;
        day: DayMealRow[];
      }>('cook_plan_clone_day', {
        p_owner_id: identity.userId,
        p_source_date: sourceDate,
        p_target_date: targetDate,
        p_mode: mode
      });
      return {
        sourceDate,
        targetDate,
        mode,
        sourceCount: Number(cloned?.sourceCount || 0),
        clonedCount: Number(cloned?.clonedCount || 0),
        day: await mapDay(cloned?.day || [], dependencies.covers)
      };
    }
    case 'plans.day.meal.recipes.add': {
      const row = await dependencies.rpc.call<PlanRecipeRow | null>('cook_plan_add_recipe', {
        p_owner_id: identity.userId,
        p_date: parseDate(payload.date),
        p_meal_type: parseMealType(payload.mealType),
        p_recipe_id: parseUuid(payload.recipeId, '菜谱 ID'),
        p_plan_recipe_id: randomUUID(),
        p_sort_order: parseSortOrder(payload.sortOrder)
      });
      if (!row) throw new ApiError('NOT_FOUND', '菜谱不存在或已删除');
      const key = listCoverStorageKeyFor(row.recipeSnapshot?.coverStorageKey);
      const urls = key ? await dependencies.covers.signedUrls([key]) : {};
      return mapRecipe(row, urls);
    }
    case 'plans.day.meal.recipes.remove': {
      const deleted = await dependencies.rpc.call<boolean>('cook_plan_remove_recipe', {
        p_owner_id: identity.userId,
        p_date: parseDate(payload.date),
        p_meal_type: parseMealType(payload.mealType),
        p_plan_recipe_id: parseUuid(payload.planRecipeId, '计划菜谱 ID')
      });
      if (!deleted) throw new ApiError('NOT_FOUND', '计划菜谱不存在');
      return { deleted: true };
    }
    case 'plans.items.move': {
      const moved = await dependencies.rpc.call<boolean>('cook_plan_move_recipe', {
        p_owner_id: identity.userId,
        p_plan_recipe_id: parseUuid(payload.planRecipeId, '计划菜谱 ID'),
        p_target_date: parseDate(payload.targetDate),
        p_target_meal_type: parseMealType(payload.targetMealType),
        p_target_sort_order: parseSortOrder(payload.targetSortOrder) ?? 0
      });
      if (!moved) throw new ApiError('NOT_FOUND', '计划菜谱不存在');
      return { moved: true };
    }
    case 'plans.month.replaceRecipe': {
      const month = parseMonth(payload.month);
      requireConfirmToken(payload.confirmToken);
      const fromRecipeId = parseUuid(payload.fromRecipeId, '原菜谱 ID');
      const toRecipeId = parseUuid(payload.toRecipeId, '目标菜谱 ID');
      if (fromRecipeId === toRecipeId) throw new ApiError('INVALID_ARGUMENT', '原菜谱和目标菜谱不能相同');
      const targetRecipe = await dependencies.rpc.call<Record<string, unknown> | null>('ai_dish_library_get_recipe', {
        p_owner_id: identity.userId,
        p_recipe_id: toRecipeId
      });
      if (!targetRecipe) throw new ApiError('NOT_FOUND', '目标菜谱不存在');
      const dates = monthDateRange(month, payload.startDate, payload.endDate);
      let replacedCount = 0;
      for (const date of dates) {
        const rows = await readDayRows(dependencies, identity.userId, date);
        for (const meal of rows || []) {
          const matches = (meal.recipes || []).filter((recipe) => (
            recipe.recipeId === fromRecipeId || recipe.recipeSnapshot?.originalRecipeId === fromRecipeId
          ));
          for (const recipe of matches) {
            const added = await dependencies.rpc.call<PlanRecipeRow | null>('cook_plan_add_recipe', {
              p_owner_id: identity.userId,
              p_date: date,
              p_meal_type: meal.id,
              p_recipe_id: toRecipeId,
              p_plan_recipe_id: randomUUID(),
              p_sort_order: recipe.sortOrder ?? null
            });
            if (!added) throw new ApiError('NOT_FOUND', '目标菜谱不存在');
            const deleted = await dependencies.rpc.call<boolean>('cook_plan_remove_recipe', {
              p_owner_id: identity.userId,
              p_date: date,
              p_meal_type: meal.id,
              p_plan_recipe_id: recipe.id
            });
            if (deleted) replacedCount += 1;
          }
        }
      }
      return getMonthWithOperation(dependencies, identity, month, {
        type: 'replaceRecipe',
        fromRecipeId,
        toRecipeId,
        scannedDates: dates.length,
        replacedCount
      });
    }
    case 'plans.monthTemplates.create':
      return dependencies.rpc.call<Record<string, unknown>>('cook_month_plan_template_create', {
        p_owner_id: identity.userId,
        p_template_id: randomUUID(),
        p_name: parseTemplateName(payload.name),
        p_month: parseMonth(payload.month)
      });
    case 'plans.monthTemplates.list':
      return dependencies.rpc.call<Record<string, unknown>[]>('cook_month_plan_template_list', {
        p_owner_id: identity.userId
      });
    case 'plans.monthTemplates.apply': {
      const templateId = parseUuid(payload.templateId, '模板 ID');
      const targetMonth = parseMonth(payload.targetMonth);
      requireConfirmToken(payload.confirmToken);
      const mode = parseTemplateApplyMode(payload.mode);
      const operation = await dependencies.rpc.call<Record<string, unknown> | null>('cook_month_plan_template_apply', {
        p_owner_id: identity.userId,
        p_template_id: templateId,
        p_target_month: targetMonth,
        p_mode: mode
      });
      if (!operation) throw new ApiError('NOT_FOUND', '月度模板不存在');
      return getMonthWithOperation(dependencies, identity, targetMonth, operation);
    }
    case 'plans.monthTemplates.delete': {
      const deleted = await dependencies.rpc.call<boolean>('cook_month_plan_template_delete', {
        p_owner_id: identity.userId,
        p_template_id: parseUuid(payload.templateId, '模板 ID')
      });
      if (!deleted) throw new ApiError('NOT_FOUND', '月度模板不存在');
      return { deleted: true };
    }
    case 'plans.preferences.get':
      return getPlanPreferences(dependencies, identity);
    case 'plans.preferences.update': {
      const preferences = parsePlanPreferences(payload);
      const row = await dependencies.rpc.call<PlanPreferences>('cook_plan_preferences_upsert', {
        p_owner_id: identity.userId,
        p_has_breakfast: preferences.hasBreakfast,
        p_breakfast_preference: preferences.breakfastPreference,
        p_lunch_preference: preferences.lunchPreference,
        p_dinner_preference: preferences.dinnerPreference,
        p_staple_foods: preferences.stapleFoods,
        p_disliked_ingredients: preferences.dislikedIngredients,
        p_servings: preferences.servings,
        p_weekday_max_cook_time_minutes: preferences.weekdayMaxCookTimeMinutes,
        p_weekend_max_cook_time_minutes: preferences.weekendMaxCookTimeMinutes
      });
      return normalizePlanPreferences(row || { ...preferences, configured: true });
    }
    default:
      throw new ApiError('NOT_FOUND', '未知的计划服务操作');
  }
};

export const handlePlanApiEvent = async (
  event: PlanApiEvent,
  dependencies: PlanApiDependencies
): Promise<PlanApiResponse> => {
  try {
    const identity = await ensureIdentity(dependencies);
    return { ok: true, data: await runAction(event, dependencies, identity) };
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    const details = error as { code?: string; message?: string };
    const invalid = details.code === '22023';
    return {
      ok: false,
      error: {
        code: invalid ? 'INVALID_ARGUMENT' : 'INTERNAL_ERROR',
        message: invalid ? '计划参数无效' : '服务暂时不可用，请稍后重试'
      }
    };
  }
};

export const planApiInternals = {
  parseDate,
  parseMonth,
  parseWeekStartDate,
  parseMealType,
  parseUuid,
  parseSortOrder,
  parseCloneMode,
  parsePlanPreferences,
  normalizePlanPreferences,
  mapRecipe
};
