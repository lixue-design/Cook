import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWeekPlan, type WeekPlanCandidate } from '../src/week-plan-generator';

let sequence = 0;
const createId = () => `90000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
const recipe = (id: number, name: string, durationMinutes = 20, ingredients = ''): WeekPlanCandidate => ({
  id: `80000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  name,
  durationMinutes,
  mainIngredients: ingredients
});

test('generator creates seven days and three meals with server entries', () => {
  sequence = 0;
  const result = generateWeekPlan('2026-07-27', [
    recipe(1, '燕麦牛奶'), recipe(2, '鸡蛋吐司'), recipe(3, '三明治'),
    recipe(4, '牛肉炒饭', 20, '牛肉'),
    recipe(5, '鸡胸肉', 20, '鸡肉'),
    recipe(6, '清炒西兰花', 15, '西兰花'),
    recipe(7, '杂粮饭')
  ], createId);
  assert.equal(new Set(result.entries.map((item) => item.date)).size, 7);
  for (const date of new Set(result.entries.map((item) => item.date))) {
    assert.deepEqual(
      [...new Set(result.entries.filter((item) => item.date === date).map((item) => item.mealType))].sort(),
      ['breakfast', 'dinner', 'lunch']
    );
  }
});

test('breakfast recipes repeat at most twice and at least two days apart', () => {
  sequence = 0;
  const breakfast = recipe(1, '燕麦牛奶');
  const result = generateWeekPlan('2026-07-27', [breakfast], createId);
  const occurrences = result.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.mealType === 'breakfast' && entry.recipeId === breakfast.id);
  assert.equal(occurrences.length, 2);
  const days = occurrences.map(({ entry }) => Number(entry.date.slice(-2)));
  assert.ok(days[1] - days[0] >= 2);
});

test('legacy breakfast inference rejects ingredient words and cooked main dishes', () => {
  sequence = 0;
  const confusingDishes = [
    recipe(1, '西红柿炒鸡蛋'),
    recipe(2, '玉米排骨汤'),
    recipe(3, '牛奶炖蛋')
  ];
  const actualBreakfast = recipe(4, '燕麦粥');
  const result = generateWeekPlan('2026-07-27', [...confusingDishes, actualBreakfast], createId);
  const breakfastRecipeIds = new Set(result.entries
    .filter((entry) => entry.mealType === 'breakfast' && entry.recipeId)
    .map((entry) => entry.recipeId));
  assert.equal(breakfastRecipeIds.has(actualBreakfast.id), true);
  for (const dish of confusingDishes) assert.equal(breakfastRecipeIds.has(dish.id), false);
});

test('no breakfast and no staple use builtins and return displayable warnings', () => {
  sequence = 0;
  const result = generateWeekPlan('2026-07-27', [
    recipe(1, '红烧牛肉', 30, '牛肉'),
    recipe(2, '清炒西兰花', 15, '西兰花')
  ], createId);
  assert.ok(result.warnings.some((item) => item.code === 'NO_BREAKFAST_RECIPES'));
  assert.ok(result.warnings.some((item) => item.code === 'NO_STAPLE_RECIPES'));
  assert.equal(result.entries.filter((item) => item.mealType === 'breakfast').every((item) => item.builtinSnapshot), true);
  const mondayBreakfast = result.entries
    .filter((item) => item.date === '2026-07-27' && item.mealType === 'breakfast')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => item.builtinSnapshot?.name);
  assert.deepEqual(mondayBreakfast, ['玉米', '鸡蛋', '牛奶']);
  assert.ok(result.entries.some((item) => item.builtinSnapshot?.name === '米饭'));
});

test('staple is the first entry of a composed meal', () => {
  sequence = 0;
  const candidates = [
    recipe(1, '香煎鸡胸肉', 25, '鸡肉'),
    recipe(2, '清炒西兰花', 15, '西兰花'),
    recipe(3, '米饭', 10, '大米')
  ];
  const result = generateWeekPlan('2026-07-27', candidates, createId, {
    hasBreakfast: false,
    lunchPreference: 'balanced',
    dinnerPreference: 'balanced'
  });
  const mondayLunch = result.entries
    .filter((entry) => entry.date === '2026-07-27' && entry.mealType === 'lunch')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  assert.equal(mondayLunch[0]?.recipeId, candidates[2].id);
});

test('weekend plans contain at most one slow recipe per day', () => {
  sequence = 0;
  const slowIds = new Set([
    recipe(1, '慢炖牛肉', 60, '牛肉').id,
    recipe(2, '慢烤鸡肉', 55, '鸡肉').id
  ]);
  const candidates = [
    recipe(1, '慢炖牛肉', 60, '牛肉'),
    recipe(2, '慢烤鸡肉', 55, '鸡肉'),
    recipe(3, '清炒西兰花', 15, '西兰花'),
    recipe(4, '米饭', 20)
  ];
  const result = generateWeekPlan('2026-07-27', candidates, createId);
  for (const date of ['2026-08-01', '2026-08-02']) {
    assert.ok(result.entries.filter((item) => item.date === date && item.recipeId && slowIds.has(item.recipeId)).length <= 1);
  }
});

test('breakfast can be disabled by user preferences', () => {
  sequence = 0;
  const result = generateWeekPlan('2026-07-27', [
    recipe(1, '燕麦牛奶'),
    recipe(2, '牛肉炒饭', 20, '牛肉')
  ], createId, { hasBreakfast: false });
  assert.equal(result.entries.some((item) => item.mealType === 'breakfast'), false);
  assert.equal(result.warnings.some((item) => item.code === 'NO_BREAKFAST_RECIPES'), false);
});

test('disliked ingredients are filtered with a stable warning', () => {
  sequence = 0;
  const result = generateWeekPlan('2026-07-27', [
    recipe(1, '香菜牛肉炒饭', 20, '牛肉、香菜'),
    recipe(2, '清炒西兰花', 15, '西兰花'),
    recipe(3, '米饭')
  ], createId, { dislikedIngredients: ['香菜'] });
  assert.equal(result.entries.some((item) => item.recipeId === '80000000-0000-4000-8000-000000000001'), false);
  assert.ok(result.warnings.some((item) => item.code === 'DISLIKED_INGREDIENTS_FILTERED'));
});

test('lunch prefers quick one-meal dishes while family dinner composes balanced meals', () => {
  sequence = 0;
  const candidates = [
    recipe(1, '牛肉炒饭', 20, '牛肉、米饭'),
    recipe(2, '香煎鸡胸肉', 25, '鸡肉'),
    recipe(3, '清炒西兰花', 15, '西兰花'),
    recipe(4, '杂粮饭', 15, '杂粮米')
  ];
  const result = generateWeekPlan('2026-07-27', candidates, createId, {
    hasBreakfast: false,
    lunchPreference: 'quick',
    dinnerPreference: 'family'
  });
  const mondayLunch = result.entries.filter((entry) => entry.date === '2026-07-27' && entry.mealType === 'lunch');
  const mondayDinner = result.entries.filter((entry) => entry.date === '2026-07-27' && entry.mealType === 'dinner');
  assert.deepEqual(mondayLunch.map((entry) => entry.recipeId), [candidates[0].id]);
  assert.deepEqual(mondayDinner.map((entry) => entry.recipeId), [
    candidates[3].id,
    candidates[1].id,
    candidates[2].id
  ]);
});

test('staple food preferences influence staple choice and builtin fallback', () => {
  sequence = 0;
  const result = generateWeekPlan('2026-07-27', [
    recipe(1, '香煎鸡胸肉', 25, '鸡肉'),
    recipe(2, '清炒西兰花', 15, '西兰花')
  ], createId, {
    hasBreakfast: false,
    dinnerPreference: 'family',
    stapleFoods: ['面条']
  });
  const stapleFallbacks = result.entries.filter((entry) => (
    entry.mealType !== 'breakfast' && entry.builtinSnapshot
  ));
  assert.ok(stapleFallbacks.length > 0);
  assert.equal(stapleFallbacks.every((entry) => entry.builtinSnapshot?.name === '面条'), true);
});

test('weekday cook time preferences avoid slow dishes when faster balanced options exist', () => {
  sequence = 0;
  const candidates = [
    recipe(1, '慢炖牛肉盖饭', 90, '牛肉、米饭'),
    recipe(2, '香煎鸡胸肉', 25, '鸡肉'),
    recipe(3, '清炒西兰花', 15, '西兰花'),
    recipe(4, '米饭', 10)
  ];
  const result = generateWeekPlan('2026-07-27', candidates, createId, {
    hasBreakfast: false,
    lunchPreference: 'quick',
    dinnerPreference: 'family',
    weekdayMaxCookTimeMinutes: 30
  });
  const mondayEntries = result.entries.filter((entry) => entry.date === '2026-07-27');
  assert.equal(mondayEntries.some((entry) => entry.recipeId === candidates[0].id), false);
});

test('cook time warning appears when recipes are insufficient and limits are relaxed', () => {
  sequence = 0;
  const result = generateWeekPlan('2026-07-27', [
    recipe(1, '慢炖牛肉盖饭', 90, '牛肉、米饭')
  ], createId, {
    hasBreakfast: false,
    lunchPreference: 'quick',
    weekdayMaxCookTimeMinutes: 30
  });
  assert.ok(result.entries.some((entry) => entry.recipeId === '80000000-0000-4000-8000-000000000001'));
  assert.ok(result.warnings.some((warning) => warning.code === 'COOK_TIME_RELAXED'));
});

test('generator prioritizes persisted system tags before legacy keyword inference', () => {
  sequence = 0;
  const taggedBreakfast = {
    ...recipe(1, '晨间餐', 10),
    systemTags: {
      tagVersion: 1,
      mealTypes: [{ value: 'breakfast', source: 'title', confidence: 'high' }],
      roles: [],
      proteinTypes: [],
      vegetables: [],
      cookMethods: [],
      timeLevel: { value: 'quick', source: 'duration', confidence: 'high' },
      isOneDishMeal: false
    }
  } as WeekPlanCandidate;
  const result = generateWeekPlan('2026-07-27', [taggedBreakfast], createId);
  assert.equal(
    result.entries.filter((entry) => entry.mealType === 'breakfast' && entry.recipeId === taggedBreakfast.id).length,
    2
  );
  assert.equal(result.warnings.some((warning) => warning.code === 'NO_BREAKFAST_RECIPES'), false);
});
