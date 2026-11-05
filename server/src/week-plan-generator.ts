import { hasSystemTag, normalizeRecipeSystemTags, type RecipeSystemTags } from './recipe-system-tags';

export type WeekPlanCandidate = {
  id: string;
  name: string;
  durationMinutes?: number | null;
  caloriesKcal?: number | null;
  coverStorageKey?: string | null;
  mainIngredients?: string;
  sideIngredients?: string;
  seasonings?: string;
  steps?: unknown[];
  systemTags?: RecipeSystemTags | null;
};

export type WeekPlanWarning = { code: string; message: string };
export type GeneratedWeekEntry = {
  id: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner';
  sortOrder: number;
  recipeId?: string;
  builtinSnapshot?: Record<string, unknown>;
};

export type GeneratedWeekPlan = {
  entries: GeneratedWeekEntry[];
  warnings: WeekPlanWarning[];
};

export type WeekPlanPreferences = {
  hasBreakfast?: boolean;
  breakfastPreference?: string;
  lunchPreference?: string;
  dinnerPreference?: string;
  stapleFoods?: string[];
  dislikedIngredients?: string[];
  weekdayMaxCookTimeMinutes?: number;
  weekendMaxCookTimeMinutes?: number;
  configured?: boolean;
};

type ClassifiedCandidate = WeekPlanCandidate & {
  breakfast: boolean;
  staple: boolean;
  oneMeal: boolean;
  protein: boolean;
  vegetable: boolean;
  slow: boolean;
};

// 早餐只由明确的早餐菜式推断，不能把“鸡蛋、玉米”等食材名当作早餐标志。
// 含有正餐烹饪语义时保持保守，避免将玉米排骨汤、牛奶炖蛋等误排进早餐。
const BREAKFAST_DISH = /早餐|早饭|早茶|粥|包子|馒头|花卷|吐司|三明治|煎饼|蛋饼|油条|烧麦|隔夜燕麦|燕麦粥|燕麦片|豆浆|牛奶/;
const MAIN_DISH_CONTEXT = /炒|炖|烧|焖|煲|烩|汤|鸡肉|鸡腿|鸡胸|鸡翅|鸡排|牛肉|牛腩|牛排|猪肉|五花肉|排骨|鱼|虾|豆腐/;
const STAPLE = /饭|面|粥|馒头|面包|饺子|馄饨|玉米|杂粮/;
const ONE_MEAL = /炒饭|盖饭|焖饭|面|饺子|馄饨|三明治/;
const PROTEIN = /肉|鱼|虾|蛋|豆腐|鸡|牛|猪|排骨|腊肠/;
const VEGETABLE = /青菜|白菜|生菜|豆角|西兰花|番茄|黄瓜|土豆|茄子|豆芽|菌菇|蔬菜|包菜/;
const BUILTIN_BREAKFASTS: Array<Array<{ name: string; amountText: string }>> = [
  [{ name: '玉米', amountText: '1根' }, { name: '鸡蛋', amountText: '1个' }, { name: '牛奶', amountText: '1盒' }],
  [{ name: '燕麦', amountText: '1份' }, { name: '牛奶', amountText: '1盒' }],
  [{ name: '吐司', amountText: '2片' }, { name: '鸡蛋', amountText: '1个' }],
  [{ name: '豆浆', amountText: '1杯' }, { name: '面包', amountText: '1份' }]
];

const addDays = (date: string, offset: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};

const isLegacyBreakfast = (name: string): boolean => (
  BREAKFAST_DISH.test(name) && !MAIN_DISH_CONTEXT.test(name)
);

const classify = (candidate: WeekPlanCandidate): ClassifiedCandidate => {
  const text = `${candidate.name} ${candidate.mainIngredients || ''} ${candidate.sideIngredients || ''}`;
  const tags = normalizeRecipeSystemTags(candidate.systemTags);
  return {
    ...candidate,
    breakfast: tags ? hasSystemTag(tags, 'mealTypes', 'breakfast') : isLegacyBreakfast(candidate.name),
    staple: tags ? hasSystemTag(tags, 'roles', 'staple') : STAPLE.test(candidate.name),
    oneMeal: tags ? tags.isOneDishMeal : ONE_MEAL.test(candidate.name),
    protein: tags
      ? hasSystemTag(tags, 'roles', 'protein_dish') || Boolean(tags.proteinTypes.length)
      : PROTEIN.test(text),
    vegetable: tags
      ? hasSystemTag(tags, 'roles', 'vegetable_dish') || Boolean(tags.vegetables.length)
      : VEGETABLE.test(text),
    slow: tags ? tags.timeLevel?.value === 'weekend' : Number(candidate.durationMinutes || 0) >= 45
  };
};

const builtinSnapshot = (name: string, ingredients: Array<{ name: string; amountText: string }>) => ({
  builtin: true,
  originalRecipeId: null,
  name,
  coverStorageKey: null,
  cookTimeMinutes: null,
  caloriesKcal: null,
  ingredients: [{ group: 'main', items: ingredients }],
  steps: []
});

const warningCollector = () => {
  const warnings: WeekPlanWarning[] = [];
  const seen = new Set<string>();
  return {
    warnings,
    add(code: string, message: string) {
      if (seen.has(code)) return;
      seen.add(code);
      warnings.push({ code, message });
    }
  };
};

const normalizeTextList = (items: string[] | undefined, fallback: string[]): string[] => {
  const normalized = (items || []).map((item) => item.trim()).filter(Boolean);
  return normalized.length ? normalized : fallback;
};

const candidateText = (candidate: WeekPlanCandidate) => (
  `${candidate.name} ${candidate.mainIngredients || ''} ${candidate.sideIngredients || ''} ${candidate.seasonings || ''}`
);

const matchesAnyText = (candidate: WeekPlanCandidate, keywords: string[]): boolean => {
  const text = candidateText(candidate);
  return keywords.some((keyword) => keyword && text.includes(keyword));
};

const builtinStaple = (stapleFoods: string[]): { name: string; ingredient: { name: string; amountText: string } } => {
  const preferred = stapleFoods[0] || '米饭';
  if (/面/.test(preferred)) return { name: preferred, ingredient: { name: '面条', amountText: '100克' } };
  if (/馒头|面包|玉米/.test(preferred)) return { name: preferred, ingredient: { name: preferred, amountText: '1份' } };
  return { name: preferred, ingredient: { name: preferred.includes('米') ? preferred : '大米', amountText: '100克' } };
};

export const generateWeekPlan = (
  weekStartDate: string,
  candidates: WeekPlanCandidate[],
  createId: () => string,
  preferences: WeekPlanPreferences = {}
): GeneratedWeekPlan => {
  const warnings = warningCollector();
  if (preferences.configured === false) {
    warnings.add('PLAN_PREFERENCES_DEFAULTED', '未设置饮食习惯，已使用默认规则生成。');
  }
  const stapleFoods = normalizeTextList(preferences.stapleFoods, ['米饭']);
  const dislikedIngredients = (preferences.dislikedIngredients || [])
    .map((item) => item.trim())
    .filter(Boolean);
  const allowedCandidates = candidates.filter((candidate) => (
    !dislikedIngredients.some((ingredient) => candidateText(candidate).includes(ingredient))
  ));
  if (allowedCandidates.length < candidates.length) {
    warnings.add('DISLIKED_INGREDIENTS_FILTERED', '已避开用户忌口食材，菜谱不足时可能放宽其他搭配规则。');
  }
  const recipes = allowedCandidates.map(classify);
  const breakfast = recipes.filter((item) => item.breakfast);
  const oneMeals = recipes.filter((item) => item.oneMeal);
  const proteins = recipes.filter((item) => item.protein && !item.staple);
  const vegetables = recipes.filter((item) => item.vegetable && !item.staple);
  const staples = recipes.filter((item) => item.staple);
  const usage = new Map<string, number>();
  const lastDay = new Map<string, number>();
  const breakfastUsage = new Map<string, number>();
  const lastBreakfastDay = new Map<string, number>();
  const entries: GeneratedWeekEntry[] = [];
  const hasBreakfast = preferences.hasBreakfast !== false;

  if (recipes.length < 5) {
    warnings.add('INSUFFICIENT_RECIPES', '菜谱较少，已生成基础计划，可继续添加菜谱丰富搭配。');
  }
  if (hasBreakfast && !breakfast.length) {
    warnings.add('NO_BREAKFAST_RECIPES', '暂无早餐菜谱，已使用内置早餐组合补位。');
  }
  if (!staples.length) {
    warnings.add('NO_STAPLE_RECIPES', '暂无主食菜谱，已使用米饭补位。');
  }
  if (!proteins.length || !vegetables.length) {
    warnings.add('INCOMPLETE_MEAL_COMBINATION', '部分正餐无法组成一荤一素，已使用现有菜谱和主食补位。');
  }

  const record = (recipe: ClassifiedCandidate, dayIndex: number) => {
    usage.set(recipe.id, (usage.get(recipe.id) || 0) + 1);
    lastDay.set(recipe.id, dayIndex);
  };
  const maxCookTimeForDay = (dayIndex: number): number => (
    dayIndex >= 5
      ? Number(preferences.weekendMaxCookTimeMinutes || 90)
      : Number(preferences.weekdayMaxCookTimeMinutes || 45)
  );
  const choose = (
    pool: ClassifiedCandidate[],
    dayIndex: number,
    usedInMeal: Set<string>,
    allowSlow: boolean,
    maximumUses = Number.POSITIVE_INFINITY,
    score: (candidate: ClassifiedCandidate) => number = () => 0,
    relaxCookTime = true
  ): ClassifiedCandidate | undefined => {
    const maxCookTime = maxCookTimeForDay(dayIndex);
    const eligible = pool.filter((item) => (
      !usedInMeal.has(item.id)
      && (allowSlow || !item.slow)
      && (!item.durationMinutes || item.durationMinutes <= maxCookTime)
      && (usage.get(item.id) || 0) < maximumUses
      && (lastDay.get(item.id) === undefined || dayIndex - Number(lastDay.get(item.id)) >= 2)
    ));
    const relaxed = pool.filter((item) => (
      !usedInMeal.has(item.id)
      && (allowSlow || !item.slow)
      && (relaxCookTime || !item.durationMinutes || item.durationMinutes <= maxCookTime)
      && (usage.get(item.id) || 0) < maximumUses
    ));
    if (relaxCookTime && !eligible.length && relaxed.some((item) => Number(item.durationMinutes || 0) > maxCookTime)) {
      warnings.add('COOK_TIME_RELAXED', '部分餐段菜谱不足，已放宽用户耗时限制。');
    }
    return (eligible.length ? eligible : relaxed)
      .sort((a, b) => (
        Number(!b.durationMinutes || b.durationMinutes <= maxCookTime) - Number(!a.durationMinutes || a.durationMinutes <= maxCookTime)
        || score(b) - score(a)
        || (usage.get(a.id) || 0) - (usage.get(b.id) || 0)
        || a.name.localeCompare(b.name)
      ))[0];
  };
  const addRecipe = (
    recipe: ClassifiedCandidate,
    date: string,
    mealType: GeneratedWeekEntry['mealType'],
    sortOrder: number,
    dayIndex: number
  ) => {
    entries.push({ id: createId(), date, mealType, sortOrder, recipeId: recipe.id });
    record(recipe, dayIndex);
  };
  const addBuiltin = (
    name: string,
    ingredients: Array<{ name: string; amountText: string }>,
    date: string,
    mealType: GeneratedWeekEntry['mealType'],
    sortOrder: number
  ) => entries.push({
    id: createId(),
    date,
    mealType,
    sortOrder,
    builtinSnapshot: builtinSnapshot(name, ingredients)
  });

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const date = addDays(weekStartDate, dayIndex);
    if (hasBreakfast) {
      const breakfastRecipe = breakfast
        .filter((item) => (
          (breakfastUsage.get(item.id) || 0) < 2
          && (lastBreakfastDay.get(item.id) === undefined || dayIndex - Number(lastBreakfastDay.get(item.id)) >= 2)
        ))
        .sort((a, b) => (
          (breakfastUsage.get(a.id) || 0) - (breakfastUsage.get(b.id) || 0)
          || a.name.localeCompare(b.name)
        ))[0];
      if (breakfastRecipe) {
        addRecipe(breakfastRecipe, date, 'breakfast', 0, dayIndex);
        breakfastUsage.set(breakfastRecipe.id, (breakfastUsage.get(breakfastRecipe.id) || 0) + 1);
        lastBreakfastDay.set(breakfastRecipe.id, dayIndex);
      } else {
        const breakfastItems = BUILTIN_BREAKFASTS[dayIndex % BUILTIN_BREAKFASTS.length];
        breakfastItems.forEach((item, sortOrder) => {
          addBuiltin(item.name, [{ name: item.name, amountText: item.amountText }], date, 'breakfast', sortOrder);
        });
      }
    }

    let slowUsedToday = false;
    for (const mealType of ['lunch', 'dinner'] as const) {
      const usedInMeal = new Set<string>();
      const weekend = dayIndex >= 5;
      const mealPreference = mealType === 'lunch'
        ? String(preferences.lunchPreference || 'quick')
        : String(preferences.dinnerPreference || 'balanced');
      const preferOneMeal = mealType === 'lunch'
        ? /quick|lunchbox|便当|快手/.test(mealPreference)
        : /quick|快手/.test(mealPreference);
      const chooseOneMeal = (relaxCookTime = true) => choose(
        oneMeals,
        dayIndex,
        usedInMeal,
        !weekend || !slowUsedToday,
        Number.POSITIVE_INFINITY,
        (item) => (item.durationMinutes && item.durationMinutes <= maxCookTimeForDay(dayIndex) ? 1 : 0),
        relaxCookTime
      );
      if (preferOneMeal) {
        const wholeMeal = chooseOneMeal(false);
        if (wholeMeal) {
          addRecipe(wholeMeal, date, mealType, 0, dayIndex);
          if (weekend && wholeMeal.slow) slowUsedToday = true;
          continue;
        }
      }

      let sortOrder = 0;
      const staple = choose(
        staples,
        dayIndex,
        usedInMeal,
        !weekend || !slowUsedToday,
        Number.POSITIVE_INFINITY,
        (item) => matchesAnyText(item, stapleFoods) ? 2 : 0
      );
      if (staple) {
        addRecipe(staple, date, mealType, sortOrder++, dayIndex);
        usedInMeal.add(staple.id);
        if (weekend && staple.slow) slowUsedToday = true;
      } else {
        const preferredStaple = builtinStaple(stapleFoods);
        addBuiltin(preferredStaple.name, [preferredStaple.ingredient], date, mealType, sortOrder++);
      }
      const protein = choose(proteins, dayIndex, usedInMeal, !weekend || !slowUsedToday);
      if (protein) {
        addRecipe(protein, date, mealType, sortOrder++, dayIndex);
        usedInMeal.add(protein.id);
        if (weekend && protein.slow) slowUsedToday = true;
      }
      const vegetable = choose(vegetables, dayIndex, usedInMeal, !weekend || !slowUsedToday);
      if (vegetable) {
        addRecipe(vegetable, date, mealType, sortOrder++, dayIndex);
        usedInMeal.add(vegetable.id);
        if (weekend && vegetable.slow) slowUsedToday = true;
      }
      if (!preferOneMeal && sortOrder === 0) {
        const wholeMeal = chooseOneMeal();
        if (wholeMeal) {
          addRecipe(wholeMeal, date, mealType, 0, dayIndex);
          if (weekend && wholeMeal.slow) slowUsedToday = true;
          continue;
        }
      }
    }
  }
  return { entries, warnings: warnings.warnings };
};

export const weekPlanGeneratorInternals = { classify, addDays };
