import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handlePlanApiEvent,
  planApiInternals,
  type PlanApiDependencies
} from '../src/plan-api';
import type { CoverStorage, RpcExecutor } from '../src/recipe-api';

const identity = { userId: 'cloud-user-a', appId: 'wx-app', openId: 'open-a' };
const recipeId = '80000000-0000-4000-8000-000000000001';
const replacementRecipeId = '80000000-0000-4000-8000-000000000002';
const planRecipeId = '90000000-0000-4000-8000-000000000001';
const monthTemplateId = '70000000-0000-4000-8000-000000000001';
const storageKey = 'user-hash/cover.original.jpg';
const thumbnailStorageKey = 'user-hash/cover.thumbnail.webp';
const defaultPreferences = {
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

const covers: CoverStorage = {
  async upload() {},
  async signedUrls(paths) {
    return Object.fromEntries(paths.map((path) => [path, `https://signed.example/${path}`]));
  }
};

const dependenciesWith = (rpc: RpcExecutor): PlanApiDependencies => ({
  getIdentity: async () => identity,
  rpc,
  covers
});

const snapshot = {
  originalRecipeId: recipeId,
  name: '番茄炒蛋',
  coverStorageKey: storageKey,
  cookTimeMinutes: 12,
  caloriesKcal: 209,
  ingredients: [
    { group: 'main', display: '番茄2个、鸡蛋3个' },
    { group: 'side', display: '' },
    { group: 'seasoning', display: '盐少许' }
  ],
  steps: [{ id: 'step-1', text: '炒熟', imageUrl: '' }]
};

test('day plan validates calendar dates, meal types and ids', () => {
  assert.equal(planApiInternals.parseDate('2026-07-31'), '2026-07-31');
  assert.equal(planApiInternals.parseMonth('2026-02'), '2026-02');
  assert.throws(() => planApiInternals.parseDate('2026-02-30'));
  assert.throws(() => planApiInternals.parseDate('31-07-2026'));
  assert.throws(() => planApiInternals.parseMonth('2026-13'));
  assert.equal(planApiInternals.parseMealType('breakfast'), 'breakfast');
  assert.throws(() => planApiInternals.parseMealType('snack'));
  assert.throws(() => planApiInternals.parseUuid('not-an-id', 'ID'));
  assert.equal(planApiInternals.parseSortOrder(0), 0);
  assert.throws(() => planApiInternals.parseSortOrder(-1));
  assert.equal(planApiInternals.parseWeekStartDate('2026-07-27'), '2026-07-27');
  assert.throws(() => planApiInternals.parseWeekStartDate('2026-07-28'));
});

test('week generation persists generated entries and returns seven mapped days with warnings', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_preferences_get') return defaultPreferences as T;
      if (name === 'cook_plan_generation_candidates') {
        return [{
          id: recipeId,
          name: '燕麦牛奶',
          durationMinutes: 10,
          mainIngredients: '燕麦50克、牛奶250ml'
        }] as T;
      }
      if (name === 'cook_plan_generate_week') return { conflict: false } as T;
      if (name === 'cook_plan_get_day') {
        return [
          { id: 'breakfast', name: '早餐', recipes: [] },
          { id: 'lunch', name: '午餐', recipes: [] },
          { id: 'dinner', name: '晚餐', recipes: [] }
        ] as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.week.generate',
    payload: { weekStartDate: '2026-07-27', overwrite: false, userId: 'forged-user' }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  const persist = calls.find((call) => call.name === 'cook_plan_generate_week');
  assert.equal(persist?.args.p_owner_id, identity.userId);
  assert.equal(persist?.args.p_overwrite, false);
  assert.ok(Array.isArray(persist?.args.p_entries));
  if (result.ok) {
    const week = result.data as { days: unknown[]; warnings: Array<{ code: string }> };
    assert.equal(week.days.length, 7);
    assert.ok(week.warnings.some((warning) => warning.code === 'INSUFFICIENT_RECIPES'));
  }
});

test('week generation returns conflict unless overwrite is explicitly confirmed', async () => {
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_preferences_get') return defaultPreferences as T;
      if (name === 'cook_plan_generation_candidates') return [] as T;
      if (name === 'cook_plan_generate_week') return { conflict: true } as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.week.generate',
    payload: { weekStartDate: '2026-07-27', overwrite: false }
  }, dependenciesWith(rpc));
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'CONFLICT', message: '本周已有计划，请确认后覆盖' }
  });
});

test('day read uses trusted identity and always maps three meal groups', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_get_day') {
        return [
          { id: 'breakfast', name: '早餐', recipes: [] },
          {
            id: 'lunch',
            name: '午餐',
            recipes: [{ id: planRecipeId, recipeId, source: 'manual', sortOrder: 0, recipeSnapshot: snapshot }]
          },
          { id: 'dinner', name: '晚餐', recipes: [] }
        ] as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent(
    { action: 'plans.day.get', payload: { date: '2026-07-31', userId: 'forged-user' } },
    dependenciesWith(rpc)
  );
  assert.equal(result.ok, true);
  assert.equal(calls[1].args.p_owner_id, identity.userId);
  if (result.ok) {
    const meals = result.data as Array<{ id: string; recipes: Array<Record<string, unknown>> }>;
    assert.deepEqual(meals.map((meal) => meal.id), ['breakfast', 'lunch', 'dinner']);
    assert.equal(meals[1].recipes[0].title, '番茄炒蛋');
    assert.equal(meals[1].recipes[0].coverUrl, `https://signed.example/${thumbnailStorageKey}`);
    assert.deepEqual((meals[1].recipes[0].recipeSnapshot as typeof snapshot).ingredients, snapshot.ingredients);
  }
});

test('month read aggregates every day from day-level plan facts', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_get_day') {
        const date = String(args.p_date);
        return [
          { id: 'breakfast', name: '早餐', recipes: [] },
          {
            id: 'lunch',
            name: '午餐',
            recipes: date === '2026-02-14'
              ? [{ id: planRecipeId, recipeId, source: 'manual', sortOrder: 0, recipeSnapshot: snapshot }]
              : []
          },
          { id: 'dinner', name: '晚餐', recipes: [] }
        ] as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.month.get',
    payload: { month: '2026-02', userId: 'forged-user' }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  const dayReads = calls.filter((call) => call.name === 'cook_plan_get_day');
  assert.equal(dayReads.length, 28);
  assert.equal(dayReads[0].args.p_owner_id, identity.userId);
  assert.equal(dayReads[0].args.p_date, '2026-02-01');
  assert.equal(dayReads.at(-1)?.args.p_date, '2026-02-28');
  if (result.ok) {
    const month = result.data as {
      days: Array<{ date: string; weekStartDate: string; meals: Array<{ items: Array<Record<string, unknown>> }> }>;
      summary: { totalDays: number; plannedDays: number };
    };
    assert.equal(month.summary.totalDays, 28);
    assert.equal(month.summary.plannedDays, 1);
    assert.equal(month.days[0].weekStartDate, '2026-01-26');
    assert.equal(month.days.find((day) => day.date === '2026-02-14')?.meals[1].items[0].title, '番茄炒蛋');
  }
});

test('month stats aggregate day-level snapshots and ingredient counts', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const customSnapshot = {
    originalRecipeId: replacementRecipeId,
    name: '清炒西兰花',
    ingredients: [{ group: 'main', display: '西兰花200克、鸡蛋1个' }],
    steps: []
  };
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_get_day') {
        const date = String(args.p_date);
        return [
          { id: 'breakfast', name: '早餐', recipes: [] },
          {
            id: 'lunch',
            name: '午餐',
            recipes: date === '2026-02-01'
              ? [
                {
                  id: planRecipeId,
                  recipeId,
                  source: 'manual',
                  sortOrder: 0,
                  recipeSnapshot: {
                    ...snapshot,
                    ingredients: [{ group: 'main', items: [{ name: '番茄', amount: '2个' }, { name: '鸡蛋', amount: '3个' }] }]
                  }
                },
                {
                  id: '90000000-0000-4000-8000-000000000002',
                  recipeId,
                  source: 'manual',
                  sortOrder: 1,
                  recipeSnapshot: {
                    ...snapshot,
                    ingredients: [{ group: 'main', display: '番茄2个、鸡蛋3个' }]
                  }
                }
              ]
              : []
          },
          {
            id: 'dinner',
            name: '晚餐',
            recipes: date === '2026-02-02'
              ? [{
                id: '90000000-0000-4000-8000-000000000003',
                recipeId: null,
                source: 'manual',
                sortOrder: 0,
                recipeSnapshot: customSnapshot
              }]
              : []
          }
        ] as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.month.stats',
    payload: {
      month: '2026-02',
      startDate: '2026-02-01',
      endDate: '2026-02-03',
      userId: 'forged-user'
    }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  const dayReads = calls.filter((call) => call.name === 'cook_plan_get_day');
  assert.equal(dayReads.length, 3);
  assert.equal(dayReads[0].args.p_owner_id, identity.userId);
  if (result.ok) {
    const stats = result.data as {
      totalMealItems: number;
      uniqueRecipeCount: number;
      plannedDays: number;
      topIngredients: Array<{ name: string; count: number }>;
      emptyDates: string[];
    };
    assert.equal(stats.totalMealItems, 3);
    assert.equal(stats.uniqueRecipeCount, 2);
    assert.equal(stats.plannedDays, 2);
    assert.deepEqual(stats.emptyDates, ['2026-02-03']);
    assert.deepEqual(stats.topIngredients.slice(0, 3), [
      { name: '鸡蛋', count: 3 },
      { name: '番茄', count: 2 },
      { name: '西兰花', count: 1 }
    ]);
  }
});

test('month clear requires confirmation and atomically removes owner-scoped plan headers in range', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_clear_range') return 2 as T;
      if (name === 'cook_plan_get_day') {
        return [
          { id: 'breakfast', name: '早餐', recipes: [] },
          {
            id: 'lunch',
            name: '午餐',
            recipes: [{ id: planRecipeId, recipeId, source: 'manual', sortOrder: 0, recipeSnapshot: snapshot }]
          },
          { id: 'dinner', name: '晚餐', recipes: [] }
        ] as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.month.clear',
    payload: {
      month: '2026-02',
      startDate: '2026-02-14',
      endDate: '2026-02-15',
      confirmToken: 'CONFIRM',
      userId: 'forged-user'
    }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  const clear = calls.find((call) => call.name === 'cook_plan_clear_range');
  assert.equal(clear?.args.p_owner_id, identity.userId);
  assert.equal(clear?.args.p_start_date, '2026-02-14');
  assert.equal(clear?.args.p_end_date, '2026-02-15');
  if (result.ok) {
    const payload = result.data as { operation: { removedCount: number; affectedDates: number } };
    assert.equal(payload.operation.removedCount, 2);
    assert.equal(payload.operation.affectedDates, 2);
  }
});

test('week clear uses one owner-scoped range deletion and returns seven empty days', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_clear_range') return 9 as T;
      if (name === 'cook_plan_get_day') return [
        { id: 'breakfast', name: '早餐', recipes: [] },
        { id: 'lunch', name: '午餐', recipes: [] },
        { id: 'dinner', name: '晚餐', recipes: [] }
      ] as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.week.clear',
    payload: { weekStartDate: '2026-07-27' }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  const clear = calls.find((call) => call.name === 'cook_plan_clear_range');
  assert.deepEqual(clear?.args, {
    p_owner_id: identity.userId,
    p_start_date: '2026-07-27',
    p_end_date: '2026-08-02'
  });
  if (result.ok) {
    const data = result.data as { days: unknown[]; operation: { removedCount: number } };
    assert.equal(data.days.length, 7);
    assert.equal(data.operation.removedCount, 9);
  }
});

test('month fill from week clones snapshots into blank month days only', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_get_day') {
        const date = String(args.p_date);
        const hasExisting = date === '2026-02-02';
        return [
          { id: 'breakfast', name: '早餐', recipes: [] },
          {
            id: 'lunch',
            name: '午餐',
            recipes: hasExisting
              ? [{ id: planRecipeId, recipeId, source: 'manual', sortOrder: 0, recipeSnapshot: snapshot }]
              : []
          },
          { id: 'dinner', name: '晚餐', recipes: [] }
        ] as T;
      }
      if (name === 'cook_plan_clone_day') return { sourceCount: 1, clonedCount: 1 } as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.month.fillFromWeek',
    payload: {
      month: '2026-02',
      sourceWeekStartDate: '2026-01-19',
      startDate: '2026-02-01',
      endDate: '2026-02-03',
      confirmToken: 'CONFIRM'
    }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  const clones = calls.filter((call) => call.name === 'cook_plan_clone_day');
  assert.equal(clones.length, 2);
  assert.deepEqual(clones.map((call) => call.args.p_target_date), ['2026-02-01', '2026-02-03']);
  assert.equal(clones[0].args.p_source_date, '2026-01-25');
  assert.equal(clones[0].args.p_owner_id, identity.userId);
  if (result.ok) {
    const payload = result.data as { operation: { filledDates: number; clonedCount: number } };
    assert.equal(payload.operation.filledDates, 2);
    assert.equal(payload.operation.clonedCount, 2);
  }
});

test('month replace recipe writes target recipe snapshots and removes old items', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'ai_dish_library_get_recipe') return { id: replacementRecipeId, displayName: '清炒西兰花' } as T;
      if (name === 'cook_plan_get_day') {
        return [
          { id: 'breakfast', name: '早餐', recipes: [] },
          {
            id: 'lunch',
            name: '午餐',
            recipes: [{ id: planRecipeId, recipeId, source: 'manual', sortOrder: 3, recipeSnapshot: snapshot }]
          },
          { id: 'dinner', name: '晚餐', recipes: [] }
        ] as T;
      }
      if (name === 'cook_plan_add_recipe') {
        return {
          id: args.p_plan_recipe_id,
          recipeId: replacementRecipeId,
          source: 'manual',
          sortOrder: args.p_sort_order,
          recipeSnapshot: { ...snapshot, originalRecipeId: replacementRecipeId, name: '清炒西兰花' }
        } as T;
      }
      if (name === 'cook_plan_remove_recipe') return true as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.month.replaceRecipe',
    payload: {
      month: '2026-02',
      startDate: '2026-02-01',
      endDate: '2026-02-01',
      fromRecipeId: recipeId,
      toRecipeId: replacementRecipeId,
      confirmToken: 'CONFIRM'
    }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  const add = calls.find((call) => call.name === 'cook_plan_add_recipe');
  assert.equal(add?.args.p_owner_id, identity.userId);
  assert.equal(add?.args.p_recipe_id, replacementRecipeId);
  assert.equal(add?.args.p_sort_order, 3);
  assert.ok(calls.some((call) => call.name === 'cook_plan_remove_recipe' && call.args.p_plan_recipe_id === planRecipeId));
  if (result.ok) {
    const payload = result.data as { operation: { replacedCount: number } };
    assert.equal(payload.operation.replacedCount, 1);
  }
});

test('month templates create, list, apply and delete with trusted owner scope', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const templatePayload = {
    id: monthTemplateId,
    name: '清淡月计划',
    sourceMonth: '2026-02',
    itemCount: 1,
    createdAt: '2026-08-05T10:00:00.000Z',
    updatedAt: '2026-08-05T10:00:00.000Z'
  };
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_month_plan_template_create') return templatePayload as T;
      if (name === 'cook_month_plan_template_list') return [templatePayload] as T;
      if (name === 'cook_month_plan_template_apply') {
        return { templateId: monthTemplateId, targetMonth: '2026-03', mode: 'replace', appliedCount: 1 } as T;
      }
      if (name === 'cook_month_plan_template_delete') return true as T;
      if (name === 'cook_plan_get_day') {
        return [
          { id: 'breakfast', name: '早餐', recipes: [] },
          { id: 'lunch', name: '午餐', recipes: [] },
          { id: 'dinner', name: '晚餐', recipes: [] }
        ] as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const created = await handlePlanApiEvent({
    action: 'plans.monthTemplates.create',
    payload: { month: '2026-02', name: ' 清淡月计划 ', userId: 'forged-user' }
  }, dependenciesWith(rpc));
  assert.equal(created.ok, true);
  const createCall = calls.find((call) => call.name === 'cook_month_plan_template_create');
  assert.equal(createCall?.args.p_owner_id, identity.userId);
  assert.equal(createCall?.args.p_name, '清淡月计划');
  assert.equal(createCall?.args.p_month, '2026-02');

  const listed = await handlePlanApiEvent({
    action: 'plans.monthTemplates.list',
    payload: { userId: 'forged-user' }
  }, dependenciesWith(rpc));
  assert.equal(listed.ok, true);
  const listCall = calls.find((call) => call.name === 'cook_month_plan_template_list');
  assert.equal(listCall?.args.p_owner_id, identity.userId);

  const applied = await handlePlanApiEvent({
    action: 'plans.monthTemplates.apply',
    payload: {
      templateId: monthTemplateId,
      targetMonth: '2026-03',
      confirmToken: 'CONFIRM',
      userId: 'forged-user'
    }
  }, dependenciesWith(rpc));
  assert.equal(applied.ok, true);
  const applyCall = calls.find((call) => call.name === 'cook_month_plan_template_apply');
  assert.equal(applyCall?.args.p_owner_id, identity.userId);
  assert.equal(applyCall?.args.p_template_id, monthTemplateId);
  assert.equal(applyCall?.args.p_mode, 'replace');
  if (applied.ok) {
    const payload = applied.data as { operation: { appliedCount: number }; month: { month: string } };
    assert.equal(payload.operation.appliedCount, 1);
    assert.equal(payload.month.month, '2026-03');
  }

  const deleted = await handlePlanApiEvent({
    action: 'plans.monthTemplates.delete',
    payload: { templateId: monthTemplateId }
  }, dependenciesWith(rpc));
  assert.deepEqual(deleted, { ok: true, data: { deleted: true } });
  const deleteCall = calls.find((call) => call.name === 'cook_month_plan_template_delete');
  assert.equal(deleteCall?.args.p_owner_id, identity.userId);
});

test('day clone copies stored snapshots through an owner-scoped RPC', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_clone_day') {
        return {
          sourceDate: '2026-07-31',
          targetDate: '2026-08-01',
          mode: 'replace',
          sourceCount: 1,
          clonedCount: 1,
          day: [
            { id: 'breakfast', name: '早餐', recipes: [] },
            {
              id: 'lunch',
              name: '午餐',
              recipes: [{ id: args.p_plan_recipe_id || planRecipeId, recipeId: null, source: 'manual', sortOrder: 0, recipeSnapshot: snapshot }]
            },
            { id: 'dinner', name: '晚餐', recipes: [] }
          ]
        } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.day.clone',
    payload: {
      sourceDate: '2026-07-31',
      targetDate: '2026-08-01',
      mode: 'replace',
      userId: 'forged-user'
    }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  const cloneCall = calls.find((call) => call.name === 'cook_plan_clone_day');
  assert.equal(cloneCall?.args.p_owner_id, identity.userId);
  assert.equal(cloneCall?.args.p_source_date, '2026-07-31');
  assert.equal(cloneCall?.args.p_target_date, '2026-08-01');
  assert.equal(cloneCall?.args.p_mode, 'replace');
  if (result.ok) {
    const payload = result.data as {
      clonedCount: number;
      day: Array<{ id: string; recipes: Array<Record<string, unknown>> }>;
    };
    assert.equal(payload.clonedCount, 1);
    assert.equal(payload.day[1].recipes[0].title, '番茄炒蛋');
    assert.deepEqual(payload.day[1].recipes[0].recipeSnapshot, snapshot);
  }
});

test('day clone merge mode is accepted and sent to the clone RPC', async () => {
  let cloneArgs: Record<string, unknown> | undefined;
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_clone_day') {
        cloneArgs = args;
        return {
          sourceDate: '2026-07-31',
          targetDate: '2026-08-02',
          mode: 'merge',
          sourceCount: 0,
          clonedCount: 0,
          day: []
        } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.day.clone',
    payload: { sourceDate: '2026-07-31', targetDate: '2026-08-02', mode: 'merge' }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  assert.equal(cloneArgs?.p_mode, 'merge');
});

test('add creates an owner-scoped plan item from the server snapshot', async () => {
  let addArgs: Record<string, unknown> | undefined;
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_add_recipe') {
        addArgs = args;
        return { id: args.p_plan_recipe_id, recipeId, source: 'manual', sortOrder: 2, recipeSnapshot: snapshot } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.day.meal.recipes.add',
    payload: {
      date: '2026-07-31',
      mealType: 'lunch',
      recipeId,
      sortOrder: 2,
      recipeSnapshot: { name: '伪造快照' },
      userId: 'forged-user'
    }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  assert.equal(addArgs?.p_owner_id, identity.userId);
  assert.equal(addArgs?.p_recipe_id, recipeId);
  assert.equal(Object.prototype.hasOwnProperty.call(addArgs || {}, 'p_recipe_snapshot'), false);
  if (result.ok) {
    const item = result.data as Record<string, unknown>;
    assert.equal(item.title, snapshot.name);
    assert.deepEqual(item.recipeSnapshot, snapshot);
  }
});

test('a stored snapshot remains readable after the original recipe is deleted', async () => {
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_get_day') {
        return [
          { id: 'breakfast', name: '早餐', recipes: [] },
          {
            id: 'lunch',
            name: '午餐',
            recipes: [{ id: planRecipeId, recipeId: null, source: 'manual', sortOrder: 0, recipeSnapshot: snapshot }]
          },
          { id: 'dinner', name: '晚餐', recipes: [] }
        ] as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent(
    { action: 'plans.day.get', payload: { date: '2026-07-31' } },
    dependenciesWith(rpc)
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    const meals = result.data as Array<{ recipes: Array<Record<string, unknown>> }>;
    assert.equal(meals[1].recipes[0].title, '番茄炒蛋');
    assert.equal(meals[1].recipes[0].recipeId, recipeId);
  }
});

test('remove is owner/date/meal scoped and missing items are displayable errors', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_remove_recipe') return false as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.day.meal.recipes.remove',
    payload: { date: '2026-07-31', mealType: 'dinner', planRecipeId, userId: 'forged-user' }
  }, dependenciesWith(rpc));
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'NOT_FOUND', message: '计划菜谱不存在' }
  });
  assert.equal(calls[1].args.p_owner_id, identity.userId);
  assert.equal(calls[1].args.p_date, '2026-07-31');
  assert.equal(calls[1].args.p_meal_type, 'dinner');
});

test('move persists drag targets using trusted owner scope', async () => {
  let moveArgs: Record<string, unknown> | undefined;
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_move_recipe') {
        moveArgs = args;
        return true as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.items.move',
    payload: {
      planRecipeId,
      targetDate: '2026-08-01',
      targetMealType: 'dinner',
      targetSortOrder: 2,
      userId: 'forged-user'
    }
  }, dependenciesWith(rpc));
  assert.deepEqual(result, { ok: true, data: { moved: true } });
  assert.equal(moveArgs?.p_owner_id, identity.userId);
  assert.equal(moveArgs?.p_target_date, '2026-08-01');
  assert.equal(moveArgs?.p_target_meal_type, 'dinner');
  assert.equal(moveArgs?.p_target_sort_order, 2);
});

test('preferences get uses trusted owner and returns safe defaults when unset', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_preferences_get') return defaultPreferences as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.preferences.get',
    payload: { userId: 'forged-user' }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  assert.equal(calls[1].args.p_owner_id, identity.userId);
  if (result.ok) {
    const preferences = result.data as typeof defaultPreferences;
    assert.equal(preferences.hasBreakfast, true);
    assert.equal(preferences.configured, false);
    assert.deepEqual(preferences.stapleFoods, ['米饭']);
  }
});

test('preferences update validates and upserts owner-scoped settings', async () => {
  let upsertArgs: Record<string, unknown> | undefined;
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_preferences_upsert') {
        upsertArgs = args;
        return {
          hasBreakfast: false,
          breakfastPreference: 'quick',
          lunchPreference: 'lunchbox',
          dinnerPreference: 'family',
          stapleFoods: ['米饭', '面'],
          dislikedIngredients: ['香菜'],
          servings: 3,
          weekdayMaxCookTimeMinutes: 35,
          weekendMaxCookTimeMinutes: 90,
          configured: true,
          updatedAt: '2026-08-05T10:00:00.000Z'
        } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.preferences.update',
    payload: {
      hasBreakfast: false,
      breakfastPreference: ' quick ',
      lunchPreference: 'lunchbox',
      dinnerPreference: 'family',
      stapleFoods: ['米饭', '面', '米饭'],
      dislikedIngredients: ['香菜', ''],
      servings: 3,
      weekdayMaxCookTimeMinutes: 35,
      weekendMaxCookTimeMinutes: 90,
      userId: 'forged-user'
    }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  assert.equal(upsertArgs?.p_owner_id, identity.userId);
  assert.equal(upsertArgs?.p_has_breakfast, false);
  assert.deepEqual(upsertArgs?.p_staple_foods, ['米饭', '面']);
  assert.deepEqual(upsertArgs?.p_disliked_ingredients, ['香菜']);
  if (result.ok) {
    const preferences = result.data as { hasBreakfast: boolean; configured: boolean; updatedAt: string };
    assert.equal(preferences.hasBreakfast, false);
    assert.equal(preferences.configured, true);
    assert.equal(preferences.updatedAt, '2026-08-05T10:00:00.000Z');
  }
});

test('week generation respects saved breakfast preference', async () => {
  let generatedEntries: Array<{ mealType: string }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_plan_preferences_get') return { ...defaultPreferences, hasBreakfast: false, configured: true } as T;
      if (name === 'cook_plan_generation_candidates') {
        return [
          { id: recipeId, name: '燕麦牛奶', durationMinutes: 10, mainIngredients: '燕麦50克、牛奶250ml' },
          { id: '80000000-0000-4000-8000-000000000002', name: '牛肉炒饭', durationMinutes: 20, mainIngredients: '牛肉' }
        ] as T;
      }
      if (name === 'cook_plan_generate_week') {
        generatedEntries = args.p_entries as Array<{ mealType: string }>;
        return { conflict: false } as T;
      }
      if (name === 'cook_plan_get_day') {
        return [
          { id: 'breakfast', name: '早餐', recipes: [] },
          { id: 'lunch', name: '午餐', recipes: [] },
          { id: 'dinner', name: '晚餐', recipes: [] }
        ] as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handlePlanApiEvent({
    action: 'plans.week.generate',
    payload: { weekStartDate: '2026-07-27', overwrite: true }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  assert.equal(generatedEntries.some((entry) => entry.mealType === 'breakfast'), false);
});

test('invalid plan payloads are rejected before plan RPC execution', async () => {
  let planCalls = 0;
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      planCalls += 1;
      return null as T;
    }
  };
  const invalidEvents = [
    { action: 'plans.day.get', payload: { date: '2026-02-30' } },
    { action: 'plans.month.get', payload: { month: '2026-00' } },
    { action: 'plans.month.stats', payload: { month: '2026-02', startDate: '2026-01-31' } },
    { action: 'plans.month.clear', payload: { month: '2026-02' } },
    { action: 'plans.month.clear', payload: { month: '2026-02', startDate: '2026-01-31', confirmToken: 'CONFIRM' } },
    { action: 'plans.month.fillFromWeek', payload: { month: '2026-02', sourceWeekStartDate: '2026-02-03', confirmToken: 'CONFIRM' } },
    { action: 'plans.month.replaceRecipe', payload: { month: '2026-02', fromRecipeId: recipeId, toRecipeId: recipeId, confirmToken: 'CONFIRM' } },
    { action: 'plans.monthTemplates.create', payload: { month: '2026-02', name: '' } },
    { action: 'plans.monthTemplates.apply', payload: { templateId: monthTemplateId, targetMonth: '2026-02' } },
    { action: 'plans.monthTemplates.delete', payload: { templateId: 'bad' } },
    { action: 'plans.day.clone', payload: { sourceDate: '2026-07-31', targetDate: '2026-07-31', mode: 'replace' } },
    { action: 'plans.day.clone', payload: { sourceDate: '2026-07-31', targetDate: '2026-08-01', mode: 'append' } },
    { action: 'plans.day.meal.recipes.add', payload: { date: '2026-07-31', mealType: 'snack', recipeId } },
    { action: 'plans.day.meal.recipes.add', payload: { date: '2026-07-31', mealType: 'lunch', recipeId: 'bad' } },
    { action: 'plans.day.meal.recipes.remove', payload: { date: 'bad', mealType: 'lunch', planRecipeId } },
    { action: 'plans.preferences.update', payload: { hasBreakfast: 'yes' } },
    { action: 'plans.preferences.update', payload: { stapleFoods: [] } },
    { action: 'plans.preferences.update', payload: { servings: 0 } }
  ];
  for (const event of invalidEvents) {
    const result = await handlePlanApiEvent(event, dependenciesWith(rpc));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'INVALID_ARGUMENT');
  }
  assert.equal(planCalls, 0);
});
