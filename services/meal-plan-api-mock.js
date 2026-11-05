// Mock backend service. Replace this module with real plan APIs when connected.
const week = [
  { id: '2026-07-05', weekday: '一', day: 5 }, { id: '2026-07-06', weekday: '二', day: 6 },
  { id: '2026-07-07', weekday: '三', day: 7 }, { id: '2026-07-08', weekday: '四', day: 8, today: true },
  { id: '2026-07-09', weekday: '五', day: 9 }, { id: '2026-07-10', weekday: '六', day: 10 },
  { id: '2026-07-11', weekday: '日', day: 11 }
];

const plansByDate = {};

const addedPlansByDate = {};
const clearedWeekDates = {};
const monthTemplates = [];
let planPreferences = {
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

function addRecipeToPlan(date, meal, recipe) {
  if (!date || !meal || !recipe) return;
  if (clearedWeekDates[date]) {
    delete clearedWeekDates[date];
    plansByDate[date] = createEmptyDayPlans();
  }
  const targetMeal = ensureDayPlans(date).find((item) => item.id === meal);
  const recipeId = String(recipe.recipeId || recipe.id || '');
  if (!targetMeal || !recipeId || targetMeal.recipes.some((item) => item.recipeId === recipeId)) return;
  targetMeal.recipes.push({
    ...recipe,
    // A plan item must have its own identity: the same recipe can be placed
    // in several meals or days and each instance must be draggable on its own.
    id: `${date}-${meal}-${recipeId}`,
    recipeId,
    source: 'recipe'
  });
}

function addNoteToPlan(date, meal, note) {
  const title = String(note || '').trim();
  if (!date || !meal || !title) return Promise.reject(new Error('随手记不能为空'));
  if (clearedWeekDates[date]) {
    delete clearedWeekDates[date];
    plansByDate[date] = createEmptyDayPlans();
  }
  const targetMeal = ensureDayPlans(date).find((item) => item.id === meal);
  if (!targetMeal) return Promise.reject(new Error('餐段不存在'));
  const planItem = {
    id: `note-${date}-${meal}-${Date.now()}-${targetMeal.recipes.length}`,
    recipeId: '',
    title,
    coverUrl: '',
    duration: '',
    calories: '',
    source: 'custom',
    ingredients: []
  };
  targetMeal.recipes.push(planItem);
  return Promise.resolve(clone(planItem));
}

// Week grid data is deliberately modelled as independent cell arrays.  Each
// `meals` item is one grid cell, so an empty array still renders an empty cell
// and never breaks the table alignment.
const weeklyIngredientsByTitle = {
  '甜玉米': [{ group: '主料', items: [{ name: '玉米', amount: '1根' }] }],
  '水煮蛋': [{ group: '主料', items: [{ name: '鸡蛋', amount: '2个' }] }],
  '牛奶': [{ group: '主料', items: [{ name: '牛奶', amount: '250ml' }] }],
  '小番茄': [{ group: '主料', items: [{ name: '小番茄', amount: '8颗' }] }],
  '小米饭': [{ group: '主料', items: [{ name: '小米', amount: '50克' }, { name: '大米', amount: '100克' }] }],
  '凉拌黄瓜': [{ group: '主料', items: [{ name: '黄瓜', amount: '2根' }] }, { group: '辅料', items: [{ name: '蒜末', amount: '适量' }] }, { group: '调料', items: [{ name: '生抽', amount: '适量' }, { name: '香醋', amount: '适量' }] }],
  '四季豆炒腊肠': [{ group: '主料', items: [{ name: '四季豆', amount: '300克' }, { name: '腊肠', amount: '2根' }] }, { group: '辅料', items: [{ name: '蒜', amount: '适量' }] }],
  '杂粮饭': [{ group: '主料', items: [{ name: '大米', amount: '100克' }, { name: '糙米', amount: '50克' }] }],
  '蜜汁卤鸡排': [{ group: '主料', items: [{ name: '鸡腿肉', amount: '2块' }] }, { group: '调料', items: [{ name: '生抽', amount: '适量' }, { name: '蜂蜜', amount: '适量' }] }],
  '清炒豆芽': [{ group: '主料', items: [{ name: '豆芽', amount: '300克' }] }, { group: '辅料', items: [{ name: '葱', amount: '适量' }, { name: '蒜', amount: '适量' }] }]
};

const makeItems = (prefix, titles) => titles.map((title, index) => ({
  id: `${prefix}-${index + 1}`,
  title,
  ingredients: JSON.parse(JSON.stringify(weeklyIngredientsByTitle[title] || []))
}));
const mealNames = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };

const makeFilledMeals = (prefix, includeTomato = false) => [
  { type: 'breakfast', items: makeItems(`${prefix}-breakfast`, includeTomato ? ['甜玉米', '水煮蛋', '牛奶', '小番茄'] : ['甜玉米', '水煮蛋', '牛奶']) },
  { type: 'lunch', items: makeItems(`${prefix}-lunch`, ['小米饭', '凉拌黄瓜', '四季豆炒腊肠']) },
  { type: 'dinner', items: makeItems(`${prefix}-dinner`, ['杂粮饭', '蜜汁卤鸡排', '清炒豆芽']) }
];

function pad2(value) {
  return value < 10 ? `0${value}` : String(value);
}

function formatDateId(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function mondayForOffset(weekOffset = 0) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + Number(weekOffset || 0) * 7);
  return monday;
}

const weeklyPlan = [];

const mealTypes = ['breakfast', 'lunch', 'dinner'];
const weekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const clone = (value) => JSON.parse(JSON.stringify(value));

function createEmptyDayPlans() {
  return mealTypes.map((id) => ({ id, name: mealNames[id], recipes: [] }));
}

function weekdayIndexForDate(date) {
  const value = new Date(`${date}T12:00:00`);
  return (value.getDay() + 6) % 7;
}

function createSeedDayPlans(date) {
  const template = weeklyPlan[weekdayIndexForDate(date)] || {};
  return mealTypes.map((id) => {
    const meal = (template.meals || []).find((item) => item.type === id) || {};
    return {
      id,
      name: mealNames[id],
      recipes: (meal.items || []).map((item) => ({
        ...clone(item),
        id: `${date}-${id}-${item.id}`,
        recipeId: item.recipeId || item.id,
        source: item.source || 'recipe',
        coverUrl: item.coverUrl || '',
        duration: item.duration || '',
        calories: item.calories || ''
      }))
    };
  });
}

function ensureDayPlans(date) {
  if (clearedWeekDates[date]) return createEmptyDayPlans();
  if (!plansByDate[date]) plansByDate[date] = createSeedDayPlans(date);
  return plansByDate[date];
}

function withEmptySlots(meals) {
  const list = meals.map((meal) => ({ ...meal, items: Array.isArray(meal.items) ? meal.items : [] }));
  const capacity = list.reduce((max, meal) => Math.max(max, meal.items.length), 0);
  list.forEach((meal) => {
    meal.emptySlots = Array.from({ length: Math.max(1, capacity + 1 - meal.items.length) }, (_, index) => ({
      id: `${meal.type}-empty-${meal.items.length + index}`
    }));
  });
  return list;
}

function fetchWeekDates(weekOffset = 0) {
  const start = mondayForOffset(weekOffset);
  const today = formatDateId(new Date());
  const weekday = ['一', '二', '三', '四', '五', '六', '日'];
  const dates = [];
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    dates.push({
      id: formatDateId(date),
      weekday: weekday[index],
      day: date.getDate(),
      today: formatDateId(date) === today
    });
  }
  return new Promise((resolve) => setTimeout(() => resolve(dates), 180));
}
function fetchMealPlans(date) {
  return new Promise((resolve) => setTimeout(() => resolve(clone(ensureDayPlans(date))), 280));
}
function cloneDayPlan(sourceDate, targetDate, mode = 'replace') {
  return fetchMealPlans(sourceDate).then((sourcePlans) => {
    if (mode === 'replace') {
      plansByDate[targetDate] = clone(sourcePlans);
      delete clearedWeekDates[targetDate];
    } else {
      const targetPlans = ensureDayPlans(targetDate);
      sourcePlans.forEach((meal) => {
        const targetMeal = targetPlans.find((item) => item.id === meal.id);
        if (!targetMeal) return;
        (meal.recipes || []).forEach((recipe) => {
          if (targetMeal.recipes.some((item) => item.id === recipe.id)) return;
          targetMeal.recipes.push({
            ...recipe,
            id: `${recipe.id}-clone-${Date.now()}`
          });
        });
      });
    }
    return fetchMealPlans(targetDate).then((day) => ({
      sourceDate,
      targetDate,
      mode,
      sourceCount: sourcePlans.reduce((sum, meal) => sum + (meal.recipes || []).length, 0),
      clonedCount: sourcePlans.reduce((sum, meal) => sum + (meal.recipes || []).length, 0),
      day
    }));
  });
}
function fetchWeeklyPlan(weekOffset = 0) {
  const start = mondayForOffset(weekOffset);
  const today = formatDateId(new Date());
  return Promise.all(Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const id = formatDateId(date);
    return fetchMealPlans(id).then((plans) => ({
      id,
      date: id,
      weekday: weekdayNames[index],
      day: date.getDate(),
      isToday: id === today,
      meals: withEmptySlots(plans.map((meal) => ({
        type: meal.id,
        name: meal.name,
        items: clone(meal.recipes || [])
      })))
    }));
  }));
}
function syncGeneratedWeekToDayPlans(days, overwrite = true) {
  (Array.isArray(days) ? days : []).forEach((day) => {
    const date = day && day.id;
    if (!date) return;
    const generatedMeals = ['breakfast', 'lunch', 'dinner'].map((mealType) => {
      const meal = (Array.isArray(day.meals) ? day.meals : []).find((item) => item.type === mealType) || {};
      return {
        id: mealType,
        name: mealNames[mealType],
        recipes: (Array.isArray(meal.items) ? meal.items : []).map((item) => ({
          id: String(item.id || `${date}-${mealType}-${Date.now()}`),
          recipeId: String(item.recipeId || item.id || ''),
          title: String(item.title || ''),
          coverUrl: String(item.coverUrl || ''),
          duration: String(item.duration || ''),
          calories: String(item.calories || ''),
          source: item.source || 'recipe',
          ingredients: JSON.parse(JSON.stringify(item.ingredients || []))
        })).filter((recipe) => recipe.title)
      };
    });
    if (overwrite || !plansByDate[date]) {
      plansByDate[date] = generatedMeals;
      addedPlansByDate[date] = {};
      delete clearedWeekDates[date];
      return;
    }
    generatedMeals.forEach((generatedMeal) => {
      const targetMeal = plansByDate[date].find((item) => item.id === generatedMeal.id);
      if (!targetMeal) {
        plansByDate[date].push(generatedMeal);
        return;
      }
      generatedMeal.recipes.forEach((recipe) => {
        if (!targetMeal.recipes.some((item) => item.id === recipe.id)) targetMeal.recipes.push(recipe);
      });
    });
  });
}
function fetchMonthPlan(month) {
  const first = new Date(`${month || '2026-07'}-01T00:00:00`);
  const totalDays = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const days = [];
  for (let index = 1; index <= totalDays; index += 1) {
    const date = new Date(first.getFullYear(), first.getMonth(), index);
    const id = formatDateId(date);
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    days.push({
      id,
      date: id,
      day: index,
      weekday: weekdayNames[date.getDay()],
      weekStartDate: formatDateId(monday),
      meals: ['breakfast', 'lunch', 'dinner'].map((type) => ({
        type,
        name: type === 'breakfast' ? '早餐' : type === 'lunch' ? '午餐' : '晚餐',
        items: []
      }))
    });
  }
  return Promise.resolve({ month: month || '2026-07', days, summary: { totalDays, plannedDays: 0 } });
}
function fetchMonthPlanStats(month) {
  return fetchMonthPlan(month).then((result) => ({
    month: result.month,
    startDate: result.days[0] && result.days[0].date || '',
    endDate: result.days[result.days.length - 1] && result.days[result.days.length - 1].date || '',
    totalDays: result.summary.totalDays,
    plannedDays: result.summary.plannedDays,
    totalMealItems: 0,
    uniqueRecipeCount: 0,
    topIngredients: [],
    emptyDates: result.days.map((day) => day.date)
  }));
}
function monthBulkResult(month, type) {
  return fetchMonthPlan(month).then((result) => ({
    operation: { type, mocked: true },
    month: result
  }));
}
function clearMonthPlan(month) {
  return monthBulkResult(month, 'clear');
}
function clearWeekPlan(weekOffset = 0) {
  return fetchWeekDates(weekOffset).then((dates) => {
    dates.forEach((date) => {
      clearedWeekDates[date.id] = true;
      delete addedPlansByDate[date.id];
      delete plansByDate[date.id];
    });
    return { operation: { type: 'clear-week', mocked: true }, affectedDates: dates.length };
  });
}
function clearDayPlan(date) {
  if (!date) return Promise.resolve({ operation: { type: 'clear-day', mocked: true }, affectedDates: 0 });
  clearedWeekDates[date] = true;
  delete addedPlansByDate[date];
  delete plansByDate[date];
  return Promise.resolve({ operation: { type: 'clear-day', mocked: true }, affectedDates: 1 });
}
function fillMonthPlanFromWeek(month) {
  return monthBulkResult(month, 'fillFromWeek');
}
function replaceMonthPlanRecipe(month) {
  return monthBulkResult(month, 'replaceRecipe');
}
function createMonthPlanTemplate(month, name) {
  const template = {
    id: `mock-template-${Date.now()}`,
    name: String(name || '月度模板'),
    sourceMonth: month || '2026-07',
    itemCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  monthTemplates.unshift(template);
  return Promise.resolve({ ...template });
}
function fetchMonthPlanTemplates() {
  return Promise.resolve(monthTemplates.map((template) => ({ ...template })));
}
function applyMonthPlanTemplate(templateId, targetMonth, options = {}) {
  const template = monthTemplates.find((item) => item.id === templateId);
  if (!template) return Promise.reject(new Error('月度模板不存在'));
  return fetchMonthPlan(targetMonth || template.sourceMonth).then((month) => ({
    operation: {
      templateId,
      targetMonth: month.month,
      mode: options.mode || 'replace',
      sourceItemCount: template.itemCount,
      appliedCount: template.itemCount
    },
    month
  }));
}
function deleteMonthPlanTemplate(templateId) {
  const index = monthTemplates.findIndex((item) => item.id === templateId);
  if (index >= 0) monthTemplates.splice(index, 1);
  return Promise.resolve({ deleted: true });
}
function generateWeeklyPlan(weekOffset = 0) {
  return fetchWeeklyPlan(weekOffset).then((days) => {
    syncGeneratedWeekToDayPlans(days, true);
    return { days, warnings: [] };
  });
}
function removeRecipeFromPlan(date, mealType, planRecipeId) {
  const plans = ensureDayPlans(date);
  const meal = plans.find((item) => item.id === mealType);
  if (meal) meal.recipes = meal.recipes.filter((item) => item.id !== planRecipeId);
  return Promise.resolve({ deleted: true });
}
function movePlanRecipe(planRecipeId, targetDate, targetMealType, targetSortOrder) {
  let moved = null;
  Object.keys(plansByDate).some((date) => {
    const plans = plansByDate[date] || [];
    return plans.some((meal) => {
      const index = (meal.recipes || []).findIndex((item) => item.id === planRecipeId);
      if (index < 0) return false;
      moved = meal.recipes.splice(index, 1)[0];
      return true;
    });
  });
  if (!moved) return Promise.resolve({ moved: false });
  const targetMeal = ensureDayPlans(targetDate).find((item) => item.id === targetMealType);
  if (!targetMeal) return Promise.resolve({ moved: false });
  const index = Math.max(0, Math.min(Number(targetSortOrder) || 0, targetMeal.recipes.length));
  targetMeal.recipes.splice(index, 0, moved);
  return Promise.resolve({ moved: true });
}
function fetchPlanPreferences() {
  return Promise.resolve(JSON.parse(JSON.stringify(planPreferences)));
}
function updatePlanPreferences(preferences) {
  planPreferences = {
    ...planPreferences,
    ...(preferences || {}),
    stapleFoods: Array.isArray(preferences && preferences.stapleFoods) ? preferences.stapleFoods : planPreferences.stapleFoods,
    dislikedIngredients: Array.isArray(preferences && preferences.dislikedIngredients)
      ? preferences.dislikedIngredients
      : planPreferences.dislikedIngredients,
    configured: true,
    updatedAt: new Date().toISOString()
  };
  return fetchPlanPreferences();
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
  addNoteToPlan,
  removeRecipeFromPlan,
  movePlanRecipe,
  fetchPlanPreferences,
  updatePlanPreferences
};
