'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pageFile = path.resolve(__dirname, '../pages/recipe-list/index.js');
let pageConfig;
const requests = [];
const cacheWrites = [];

const firstPage = Array.from({ length: 20 }, (_, index) => ({ id: `recipe-${index + 1}`, title: `菜谱${index + 1}` }));
const secondPage = [{ id: 'recipe-21', title: '菜谱21' }];

vm.runInNewContext(fs.readFileSync(pageFile, 'utf8'), {
  Page: (config) => { pageConfig = config; },
  getApp: () => ({ globalData: { tabBarHeight: 56 } }),
  wx: {
    getSystemInfoSync: () => ({ windowWidth: 375 }),
    showToast() {},
    navigateTo() {},
    hideKeyboard() {}
  },
  require(request) {
    if (request === '../../services/recipe-api') return {
      fetchRecipeListPage(options) {
        const value = options || {};
        requests.push(value);
        if (!value.categoryId) {
          return Promise.resolve([{
            id: 'home', name: '家常菜', recipes: firstPage,
            recipeCount: 21, hasMore: true, nextOffset: 20
          }]);
        }
        assert.equal(value.categoryId, 'home');
        assert.equal(value.offset, 20);
        return Promise.resolve([{
          id: 'home', name: '家常菜', recipes: secondPage,
          recipeCount: 21, hasMore: false, nextOffset: null
        }]);
      },
      reorderRecipeCategories() { return Promise.resolve([]); },
      renameRecipeCategory() { return Promise.resolve([]); },
      createRecipeCategory() { return Promise.resolve([]); },
      deleteRecipeCategory() { return Promise.resolve([]); }
    };
    if (request === '../../services/recipe-text-ai-api') return { generateRecipeDraftFromLink() {} };
    if (request === '../../services/recipe-image-ocr-ai-api') return { generateRecipeDraftFromImage() {} };
    if (request === '../../services/meal-plan-api') return { addRecipeToPlan() {} };
    if (request === '../../services/auth-state') return { requireAuthenticated: () => true };
    if (request === '../../utils/top-navigation') return { getTopNavigationLayout: () => ({}) };
    if (request === '../../utils/recipe-list-item') return { toRecipeCatalogGroups: (groups) => groups.filter((group) => group.recipes.length) };
    if (request === '../../utils/page-data-cache') return {
      readPageCache: () => null,
      writePageCache(type, scope, value) { cacheWrites.push({ type, scope, value }); return true; }
    };
    throw new Error(`Unexpected require: ${request}`);
  },
  Set,
  String,
  Array,
  Number,
  Boolean,
  Object,
  Math,
  Promise,
  clearTimeout() {},
  setTimeout() { return 0; }
}, { filename: pageFile });

function setAtPath(target, pathValue, value) {
  const tokens = String(pathValue).match(/[^.\[\]]+/g) || [];
  let cursor = target;
  while (tokens.length > 1) cursor = cursor[tokens.shift()];
  cursor[tokens[0]] = value;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function main() {
  const page = {
    ...pageConfig,
    data: JSON.parse(JSON.stringify(pageConfig.data)),
    measureSections() {},
    setData(update, callback) {
      Object.entries(update).forEach(([key, value]) => {
        if (key.includes('[') || key.includes('.')) setAtPath(this.data, key, value);
        else this.data[key] = value;
      });
      if (callback) callback();
    }
  };

  page.loadRecipes();
  await flush();
  assert.deepEqual(requests, [{}], '列表首屏只请求一页数据');
  assert.equal(page.data.groups[0].recipes.length, 20);
  assert.equal(page.data.groups[0].hasMore, true);
  assert.equal(cacheWrites[0].type, 'recipe-list-pages');
  assert.equal(cacheWrites[0].scope, 'initial');
  assert.equal(cacheWrites[0].value[0].recipes.length, 20, '缓存只保存首屏页，不能回退成全量目录缓存');

  page.onRecipeCatalogLoadMore({ detail: { id: 'home' } });
  page.onRecipeCatalogLoadMore({ detail: { id: 'home' } });
  await flush();
  assert.equal(requests.length, 2, '同一分类翻页请求进行中不得重复发起');
  assert.equal(page.data.groups[0].recipes.length, 21, '下一页菜谱应追加到当前分类');
  assert.equal(page.data.groups[0].hasMore, false);
  assert.equal(page.data.groups[0].loadingMore, false);

  const pageMarkup = fs.readFileSync(path.resolve(__dirname, '../pages/recipe-list/index.wxml'), 'utf8');
  const componentSource = fs.readFileSync(path.resolve(__dirname, '../components/recipe-catalog/index.js'), 'utf8');
  assert.match(pageMarkup, /bindloadmore="onRecipeCatalogLoadMore"/);
  assert.match(componentSource, /triggerEvent\('loadmore', \{ id: group\.id, offset: group\.nextOffset \}\)/);
  console.log('recipe list pagination verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
