'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const recipeListItemFile = path.resolve(__dirname, '../utils/recipe-list-item.js');
const recipeListItemModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(recipeListItemFile, 'utf8'), {
  module: recipeListItemModule,
  exports: recipeListItemModule.exports,
  String,
  Array,
  Object
}, { filename: recipeListItemFile });
const recipeListItem = recipeListItemModule.exports;

const pageFile = path.resolve(__dirname, '../pages/shopping-list/index.js');
let pageConfig;
let lastNavigationUrl = '';
let fetchShoppingListCalls = 0;
let fetchRecipeGroupsCalls = 0;
const appState = { globalData: { tabBarHeight: 56 } };
const moduleStub = { exports: {} };

vm.runInNewContext(fs.readFileSync(pageFile, 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  Page: (config) => { pageConfig = config; },
  getApp: () => appState,
  wx: {
    getSystemInfoSync: () => ({ windowWidth: 375 }),
    showToast() {},
    navigateTo(options) { lastNavigationUrl = options.url; }
  },
  require(request) {
    if (request === '../../services/shopping-list-api') return {
      fetchShoppingList: () => {
        fetchShoppingListCalls += 1;
        return Promise.resolve([]);
      }
    };
    if (request === '../../services/recipe-api') return {
      fetchRecipeGroups: () => {
        fetchRecipeGroupsCalls += 1;
        return Promise.resolve([]);
      }
    };
    if (request === '../../utils/page-data-cache') return {
      readPageCache: () => null,
      writePageCache: () => true
    };
    if (request === '../../utils/week-range') return { formatWeekRange: () => '', weekStartForOffset: () => '' };
    if (request === '../../utils/selected-week') return { publishSelectedWeek() {}, readSelectedWeekOffset: () => 0 };
    if (request === '../../utils/top-navigation') return { getTopNavigationLayout: () => ({}) };
    if (request === '../../services/auth-state') return { requireAuthenticated: () => true };
    if (request === '../../utils/recipe-list-item') return recipeListItem;
    return {};
  },
  Set,
  String,
  Array,
  Number,
  Boolean,
  Object,
  JSON,
  Math,
  Promise,
  clearTimeout() {},
  setTimeout() { return 0; }
}, { filename: pageFile });

async function main() {
const loadingPage = {
  ...pageConfig,
  data: { ...pageConfig.data },
  getTabBar() { return null; },
  setData(update) { Object.assign(this.data, update); }
};
loadingPage.initializePage();
await Promise.resolve();
await Promise.resolve();
assert.equal(fetchShoppingListCalls, 1, '菜篮首页首次打开只应读取菜篮');
assert.equal(fetchRecipeGroupsCalls, 0, '菜篮首页首次打开不得读取完整菜谱目录');
loadingPage.onShow();
assert.equal(fetchShoppingListCalls, 1, '返回未发生数据变化的菜篮页不应重复读取');
appState.globalData.shoppingBasketNeedsRefresh = true;
loadingPage.onShow();
await Promise.resolve();
assert.equal(fetchShoppingListCalls, 2, '外部加入菜篮后返回菜篮页必须刷新');

let sourceCatalogRefreshes = 0;
const page = {
  data: {
    groups: [{ items: [{
      id: 'ingredient-1',
      sourceRefs: [
        { planRecipeId: 'plan-1', recipeName: '凉拌黄瓜', cookTimeMinutes: 30, caloriesKcal: 125 },
        { planRecipeId: 'plan-1', recipeName: '凉拌黄瓜', cookTimeMinutes: 30, caloriesKcal: 125 },
        { planRecipeId: 'plan-2', recipeName: '凉拌木耳', duration: '20分钟', calories: '100kcal' }
      ]
    }] }],
    reorderPhase: '',
    sourceSheetVisible: false,
    sourceRecipes: [],
    swipeId: 'ingredient-1',
    swipeOffset: 152
  },
  touchMoved: false,
  ingredientDragActive: false,
  refreshRecipeCatalog() { sourceCatalogRefreshes += 1; return Promise.resolve(); },
  setData(update) { Object.assign(this.data, update); },
  sourceRecipesFromRefs: pageConfig.sourceRecipesFromRefs
};

const recipes = pageConfig.sourceRecipesFromRefs.call(page, page.data.groups[0].items[0].sourceRefs);
assert.equal(recipes.length, 2, 'the source sheet lists each source recipe once');
assert.equal(recipes[0].title, '凉拌黄瓜');
assert.equal(recipes[1].title, '凉拌木耳');
assert.equal(recipes[0].coverUrl, recipeListItem.RECIPE_COVER_PLACEHOLDER);

page.recipeCatalog = [{ id: 'recipe-cucumber', title: '更新后的凉拌黄瓜', coverUrl: '/recipe-cucumber.jpg' }];
const currentRecipeCover = pageConfig.sourceRecipesFromRefs.call(page, [{ recipeId: 'recipe-cucumber', recipeName: '凉拌黄瓜', coverUrl: '/stale-source-cover.jpg' }]);
assert.equal(currentRecipeCover[0].coverUrl, '/recipe-cucumber.jpg', '来源菜谱封面应与菜谱列表当前封面一致');
assert.equal(currentRecipeCover[0].title, '更新后的凉拌黄瓜', '来源菜谱标题应与菜谱列表当前标题一致');
page.data.sourceSheetVisible = true;
page.data.sourceRecipes = recipes;
pageConfig.onSourceRecipeTap.call(page, { currentTarget: { dataset: { recipeId: 'recipe-cucumber' } } });
assert.equal(page.data.sourceSheetVisible, false, '跳转详情前应关闭食材来源浮层');
assert.equal(page.data.sourceRecipes.length, 0, '跳转详情前应清理来源列表');
assert.equal(lastNavigationUrl, '/pages/recipe-detail/index?id=recipe-cucumber', '来源菜品应进入对应详情页');

pageConfig.onShowIngredientSources.call(page, { currentTarget: { dataset: { id: 'ingredient-1' } } });
assert.equal(page.data.sourceSheetVisible, true);
assert.equal(page.data.sourceRecipes.length, 2);
assert.equal(page.data.swipeId, '');
assert.equal(sourceCatalogRefreshes, 1, '仅打开食材来源时才读取菜谱目录');

page.data.groups = [{ items: [{ id: 'ingredient-without-source', sourceRefs: [] }] }];
page.data.sourceSheetVisible = false;
pageConfig.onShowIngredientSources.call(page, { currentTarget: { dataset: { id: 'ingredient-without-source' } } });
assert.equal(page.data.sourceSheetVisible, false, '无菜品来源时不应打开食材来源浮层');
assert.equal(page.data.sourceRecipes.length, 0, '无来源时不应伪造来源菜谱');

pageConfig.onCloseIngredientSources.call(page);
pageConfig.onIngredientSourcesAfterClose.call(page);
assert.equal(page.data.sourceSheetVisible, false);
assert.equal(page.data.sourceRecipes.length, 0);

const markup = fs.readFileSync(path.resolve(__dirname, '../pages/shopping-list/index.wxml'), 'utf8');
const styles = fs.readFileSync(path.resolve(__dirname, '../pages/shopping-list/index.wxss'), 'utf8');
assert.match(markup, /height="calc\(100vh - 184rpx\)"[\s\S]*sourceRecipes/);
assert.match(markup, /data-recipe-id="\{\{sourceRecipe\.recipeId\}\}" bindtap="onSourceRecipeTap"/);
assert.match(markup, /class="ingredient-source-recipe-cover-frame"[\s\S]*class="ingredient-source-recipe-cover"/);
assert.match(markup, /ingredient-source-empty-illustration" src="\/assets\/recipe-list\/empty-recipes\.svg"/);
assert.match(markup, /ingredient-source-empty-title">没有菜谱<\/text>[\s\S]*点击 \+ 按钮即可添加/);
assert.match(markup, /catchtap="onToggleIngredient"/);
assert.doesNotMatch(markup, /class="ingredient-source"/, '菜篮列表不应直接展示食材来源文案');
assert.match(styles, /\.ingredient-source-recipe-cover-frame \{[\s\S]*overflow: hidden;[\s\S]*background: #f2f3f9;/);
assert.match(styles, /\.ingredient-source-recipe-cover \{[\s\S]*width: 100%;[\s\S]*height: 100%;/);
assert.match(styles, /\.ingredient-source-recipe::after \{[\s\S]*bottom: 16rpx;/, '来源项分隔线应位于两项间距中央');

console.log('shopping list page verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
