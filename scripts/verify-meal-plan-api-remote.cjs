'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const calls = [];
let conflict = false;
const dayPayload = [
  { id: 'breakfast', name: '早餐', recipes: [] },
  {
    id: 'lunch',
    name: '午餐',
    recipes: [{
      id: '90000000-0000-4000-8000-000000000001',
      recipeId: '80000000-0000-4000-8000-000000000001',
      source: 'manual',
      title: '番茄炒蛋',
      duration: '12分钟',
      calories: '209kcal',
      recipeSnapshot: {
        originalRecipeId: '80000000-0000-4000-8000-000000000001',
        name: '番茄炒蛋',
        ingredients: [{ group: 'main', display: '番茄2个、鸡蛋3个' }]
      }
    }]
  },
  { id: 'dinner', name: '晚餐', recipes: [] }
];
const weekPayload = {
  weekStartDate: '2026-07-27',
  days: [{
    id: '2026-07-27',
    date: '2026-07-27',
    weekday: '周一',
    day: 27,
    meals: [
      { type: 'breakfast', items: [] },
      { type: 'lunch', items: dayPayload[1].recipes },
      { type: 'dinner', items: [] }
    ]
  }],
  warnings: [{ code: 'INSUFFICIENT_RECIPES', message: '菜谱较少' }]
};
const monthPayload = {
  month: '2026-07',
  days: [{
    id: '2026-07-27',
    date: '2026-07-27',
    day: 27,
    weekday: '周一',
    weekStartDate: '2026-07-27',
    meals: [
      { type: 'breakfast', items: [] },
      { type: 'lunch', items: dayPayload[1].recipes },
      { type: 'dinner', items: [] }
    ]
  }],
  summary: { totalDays: 31, plannedDays: 1 }
};
const monthStatsPayload = {
  month: '2026-07',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  totalDays: 31,
  plannedDays: 1,
  totalMealItems: 1,
  uniqueRecipeCount: 1,
  topIngredients: [{ name: '番茄', count: 1 }, { name: '鸡蛋', count: 1 }],
  emptyDates: ['2026-07-01']
};
const monthTemplatePayload = {
  id: '70000000-0000-4000-8000-000000000001',
  name: '清淡月计划',
  sourceMonth: '2026-07',
  itemCount: 1,
  createdAt: '2026-08-05T10:00:00.000Z',
  updatedAt: '2026-08-05T10:00:00.000Z'
};
const preferencesPayload = {
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
};
const wx = {
  cloud: {
    callFunction({ name, data }) {
      calls.push({ name, data });
      if (data.action === 'plans.week.generate' && conflict) {
        return Promise.resolve({
          result: { ok: false, error: { code: 'CONFLICT', message: '本周已有计划' } }
        });
      }
      const responses = {
        'plans.day.get': dayPayload,
        'plans.day.clone': {
          sourceDate: '2026-07-27',
          targetDate: '2026-07-28',
          mode: 'replace',
          sourceCount: 1,
          clonedCount: 1,
          day: dayPayload
        },
        'plans.month.get': monthPayload,
        'plans.month.stats': monthStatsPayload,
        'plans.month.clear': {
          operation: { type: 'clear', removedCount: 2 },
          month: monthPayload
        },
        'plans.week.clear': weekPayload,
        'plans.month.fillFromWeek': {
          operation: { type: 'fillFromWeek', filledDates: 3 },
          month: monthPayload
        },
        'plans.month.replaceRecipe': {
          operation: { type: 'replaceRecipe', replacedCount: 1 },
          month: monthPayload
        },
        'plans.monthTemplates.create': monthTemplatePayload,
        'plans.monthTemplates.list': [monthTemplatePayload],
        'plans.monthTemplates.apply': {
          operation: { templateId: monthTemplatePayload.id, targetMonth: '2026-08', appliedCount: 1 },
          month: { ...monthPayload, month: '2026-08' }
        },
        'plans.monthTemplates.delete': { deleted: true },
        'plans.week.get': weekPayload,
        'plans.week.generate': weekPayload,
        'plans.day.meal.recipes.add': dayPayload[1].recipes[0],
        'plans.day.meal.recipes.remove': { deleted: true },
        'plans.items.move': { moved: true },
        'plans.preferences.get': preferencesPayload,
        'plans.preferences.update': preferencesPayload
      };
      return Promise.resolve({ result: { ok: true, data: responses[data.action] } });
    }
  }
};

const filename = path.join(rootDir, 'services/meal-plan-api-remote.js');
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  wx,
  Date,
  Promise,
  require(request) {
    if (request === '../config/plan-api') {
      return { mode: 'remote', cloudFunctionName: 'cook-api' };
    }
    if (request === './auth-state') return { handleApiError() {} };
    if (request === './diagnostics') return { recordFailure() {}, recordSuccess() {} };
    throw new Error(`unexpected require ${request}`);
  }
}, { filename });

async function main() {
  const api = moduleStub.exports;
  const meals = await api.fetchMealPlans('2026-07-27');
  assert.equal(meals.map((meal) => meal.id).join(','), 'breakfast,lunch,dinner');
  assert.equal(meals[1].recipes[0].id, '90000000-0000-4000-8000-000000000001');
  assert.equal(meals[1].recipes[0].recipeId, '80000000-0000-4000-8000-000000000001');
  assert.equal(meals[1].recipes[0].source, 'recipe');
  assert.equal(meals[1].recipes[0].ingredients[0].items[0].name, '番茄');

  const week = api.normalizeWeek(weekPayload);
  assert.equal(week.days[0].meals[1].items[0].title, '番茄炒蛋');
  assert.ok(week.days[0].meals[0].emptySlots.length > 0);
  assert.equal(week.warnings[0].code, 'INSUFFICIENT_RECIPES');
  const month = await api.fetchMonthPlan('2026-07');
  assert.equal(month.month, '2026-07');
  assert.equal(month.summary.totalDays, 31);
  assert.equal(month.days[0].meals[1].items[0].title, '番茄炒蛋');
  const monthCall = calls.find((item) => item.data.action === 'plans.month.get');
  assert.equal(monthCall.data.payload.month, '2026-07');
  const monthStats = await api.fetchMonthPlanStats('2026-07', {
    startDate: '2026-07-01',
    endDate: '2026-07-31'
  });
  assert.equal(monthStats.totalMealItems, 1);
  assert.equal(monthStats.uniqueRecipeCount, 1);
  assert.equal(monthStats.topIngredients[0].name, '番茄');
  assert.equal(monthStats.emptyDates[0], '2026-07-01');
  const monthStatsCall = calls.find((item) => item.data.action === 'plans.month.stats');
  assert.equal(monthStatsCall.data.payload.month, '2026-07');
  assert.equal(monthStatsCall.data.payload.startDate, '2026-07-01');

  const cleared = await api.clearMonthPlan('2026-07', {
    startDate: '2026-07-01',
    endDate: '2026-07-07'
  });
  assert.equal(cleared.operation.removedCount, 2);
  assert.equal(cleared.month.summary.plannedDays, 1);
  const fill = await api.fillMonthPlanFromWeek('2026-07', '2026-06-29');
  assert.equal(fill.operation.filledDates, 3);
  const replaced = await api.replaceMonthPlanRecipe(
    '2026-07',
    '80000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000002'
  );
  assert.equal(replaced.operation.replacedCount, 1);
  const clearCall = calls.find((item) => item.data.action === 'plans.month.clear');
  assert.equal(clearCall.data.payload.confirmToken, 'CONFIRM');
  assert.equal(clearCall.data.payload.startDate, '2026-07-01');
  const beforeDayClear = calls.length;
  await api.clearDayPlan('2026-07-27');
  const dayClearCall = calls.slice(beforeDayClear).find((item) => item.data.action === 'plans.month.clear');
  assert.equal(dayClearCall.data.payload.startDate, '2026-07-27');
  assert.equal(dayClearCall.data.payload.endDate, '2026-07-27');
  const beforeWeekClear = calls.length;
  await api.clearWeekPlan(0);
  const weekClearCalls = calls.slice(beforeWeekClear).filter((item) => item.data.action === 'plans.week.clear');
  assert.equal(weekClearCalls.length, 1);
  assert.equal(weekClearCalls[0].data.payload.weekStartDate, api.weekStartForOffset(0));
  const fillCall = calls.find((item) => item.data.action === 'plans.month.fillFromWeek');
  assert.equal(fillCall.data.payload.sourceWeekStartDate, '2026-06-29');
  const replaceCall = calls.find((item) => item.data.action === 'plans.month.replaceRecipe');
  assert.equal(replaceCall.data.payload.toRecipeId, '80000000-0000-4000-8000-000000000002');

  const createdTemplate = await api.createMonthPlanTemplate('2026-07', '清淡月计划');
  assert.equal(createdTemplate.id, monthTemplatePayload.id);
  assert.equal(createdTemplate.itemCount, 1);
  const templates = await api.fetchMonthPlanTemplates();
  assert.equal(templates[0].name, '清淡月计划');
  const appliedTemplate = await api.applyMonthPlanTemplate(monthTemplatePayload.id, '2026-08');
  assert.equal(appliedTemplate.operation.appliedCount, 1);
  assert.equal(appliedTemplate.month.month, '2026-08');
  const deletedTemplate = await api.deleteMonthPlanTemplate(monthTemplatePayload.id);
  assert.equal(deletedTemplate.deleted, true);
  const createTemplateCall = calls.find((item) => item.data.action === 'plans.monthTemplates.create');
  assert.equal(createTemplateCall.data.payload.month, '2026-07');
  assert.equal(createTemplateCall.data.payload.name, '清淡月计划');
  const applyTemplateCall = calls.find((item) => item.data.action === 'plans.monthTemplates.apply');
  assert.equal(applyTemplateCall.data.payload.confirmToken, 'CONFIRM');
  assert.equal(applyTemplateCall.data.payload.mode, 'replace');

  await api.addRecipeToPlan('2026-07-27', 'lunch', {
    id: '80000000-0000-4000-8000-000000000001'
  }, 2);
  await api.removeRecipeFromPlan(
    '2026-07-27',
    'lunch',
    '90000000-0000-4000-8000-000000000001'
  );
  await api.movePlanRecipe(
    '90000000-0000-4000-8000-000000000001',
    '2026-07-28',
    'dinner',
    1
  );
  const cloned = await api.cloneDayPlan('2026-07-27', '2026-07-28', 'replace');
  assert.equal(cloned.clonedCount, 1);
  assert.equal(cloned.day[1].recipes[0].title, '番茄炒蛋');
  const addCall = calls.find((item) => item.data.action === 'plans.day.meal.recipes.add');
  assert.equal(addCall.data.payload.recipeId, '80000000-0000-4000-8000-000000000001');
  assert.equal(addCall.data.payload.sortOrder, 2);
  const moveCall = calls.find((item) => item.data.action === 'plans.items.move');
  assert.equal(moveCall.data.payload.targetMealType, 'dinner');
  assert.equal(moveCall.data.payload.targetSortOrder, 1);
  const cloneCall = calls.find((item) => item.data.action === 'plans.day.clone');
  assert.equal(cloneCall.data.payload.sourceDate, '2026-07-27');
  assert.equal(cloneCall.data.payload.targetDate, '2026-07-28');
  assert.equal(cloneCall.data.payload.mode, 'replace');

  const preferences = await api.fetchPlanPreferences();
  assert.equal(preferences.hasBreakfast, false);
  assert.deepEqual(preferences.stapleFoods, ['米饭', '面']);
  await api.updatePlanPreferences({
    hasBreakfast: false,
    stapleFoods: ['米饭'],
    dislikedIngredients: ['香菜'],
    servings: 2
  });
  const updatePreferencesCall = calls.find((item) => item.data.action === 'plans.preferences.update');
  assert.equal(updatePreferencesCall.data.payload.hasBreakfast, false);
  assert.deepEqual(updatePreferencesCall.data.payload.dislikedIngredients, ['香菜']);

  const generated = await api.generateWeeklyPlan(0, true);
  assert.equal(generated.warnings.length, 1);
  const generateCall = calls.find((item) => item.data.action === 'plans.week.generate');
  assert.equal(generateCall.data.payload.overwrite, true);
  assert.match(generateCall.data.payload.weekStartDate, /^\d{4}-\d{2}-\d{2}$/);

  conflict = true;
  await assert.rejects(
    () => api.generateWeeklyPlan(0, false),
    (error) => error.code === 'CONFLICT' && error.message === '本周已有计划'
  );
  console.log('meal plan remote verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
