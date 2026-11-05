'use strict';

const apiConfig = require('../config/plan-api');
const { handleApiError } = require('./auth-state');
const diagnostics = require('./diagnostics');
const READ_ACTIONS = new Set([
  'plans.day.get',
  'plans.week.get',
  'plans.month.get',
  'plans.month.stats',
  'plans.monthTemplates.list',
  'plans.preferences.get'
]);
const MEAL_NAMES = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
const DEFAULT_PLAN_PREFERENCES = {
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

function call(action, payload) {
  return wx.cloud.callFunction({
    name: apiConfig.cloudFunctionName,
    data: { action, payload: payload || {} }
  }).then((response) => {
    const result = response && response.result;
    if (!result || result.ok !== true) {
      const error = result && result.error;
      const apiError = new Error((error && error.message) || '计划服务暂时不可用');
      apiError.code = (error && error.code) || 'REMOTE_ERROR';
      apiError.requestId = error && error.requestId;
      diagnostics.recordFailure('plan', action, apiError);
      handleApiError(apiError, { promptLogin: !READ_ACTIONS.has(action) });
      throw apiError;
    }
    diagnostics.recordSuccess('plan', action, result.data);
    return result.data;
  });
}

function pad2(value) { return String(value).padStart(2, '0'); }
function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function mondayForOffset(offset) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + Number(offset || 0) * 7);
  return monday;
}
function weekStartForOffset(offset) { return formatDate(mondayForOffset(offset)); }

function fetchWeekDates(weekOffset = 0) {
  const monday = mondayForOffset(weekOffset);
  const today = formatDate(new Date());
  const weekday = ['一', '二', '三', '四', '五', '六', '日'];
  return Promise.resolve(Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const id = formatDate(date);
    return { id, weekday: weekday[index], day: date.getDate(), today: id === today };
  }));
}

function parseIngredientItems(display) {
  return String(display || '').split(/[、,，]/).map((item) => item.trim()).filter(Boolean).map((item) => {
    const matched = item.match(/^(.+?)(适量|少许|\d+(?:\.\d+)?\s*\S*)$/);
    return matched ? { name: matched[1].trim(), amount: matched[2].trim() } : { name: item, amount: '' };
  });
}

function normalizeIngredients(snapshot) {
  return (Array.isArray(snapshot && snapshot.ingredients) ? snapshot.ingredients : []).map((group) => {
    const display = String(group && group.display || '');
    return {
      group: String(group && group.group || ''),
      display,
      items: Array.isArray(group && group.items) ? group.items : parseIngredientItems(display)
    };
  }).filter((group) => group.items.length);
}

function normalizePlanRecipe(recipe) {
  const value = recipe || {};
  const snapshot = value.recipeSnapshot || {};
  const recipeId = String(value.recipeId || snapshot.originalRecipeId || '');
  return {
    ...value,
    id: String(value.id || ''),
    recipeId,
    title: String(value.title || snapshot.name || ''),
    coverUrl: String(value.coverUrl || ''),
    duration: String(value.duration || ''),
    calories: String(value.calories || ''),
    source: recipeId ? 'recipe' : 'custom',
    apiSource: String(value.source || ''),
    ingredients: normalizeIngredients(snapshot)
  };
}

function normalizeDayPlan(meals) {
  const list = Array.isArray(meals) ? meals : [];
  return ['breakfast', 'lunch', 'dinner'].map((mealType) => {
    const meal = list.find((item) => item && item.id === mealType) || {};
    return {
      id: mealType,
      name: String(meal.name || MEAL_NAMES[mealType]),
      recipes: (Array.isArray(meal.recipes) ? meal.recipes : []).map(normalizePlanRecipe)
    };
  });
}

function syncEmptySlots(days) {
  days.forEach((day) => {
    const meals = Array.isArray(day.meals) ? day.meals : [];
    let capacity = 0;
    meals.forEach((meal) => { capacity = Math.max(capacity, meal.items.length); });
    meals.forEach((meal) => {
      meal.emptySlots = Array.from({ length: Math.max(1, capacity + 1 - meal.items.length) }, (_, index) => ({
        id: `${meal.type}-empty-${meal.items.length + index}`
      }));
    });
  });
  return days;
}

function normalizeWeek(response) {
  const value = response || {};
  const days = (Array.isArray(value.days) ? value.days : []).map((day) => ({
    id: String(day.id || day.date || ''),
    date: String(day.date || day.id || ''),
    weekday: String(day.weekday || ''),
    day: Number(day.day || 0),
    isToday: Boolean(day.isToday),
    meals: (Array.isArray(day.meals) ? day.meals : []).map((meal) => ({
      type: String(meal.type || ''),
      name: String(meal.name || MEAL_NAMES[meal.type] || ''),
      items: (Array.isArray(meal.items) ? meal.items : []).map(normalizePlanRecipe)
    }))
  }));
  return { days: syncEmptySlots(days), warnings: Array.isArray(value.warnings) ? value.warnings : [] };
}
function normalizeMonth(response) {
  const value = response || {};
  const days = (Array.isArray(value.days) ? value.days : []).map((day) => ({
    id: String(day.id || day.date || ''),
    date: String(day.date || day.id || ''),
    day: Number(day.day || 0),
    weekday: String(day.weekday || ''),
    weekStartDate: String(day.weekStartDate || ''),
    meals: (Array.isArray(day.meals) ? day.meals : []).map((meal) => ({
      type: String(meal.type || ''),
      name: String(meal.name || MEAL_NAMES[meal.type] || ''),
      items: (Array.isArray(meal.items) ? meal.items : []).map(normalizePlanRecipe)
    }))
  }));
  return {
    month: String(value.month || ''),
    days,
    summary: {
      totalDays: Number(value.summary && value.summary.totalDays || days.length),
      plannedDays: Number(value.summary && value.summary.plannedDays || 0)
    }
  };
}
function normalizeMonthStats(response) {
  const value = response || {};
  return {
    month: String(value.month || ''),
    startDate: String(value.startDate || ''),
    endDate: String(value.endDate || ''),
    totalDays: Number(value.totalDays || 0),
    plannedDays: Number(value.plannedDays || 0),
    totalMealItems: Number(value.totalMealItems || 0),
    uniqueRecipeCount: Number(value.uniqueRecipeCount || 0),
    topIngredients: (Array.isArray(value.topIngredients) ? value.topIngredients : []).map((item) => ({
      name: String(item && item.name || ''),
      count: Number(item && item.count || 0)
    })).filter((item) => item.name),
    emptyDates: (Array.isArray(value.emptyDates) ? value.emptyDates : []).map((date) => String(date || '')).filter(Boolean)
  };
}
function normalizeMonthTemplate(template) {
  const value = template || {};
  return {
    id: String(value.id || ''),
    name: String(value.name || ''),
    sourceMonth: String(value.sourceMonth || ''),
    itemCount: Number(value.itemCount || 0),
    createdAt: value.createdAt || null,
    updatedAt: value.updatedAt || null
  };
}
function normalizeTextList(value, fallback) {
  const list = Array.isArray(value) ? value : fallback;
  return list.map((item) => String(item || '').trim()).filter(Boolean);
}
function normalizePlanPreferences(preferences) {
  const value = preferences || {};
  return {
    hasBreakfast: typeof value.hasBreakfast === 'boolean' ? value.hasBreakfast : DEFAULT_PLAN_PREFERENCES.hasBreakfast,
    breakfastPreference: String(value.breakfastPreference || DEFAULT_PLAN_PREFERENCES.breakfastPreference),
    lunchPreference: String(value.lunchPreference || DEFAULT_PLAN_PREFERENCES.lunchPreference),
    dinnerPreference: String(value.dinnerPreference || DEFAULT_PLAN_PREFERENCES.dinnerPreference),
    stapleFoods: normalizeTextList(value.stapleFoods, DEFAULT_PLAN_PREFERENCES.stapleFoods),
    dislikedIngredients: normalizeTextList(value.dislikedIngredients, DEFAULT_PLAN_PREFERENCES.dislikedIngredients),
    servings: Number(value.servings || DEFAULT_PLAN_PREFERENCES.servings),
    weekdayMaxCookTimeMinutes: Number(value.weekdayMaxCookTimeMinutes || DEFAULT_PLAN_PREFERENCES.weekdayMaxCookTimeMinutes),
    weekendMaxCookTimeMinutes: Number(value.weekendMaxCookTimeMinutes || DEFAULT_PLAN_PREFERENCES.weekendMaxCookTimeMinutes),
    configured: Boolean(value.configured),
    updatedAt: value.updatedAt || null
  };
}

function fetchMealPlans(date) {
  return call('plans.day.get', { date }).then(normalizeDayPlan);
}
function cloneDayPlan(sourceDate, targetDate, mode = 'replace') {
  return call('plans.day.clone', { sourceDate, targetDate, mode }).then((response) => ({
    ...response,
    day: normalizeDayPlan(response && response.day)
  }));
}
function fetchWeeklyPlan(weekOffset = 0) {
  return call('plans.week.get', { weekStartDate: weekStartForOffset(weekOffset) })
    .then((response) => normalizeWeek(response).days);
}
function fetchMonthPlan(month) {
  return call('plans.month.get', { month }).then(normalizeMonth);
}
function fetchMonthPlanStats(month, options = {}) {
  return call('plans.month.stats', {
    month,
    startDate: options.startDate,
    endDate: options.endDate
  }).then(normalizeMonthStats);
}
function clearMonthPlan(month, options = {}) {
  return call('plans.month.clear', {
    month,
    confirmToken: options.confirmToken || 'CONFIRM',
    startDate: options.startDate,
    endDate: options.endDate
  }).then((response) => ({
    operation: response && response.operation,
    month: normalizeMonth(response && response.month)
  }));
}
function clearWeekPlan(weekOffset = 0) {
  return call('plans.week.clear', { weekStartDate: weekStartForOffset(weekOffset) })
    .then((response) => normalizeWeek(response).days);
}
function clearDayPlan(date) {
  const dateId = String(date || '');
  const month = dateId.slice(0, 7);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateId)) return Promise.reject(new Error('清空当天计划缺少有效日期'));
  return clearMonthPlan(month, { startDate: dateId, endDate: dateId, confirmToken: 'CONFIRM' });
}
function fillMonthPlanFromWeek(month, sourceWeekStartDate, options = {}) {
  return call('plans.month.fillFromWeek', {
    month,
    sourceWeekStartDate,
    confirmToken: options.confirmToken || 'CONFIRM',
    startDate: options.startDate,
    endDate: options.endDate
  }).then((response) => ({
    operation: response && response.operation,
    month: normalizeMonth(response && response.month)
  }));
}
function replaceMonthPlanRecipe(month, fromRecipeId, toRecipeId, options = {}) {
  return call('plans.month.replaceRecipe', {
    month,
    fromRecipeId,
    toRecipeId,
    confirmToken: options.confirmToken || 'CONFIRM',
    startDate: options.startDate,
    endDate: options.endDate
  }).then((response) => ({
    operation: response && response.operation,
    month: normalizeMonth(response && response.month)
  }));
}
function createMonthPlanTemplate(month, name) {
  return call('plans.monthTemplates.create', { month, name }).then(normalizeMonthTemplate);
}
function fetchMonthPlanTemplates() {
  return call('plans.monthTemplates.list').then((response) => (
    (Array.isArray(response) ? response : []).map(normalizeMonthTemplate)
  ));
}
function applyMonthPlanTemplate(templateId, targetMonth, options = {}) {
  return call('plans.monthTemplates.apply', {
    templateId,
    targetMonth,
    mode: options.mode || 'replace',
    confirmToken: options.confirmToken || 'CONFIRM'
  }).then((response) => ({
    operation: response && response.operation,
    month: normalizeMonth(response && response.month)
  }));
}
function deleteMonthPlanTemplate(templateId) {
  return call('plans.monthTemplates.delete', { templateId });
}
function generateWeeklyPlan(weekOffset = 0, overwrite = false) {
  return call('plans.week.generate', { weekStartDate: weekStartForOffset(weekOffset), overwrite })
    .then(normalizeWeek);
}
function addRecipeToPlan(date, mealType, recipe, sortOrder) {
  return call('plans.day.meal.recipes.add', {
    date,
    mealType,
    recipeId: recipe && (recipe.recipeId || recipe.id),
    sortOrder
  }).then(normalizePlanRecipe);
}
function removeRecipeFromPlan(date, mealType, planRecipeId) {
  return call('plans.day.meal.recipes.remove', { date, mealType, planRecipeId });
}
function movePlanRecipe(planRecipeId, targetDate, targetMealType, targetSortOrder) {
  return call('plans.items.move', { planRecipeId, targetDate, targetMealType, targetSortOrder });
}
function fetchPlanPreferences() {
  return call('plans.preferences.get').then(normalizePlanPreferences);
}
function updatePlanPreferences(preferences) {
  return call('plans.preferences.update', normalizePlanPreferences(preferences)).then(normalizePlanPreferences);
}

module.exports = {
  fetchWeekDates,
  fetchMealPlans,
  cloneDayPlan,
  fetchWeeklyPlan,
  fetchMonthPlan,
  fetchMonthPlanStats,
  clearMonthPlan,
  clearWeekPlan,
  clearDayPlan,
  fillMonthPlanFromWeek,
  replaceMonthPlanRecipe,
  createMonthPlanTemplate,
  fetchMonthPlanTemplates,
  applyMonthPlanTemplate,
  deleteMonthPlanTemplate,
  generateWeeklyPlan,
  addRecipeToPlan,
  removeRecipeFromPlan,
  movePlanRecipe,
  fetchPlanPreferences,
  updatePlanPreferences,
  normalizeDayPlan,
  normalizeWeek,
  normalizeMonth,
  normalizeMonthStats,
  normalizeMonthTemplate,
  normalizePlanRecipe,
  normalizePlanPreferences,
  weekStartForOffset
};
