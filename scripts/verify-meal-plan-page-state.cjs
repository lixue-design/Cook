'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const pageFile = path.join(rootDir, 'pages/meal-plan/index.js');
const pageTemplateFile = path.join(rootDir, 'pages/meal-plan/index.wxml');
let pageConfig;
let resolveWeeklyPlan;
let removePlanRequest;
let fetchDayPlanCalls = 0;
let fetchWeekPlanCalls = 0;
let fetchRecipeGroupsCalls = 0;
const appState = { globalData: {} };
let savedPlanViewMode = '';

function requireStub(request) {
  if (request === '../../services/meal-plan-api') {
    return {
      fetchWeekDates: () => Promise.resolve([{ id: '2026-09-03', today: true }]),
      fetchMealPlans: () => {
        fetchDayPlanCalls += 1;
        return Promise.resolve([]);
      },
      fetchWeeklyPlan: () => {
        fetchWeekPlanCalls += 1;
        return new Promise((resolve) => { resolveWeeklyPlan = resolve; });
      },
      generateWeeklyPlan: () => Promise.resolve({ days: [], warnings: [] }),
      addRecipeToPlan: () => Promise.resolve(),
      addNoteToPlan: () => Promise.resolve(),
      removeRecipeFromPlan: (...args) => {
        removePlanRequest = args;
        return Promise.resolve();
      },
      movePlanRecipe: () => Promise.resolve(),
      clearWeekPlan: () => Promise.resolve(),
      clearDayPlan: () => Promise.resolve()
    };
  }
  if (request === '../../services/recipe-api') return {
    fetchRecipeGroups: () => {
      fetchRecipeGroupsCalls += 1;
      return Promise.resolve([]);
    },
    fetchRecipeDetail: (id) => Promise.resolve(id === 'recipe-current'
      ? { ingredients: [{ group: '主料', items: [{ name: '新食材', amount: '3个' }] }] }
      : null)
  };
  if (request === '../../utils/week-range') return { formatWeekRange: () => '', weekStartForOffset: () => '' };
  if (request === '../../utils/selected-week') return { publishSelectedWeek: () => {}, readSelectedWeekOffset: () => 0 };
  if (request === '../../services/shopping-list-api') return { syncShoppingList: () => Promise.resolve({}) };
  if (request === '../../services/auth-state') return { requireAuthenticated: () => true };
  if (request === '../../utils/top-navigation') return { getTopNavigationLayout: () => ({}) };
  if (request === '../../utils/plan-display-settings') return { readPlanDisplaySettings: () => ({}), getVisibleMeals: () => [] };
  if (request === '../../utils/recipe-list-item') return {
    RECIPE_COVER_PLACEHOLDER: '',
    flattenRecipeGroups: () => [],
    toCurrentRecipeListItem: (item, catalog) => {
      const canonical = (catalog || []).find((recipe) => recipe.id === item.recipeId || recipe.title === item.title);
      return canonical ? { ...item, title: canonical.title, coverUrl: canonical.coverUrl, crop: canonical.crop } : item;
    }
  };
  if (request === '../../utils/page-data-cache') return {
    readPageCache: () => null,
    writePageCache: () => true
  };
  throw new Error(`Unexpected module: ${request}`);
}

vm.runInNewContext(fs.readFileSync(pageFile, 'utf8'), {
  Page: (config) => { pageConfig = config; },
  require: requireStub,
  wx: {
    getSystemInfoSync: () => ({ windowWidth: 375 }),
    showToast: () => {},
    setStorageSync(key, value) { if (key === 'cook.planViewMode') savedPlanViewMode = value; }
  },
  getApp: () => appState,
  Promise,
  JSON,
  Date,
  setTimeout,
  clearTimeout
}, { filename: pageFile });

async function main() {
  const template = fs.readFileSync(pageTemplateFile, 'utf8');
  assert.match(template, /class="recipe-cover" src="\{\{recipe\.coverUrl\}\}" mode="aspectFill"/, '日计划封面必须铺满封面框');
  assert.doesNotMatch(template, /recipe-cover" style="width: \{\{recipe\.crop/, '日计划封面不能使用缩小后的列表裁切尺寸');

  appState.globalData = { planViewMode: 'week', tabBarHeight: 56 };
  const initialPage = {
    ...pageConfig,
    data: { ...pageConfig.data },
    setData(update) { Object.assign(this.data, update); }
  };
  initialPage.initializePage();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchWeekPlanCalls, 1, '默认周计划首次打开只应读取周计划');
  assert.equal(fetchDayPlanCalls, 0, '默认周计划首次打开不得额外读取日计划');
  assert.equal(fetchRecipeGroupsCalls, 0, '默认周计划首次打开不得额外读取完整菜谱目录');
  resolveWeeklyPlan([]);
  await Promise.resolve();
  initialPage.onPlanModeTap({ currentTarget: { dataset: { mode: 'day' } } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(fetchDayPlanCalls, 1, '切换到日计划时才读取当前日期的三餐');

  const page = {
    ...pageConfig,
    data: { ...pageConfig.data, weeklyPlanDays: [{ id: 'kept', meals: [] }] },
    visibleMealTypes: [],
    setData(update) { Object.assign(this.data, update); }
  };

  page.weekOffset = 0;
  page.weekRangeOffset = 0;
  page.data.planMode = 'week';
  page.onPlanModeTap({ currentTarget: { dataset: { mode: 'day' } } });
  assert.equal(page.data.planMode, 'day', '用户切换后应立即展示所选视图');
  assert.equal(appState.globalData.planViewMode, 'day', '用户视图选择应写入全局状态');
  assert.equal(savedPlanViewMode, 'day', '用户视图选择应持久保存');

  page.data.planMode = 'week';
  page.data.selectedDate = '2026-09-03';
  page.onFloatingAddTap();
  assert.equal(page.data.planActionVisible, true, '周计划右下角新增应先打开自动生成或手动安排的选择');
  assert.equal(page.data.planDateVisible, false, '选择页打开时不得同时展示日期与餐次选择');
  page.onPlanActionChooseManual();
  page.onPlanActionAfterClose();
  assert.equal(page.data.planDateVisible, true, '选择手动安排后应打开日期与餐次选择');
  assert.equal(page.data.planDateInitialDate, '2026-09-03', '日期选择应默认当前选中日期');
  assert.equal(page.data.planCreateVisible, false, '打开日期与餐次选择时不得同时展示选菜谱弹窗');

  page.setData({ planDateVisible: false });
  page.onFloatingAddTap();
  let generatedFromActionSheet = false;
  const realGenerateWeekPlan = page.onGenerateWeekPlan;
  page.onGenerateWeekPlan = () => { generatedFromActionSheet = true; };
  page.onPlanActionChooseAI();
  page.onPlanActionAfterClose();
  assert.equal(generatedFromActionSheet, true, '选择自动生成后应进入周计划生成流程');
  assert.match(template, /<plan-action-sheet/, '计划页必须挂载自动生成或手动安排的选择弹窗');
  page.onGenerateWeekPlan = realGenerateWeekPlan;

  page.data.planMode = 'day';
  page.weekOffset = 2;
  page.weekRangeOffset = 0;
  page.onGenerateWeekPlan();
  assert.equal(page.data.planMode, 'week', '生成后应展示周计划结果，而非停留在日计划');
  assert.equal(page.weekRangeOffset, 2, '从日计划生成时应保留当前所处自然周');
  await Promise.resolve();
  await Promise.resolve();
  page.setData({ weeklyPlanDays: [{ id: 'kept', meals: [] }] });
  page.weekRangeOffset = 0;

  const staleLoad = page.loadWeeklyPlan();
  const mutationRequest = page.createWeeklyPlanRequest(0);
  resolveWeeklyPlan([{ id: 'stale', meals: [] }]);
  await staleLoad;
  assert.equal(page.data.weeklyPlanDays[0].id, 'kept', '旧的周计划加载不能覆盖新增或拖拽中的页面数据');

  assert.equal(
    page.applyWeeklyPlanRequest({ id: mutationRequest.id - 1, weekOffset: 0 }, [{ id: 'stale', meals: [] }]),
    false,
    '旧请求返回的数据不应写入页面'
  );
  assert.equal(page.data.weeklyPlanDays[0].id, 'kept');

  assert.equal(
    page.applyWeeklyPlanRequest(mutationRequest, [{ id: 'fresh', meals: [] }]),
    true,
    '当前请求返回的数据应写入页面'
  );
  assert.equal(page.data.weeklyPlanDays[0].id, 'fresh');

  page.data.planMode = 'week';
  page.data.selectedDate = '2026-09-03';
  const addFromWeek = page.persistPlanSelection({
    type: 'recipes',
    date: '2026-09-01',
    meal: 'lunch',
    recipes: [{ id: 'recipe-1', title: '周计划新增菜品' }]
  });
  await Promise.resolve();
  await Promise.resolve();
  resolveWeeklyPlan([{ id: '2026-09-01', meals: [] }]);
  await addFromWeek;
  assert.equal(page.data.selectedDate, '2026-09-01', '周计划新增后，日计划必须选中新增所在日期');
  assert.equal(page.data.dayStatus, 'success', '新增日期的日计划应已回填完成');
  assert.match(fs.readFileSync(pageFile, 'utf8'), /addNoteToPlan\(selection\.date, selection\.meal, note\)/, '随手记必须写入计划数据层，而非只保留在页面内存');

  const refreshedPlanDays = await page.refreshWeeklyPlanIngredients([{
    id: '2026-09-01',
    meals: [{ type: 'lunch', items: [
      { id: 'plan-current', recipeId: 'recipe-current', ingredients: [{ group: '主料', items: [{ name: '旧食材', amount: '1个' }] }] },
      { id: 'plan-note', recipeId: '', ingredients: [{ group: '主料', items: [{ name: '快照食材', amount: '2个' }] }] }
    ] }]
  }]);
  assert.equal(refreshedPlanDays[0].meals[0].items[0].ingredients[0].items[0].name, '新食材', '加入菜篮时必须采用原菜谱的最新食材');
  assert.equal(refreshedPlanDays[0].meals[0].items[1].ingredients[0].items[0].name, '快照食材', '随手记应继续使用自身快照');

  page.visibleMealTypes = ['lunch'];
  page.recipeCatalog = [{ id: 'recipe-current', title: '更新后的菜名', coverUrl: '/updated-cover.jpg' }];
  const currentDisplayPlans = page.hydrateMealPlans([{ id: 'lunch', recipes: [{ id: 'plan-current', recipeId: 'recipe-current', title: '旧菜名', coverUrl: '/old-cover.jpg' }] }]);
  assert.equal(currentDisplayPlans[0].recipes[0].title, '更新后的菜名', '日计划应展示当前菜谱标题');
  assert.equal(currentDisplayPlans[0].recipes[0].coverUrl, '/updated-cover.jpg', '日计划应展示当前菜谱封面');
  const currentDisplayWeek = page.hydrateWeeklyPlan([{ id: '2026-09-01', meals: [{ type: 'lunch', items: [{ id: 'plan-current', recipeId: 'recipe-current', title: '旧菜名', coverUrl: '/old-cover.jpg' }] }] }]);
  assert.equal(currentDisplayWeek[0].meals[0].items[0].title, '更新后的菜名', '周计划应同步当前菜谱标题');

  page.recipeCatalog = [];
  page.onWeekFoodTap({
    currentTarget: { dataset: { id: 'plan-recipe-1', recipeId: 'recipe-1', dayIndex: '0', mealType: 'lunch', foodIndex: '0', title: '有详情菜谱' } }
  });
  assert.equal(page.data.weekFoodActionCanView, true, '计划快照有原菜谱 ID 时，即使列表尚未加载也应可查看详情');
  assert.equal(page.data.weekFoodActionActions[0].value, 'view');
  assert.equal(page.weekFoodActionTarget.recipeId, 'recipe-1');

  page.recipeCatalog = [{ id: 'legacy-recipe', title: '旧计划菜谱' }];
  page.onWeekFoodTap({
    currentTarget: { dataset: { id: 'legacy-plan-recipe', recipeId: '', dayIndex: '0', mealType: 'dinner', foodIndex: '0', title: '旧计划菜谱' } }
  });
  assert.equal(page.weekFoodActionTarget.recipeId, 'legacy-recipe', '旧计划缺少原菜谱 ID 时应按菜名精确匹配');
  assert.equal(page.data.weekFoodActionCanView, true);

  page.data.selectedDate = '2026-09-07';
  page.data.mealPlans = [
    { id: 'breakfast', recipes: [{ id: 'same-recipe', planKey: 'breakfast-0' }] },
    { id: 'lunch', recipes: [] },
    { id: 'dinner', recipes: [{ id: 'same-recipe', planKey: 'dinner-0' }] }
  ];
  page.onDeletePlan({
    currentTarget: { dataset: { id: 'same-recipe', planKey: 'dinner-0', mealIndex: '2', recipeIndex: '0' } }
  });
  await new Promise((resolve) => setTimeout(resolve, 240));
  assert.deepEqual(
    removePlanRequest,
    ['2026-09-07', 'dinner', 'same-recipe'],
    '日计划移除必须使用被点击卡片所在的餐段，不可按同菜谱 ID 查找第一项'
  );

  console.log('meal plan page state verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
