'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/shopping-list-api-mock.js'), 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  Promise,
  Date,
  JSON,
  String,
  Number,
  Boolean,
  Array,
  Object,
  Math,
  Set
});
const api = moduleStub.exports;

const flatten = (groups) => groups.reduce((items, group) => items.concat(group.items), []);

async function main() {
  const weekA = '2026-08-24';
  const weekB = '2026-08-31';
  const weekC = '2026-09-07';
  assert.equal(flatten(await api.fetchShoppingList(weekB)).length, 0, 'Mock should start with an empty basket');
  const first = (await api.createShoppingItem(weekA, { name: '  西红柿， ', category: '其他' }))[0];
  await api.createShoppingItem(weekA, { name: '西红柿', category: '其他' });
  let items = flatten(await api.fetchShoppingList(weekA));
  const isTomato = (item) => api.normalizeIngredientName(item.name) === '西红柿';
  assert.equal(items.filter(isTomato).length, 1, 'normalized duplicate is merged');

  const second = (await api.createShoppingItem(weekA, { name: '鸡蛋', category: '其他' }))[0];
  const batchFirst = (await api.createShoppingItem(weekA, { name: '批量测试甲', category: '其他' }))[0];
  const batchSecond = (await api.createShoppingItem(weekA, { name: '批量测试乙', category: '其他' }))[0];
  assert.notEqual(batchFirst.id, batchSecond.id, 'each batch-created ingredient has its own drag identity');
  const originalPendingIndex = flatten(await api.fetchShoppingList(weekA))
    .filter((item) => !item.checked).sort((a, b) => a.sortOrder - b.sortOrder)
    .findIndex((item) => item.id === first.id);
  await api.toggleShoppingItem(weekA, first.id, true);
  items = flatten(await api.fetchShoppingList(weekA));
  assert.equal(items.filter((item) => item.checked).sort((a, b) => a.sortOrder - b.sortOrder)[0].id, first.id, 'newly completed item moves to the completed list first');
  await api.toggleShoppingItem(weekA, first.id, false);
  items = flatten(await api.fetchShoppingList(weekA)).filter((item) => !item.checked).sort((a, b) => a.sortOrder - b.sortOrder);
  assert.equal(items[originalPendingIndex].id, first.id, 'restored item returns to its previous pending position');
  assert.ok(second.id, 'second item remains independent');

  await api.addRecipeToShoppingList(
    weekA,
    'recipe-1',
    [{ group: '主料', items: [{ name: '西红柿', amount: '2个' }] }],
    { recipeName: '番茄炒蛋', coverUrl: '/cover.jpg' }
  );
  items = flatten(await api.fetchShoppingList(weekA));
  assert.equal(items.filter(isTomato).length, 1, 'recipe origin merges with an existing ingredient');
  assert.equal(items.find(isTomato).sourceRefs.length, 1, 'recipe origin is retained');
  assert.equal(items.find(isTomato).sourceRefs[0].recipeName, '番茄炒蛋', '详情页加入必须记录菜谱名称');

  const weeklyPlan = [{
    id: weekB,
    meals: [{ type: 'lunch', items: [
      { id: 'plan-a', recipeId: 'recipe-a', title: '番茄炒蛋', ingredients: [{ group: '主料', items: [{ name: '番茄', amount: '2个' }, { name: '鸡蛋', amount: '2个' }] }] },
      { id: 'plan-b', recipeId: 'recipe-b', title: '番茄炖蛋', ingredients: [{ group: '主料', items: [{ name: '番茄', amount: '3个' }, { name: '鸡蛋', amount: '100克' }, { name: '盐', amount: '少许' }] }] },
      { id: 'plan-c', recipeId: 'recipe-c', title: '清炒时蔬', ingredients: [{ group: '主料', items: [{ name: '盐', amount: '适量' }] }] }
    ] }]
  }];
  const synced = await api.syncShoppingList(weekB, weeklyPlan);
  const syncedItems = flatten(synced.groups);
  const tomatoes = syncedItems.filter((item) => item.name === '番茄');
  assert.equal(tomatoes.length, 1, '同名同单位的数字用量应合并');
  assert.equal(tomatoes[0].amount, '5个', '同单位的数字用量应相加');
  assert.equal(tomatoes[0].sourceRefs.length, 2, '合并食材保留全部菜品来源');
  assert.equal(syncedItems.filter((item) => item.name === '鸡蛋').length, 2, '单位不同的食材必须分开保留');
  assert.equal(syncedItems.filter((item) => item.name === '盐').length, 2, '不同定性用量的食材分别保留');

  const mergedSalt = api.mergePlanItems([
    { name: '盐', amount: '2', amountText: '2g', unit: 'g', sourceRefs: [{ recipeName: '菜品 1' }] },
    { name: '盐', amount: '3', amountText: '3g', unit: 'g', sourceRefs: [{ recipeName: '菜品 2' }] },
    { name: '盐', amount: '', amountText: '少许', unit: '', sourceRefs: [{ recipeName: '菜品 3' }] },
    { name: '盐', amount: '', amountText: '少许', unit: '', sourceRefs: [{ recipeName: '菜品 4' }] }
  ]);
  assert.equal(mergedSalt.length, 1, '同名食材的重复定性用量应合并到唯一数字单位');
  assert.equal(mergedSalt[0].amountText, '5g+少许');
  assert.equal(mergedSalt[0].sourceRefs.length, 4, '合并后必须保留全部菜品来源');

  await api.addRecipeToShoppingList(
    weekB,
    'recipe-a',
    [{ group: '主料', items: [{ name: '番茄', amount: '2个' }] }],
    { recipeName: '番茄炒蛋', coverUrl: '/tomato.jpg' }
  );
  const crossSourceItems = flatten(await api.fetchShoppingList(weekB)).filter((item) => item.name === '番茄');
  assert.equal(crossSourceItems.length, 1, '详情页与计划页的同食材必须合并为一条');
  assert.equal(crossSourceItems[0].amount, '7个', '跨来源的同单位数字用量必须相加');
  assert.equal(crossSourceItems[0].sourceRefs.length, 3, '跨来源合并必须保留全部来源');
  assert.ok(crossSourceItems[0].sourceRefs.some((ref) => ref.source === 'recipe_detail' && ref.recipeName === '番茄炒蛋'));

  await api.syncShoppingList(weekB, weeklyPlan);
  const afterResyncItems = flatten(await api.fetchShoppingList(weekB)).filter((item) => item.name === '番茄');
  assert.equal(afterResyncItems.length, 1, '重复同步不能拆分已合并食材');
  assert.equal(afterResyncItems[0].amount, '7个', '重复同步不能重复累加已有计划食材');

  await api.toggleShoppingItem(weekA, first.id, true);
  const completedCount = flatten(await api.fetchShoppingList(weekA)).filter((item) => item.checked).length;
  const cleared = await api.clearShoppingItems(weekA, true);
  assert.equal(cleared.deletedCount, completedCount, 'clear purchased removes completed items only');
  assert.ok(flatten(await api.fetchShoppingList(weekA)).some((item) => item.id === second.id));
  assert.equal(flatten(await api.fetchShoppingList(weekC)).length, 0, 'weeks have independent baskets');

  await api.addRecipeToShoppingList(weekC, 'pork-ribs-1', [{ group: '主料', items: [{ name: '排骨', amount: '500g' }] }], { recipeName: '排骨 1' });
  await api.addRecipeToShoppingList(weekC, 'pork-ribs-2', [{ group: '主料', items: [{ name: '排骨', amount: '' }] }], { recipeName: '排骨 2' });
  const porkRibs = flatten(await api.fetchShoppingList(weekC)).filter((item) => item.name === '排骨');
  assert.equal(porkRibs.length, 1, '同名食材的一项无用量时应合并为一条');
  assert.equal(porkRibs[0].amount, '无用量+500g');
  assert.equal(porkRibs[0].sourceRefs.map((ref) => ref.recipeName).join('|'), '排骨 1|排骨 2');

  const weekD = '2026-09-28';
  await api.addRecipeToShoppingList(
    weekD,
    'recipe-from-detail',
    [{ group: '主料', items: [{ name: '旧食材', amount: '1个' }] }],
    { recipeName: '详情页菜谱' }
  );
  await api.clearShoppingItems(weekD, false);
  await api.syncShoppingList(weekD, [{
    id: weekD,
    meals: [{ type: 'lunch', items: [{
      id: 'plan-after-clear',
      recipeId: 'recipe-from-plan',
      title: '计划页菜谱',
      ingredients: [{ group: '主料', items: [{ name: '新食材', amount: '2个' }] }]
    }] }]
  }]);
  const afterClearAndPlanSync = flatten(await api.fetchShoppingList(weekD));
  assert.deepEqual(afterClearAndPlanSync.map((item) => item.name), ['新食材'], '清空后从计划页同步不得恢复已清空的详情页食材');
  console.log('shopping list lifecycle verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
