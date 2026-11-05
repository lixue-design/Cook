'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const calls = [];
const persistedItems = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    name: '番茄',
    category: '主料',
    amount: '5',
    amountText: '5个',
    unit: '个',
    checked: false,
    source: 'plan',
    sourceRefs: [{
      planRecipeId: 'plan-recipe-1',
      recipeName: '番茄炒蛋',
      cookTimeMinutes: 20,
      caloriesKcal: 260
    }],
    sortOrder: 0
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    name: '盐',
    category: '调料',
    amount: '',
    amountText: '少许',
    checked: true,
    source: 'manual',
    sortOrder: 1
  }
];
const wx = {
  cloud: {
    callFunction({ name, data }) {
      calls.push({ name, data });
      const responses = {
        'baskets.week.get': { weekStartDate: '2026-07-27', items: persistedItems },
        'baskets.week.syncFromPlan': {
          weekStartDate: '2026-07-27',
          items: persistedItems,
          warnings: [{ code: 'PLAN_EMPTY', message: '本周暂无计划' }]
        },
        'baskets.week.syncSelected': {
          weekStartDate: '2026-07-27',
          items: persistedItems,
          warnings: [{ code: 'PLAN_ITEM_NOT_FOUND', message: '部分计划项不存在' }]
        },
        'baskets.week.addRecipe': { weekStartDate: '2026-07-27', items: persistedItems, added: true },
        'baskets.items.update': [persistedItems[0]],
        'baskets.items.toggle': [persistedItems[0]],
        'baskets.items.create': [persistedItems[1]],
        'baskets.items.delete': { deleted: true },
        'baskets.items.clear': { deletedCount: 1 }
      };
      return Promise.resolve({ result: { ok: true, data: responses[data.action] } });
    }
  }
};

const filename = path.join(rootDir, 'services/shopping-list-api-remote.js');
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  wx,
  Promise,
  require(request) {
    if (request === '../config/basket-api') {
      return { mode: 'remote', cloudFunctionName: 'cook-api' };
    }
    if (request === './auth-state') return { handleApiError() {} };
    if (request === './diagnostics') return { recordFailure() {}, recordSuccess() {} };
    throw new Error(`unexpected require ${request}`);
  }
}, { filename });

async function main() {
  const api = moduleStub.exports;
  const groups = await api.fetchShoppingList('2026-07-27');
  assert.equal(groups.length, 4);
  assert.equal(groups[0].items[0].amount, '5个');
  assert.equal(groups[0].items[0].sourceRefs[0].recipeName, '番茄炒蛋');
  assert.equal(groups[2].items[0].amount, '少许');
  assert.equal(groups[2].items[0].source, 'manual');

  const synced = await api.syncShoppingList('2026-07-27');
  assert.equal(synced.groups.length, 4);
  assert.equal(synced.warnings[0].code, 'PLAN_EMPTY');
  const selectedSynced = await api.syncSelectedShoppingList('2026-07-27', [
    '90000000-0000-4000-8000-000000000001'
  ]);
  assert.equal(selectedSynced.groups.length, 4);
  assert.equal(selectedSynced.warnings[0].code, 'PLAN_ITEM_NOT_FOUND');
  await api.addRecipeToShoppingList(
    '2026-07-27',
    '80000000-0000-4000-8000-000000000001',
    [{ name: '伪造客户端食材' }]
  );
  await api.updateShoppingItem('2026-07-27', persistedItems[0].id, { checked: true });
  await api.toggleShoppingItem('2026-07-27', persistedItems[0].id, true);
  await api.createShoppingItem('2026-07-27', { name: '葱', category: '辅料' });
  await api.deleteShoppingItem('2026-07-27', persistedItems[0].id);
  await api.clearShoppingItems('2026-07-27', true);

  const syncCall = calls.find((item) => item.data.action === 'baskets.week.syncFromPlan');
  assert.equal(syncCall.data.payload.mode, 'replace_plan_items');
  const selectedSyncCall = calls.find((item) => item.data.action === 'baskets.week.syncSelected');
  assert.equal(selectedSyncCall.data.payload.mode, 'replace_selected_plan_items');
  assert.deepEqual(selectedSyncCall.data.payload.planRecipeIds, [
    '90000000-0000-4000-8000-000000000001'
  ]);
  const updateCall = calls.find((item) => item.data.action === 'baskets.items.update');
  assert.equal(updateCall.data.payload.checked, true);
  assert.equal(updateCall.data.payload.weekStartDate, '2026-07-27');
  const toggleCall = calls.find((item) => item.data.action === 'baskets.items.toggle');
  assert.equal(toggleCall.data.payload.checked, true);
  const clearCall = calls.find((item) => item.data.action === 'baskets.items.clear');
  assert.equal(clearCall.data.payload.completedOnly, true);
  const addRecipeCall = calls.find((item) => item.data.action === 'baskets.week.addRecipe');
  assert.deepEqual(Object.keys(addRecipeCall.data.payload).sort(), ['recipeId', 'weekStartDate']);
  assert.ok(calls.every((item) => item.name === 'cook-api'));

  const failureWx = {
    cloud: {
      callFunction() {
        return Promise.resolve({
          result: { ok: false, error: { code: 'UNAUTHENTICATED', message: '请先登录' } }
        });
      }
    }
  };
  const failedModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: failedModule,
    exports: failedModule.exports,
    wx: failureWx,
    Promise,
    require(request) {
      if (request === '../config/basket-api') return { mode: 'remote', cloudFunctionName: 'cook-api' };
      if (request === './auth-state') return { handleApiError() {} };
      if (request === './diagnostics') return { recordFailure() {}, recordSuccess() {} };
      throw new Error(`unexpected require ${request}`);
    }
  }, { filename });
  await assert.rejects(
    () => failedModule.exports.fetchShoppingList('2026-07-27'),
    (error) => error.code === 'UNAUTHENTICATED' && error.message === '请先登录'
  );

  console.log('shopping list remote verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
