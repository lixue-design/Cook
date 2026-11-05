'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const pageFile = path.resolve(__dirname, '../pages/recipe-search/index.js');
let pageConfig;
let catalogGroups = [{ id: 'uncategorized', recipes: [{ id: 'recipe-1', title: '旧菜名', coverUrl: '/old-cover.jpg' }] }];
const app = { globalData: { recipeDataVersion: 0 } };

vm.runInNewContext(fs.readFileSync(pageFile, 'utf8'), {
  Page: (config) => { pageConfig = config; },
  getApp: () => app,
  wx: { getSystemInfoSync: () => ({ statusBarHeight: 44 }), hideKeyboard() {} },
  setTimeout() { return 0; },
  require(request) {
    if (request === '../../services/recipe-api') return { fetchRecipeGroups: () => Promise.resolve(catalogGroups) };
    if (request === '../../services/meal-plan-api') return { addRecipeToPlan() {} };
    if (request === '../../services/auth-state') return { requireAuthenticated: () => true };
    throw new Error(`Unexpected module: ${request}`);
  },
  Promise,
  Number,
  String,
  Array,
  Object
}, { filename: pageFile });

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function main() {
  const page = {
    ...pageConfig,
    data: { ...pageConfig.data },
    setData(update, callback) { Object.assign(this.data, update); if (callback) callback(); }
  };
  page.onLoad({ q: '菜名' });
  await flush();
  assert.equal(page.data.results[0].coverUrl, '/old-cover.jpg');

  catalogGroups = [{ id: 'uncategorized', recipes: [{ id: 'recipe-1', title: '新菜名', coverUrl: '/new-cover.jpg' }] }];
  app.globalData.recipeDataVersion = 1;
  page.onShow();
  await flush();
  assert.equal(page.data.recipes[0].title, '新菜名', '搜索页返回后应读取更新后的菜谱标题');
  assert.equal(page.data.results[0].coverUrl, '/new-cover.jpg', '搜索结果应读取更新后的菜谱封面');

  console.log('recipe search page verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
