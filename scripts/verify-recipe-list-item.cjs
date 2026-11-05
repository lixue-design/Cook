'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const filename = path.resolve(__dirname, '../utils/recipe-list-item.js');
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  String,
  Array,
  Object
}, { filename });
const { RECIPE_COVER_PLACEHOLDER, toRecipeListItem, toCurrentRecipeListItem, flattenRecipeGroups, toRecipeCatalogGroups } = moduleStub.exports;

const fallback = toRecipeListItem({ recipeId: 'recipe-1', recipeName: '凉拌黄瓜' });
assert.equal(fallback.id, 'recipe-1');
assert.equal(fallback.title, '凉拌黄瓜');
assert.equal(fallback.coverUrl, RECIPE_COVER_PLACEHOLDER);

const recipes = flattenRecipeGroups([{ recipes: [{ id: 'recipe-2', title: '凉拌木耳', coverUrl: '/assets/recipes/fungus.jpg' }] }]);
assert.equal(recipes.length, 1);
assert.equal(recipes[0].title, '凉拌木耳');
assert.equal(recipes[0].coverUrl, '/assets/recipes/fungus.jpg');

const currentRecipe = toCurrentRecipeListItem(
  { id: 'plan-1', recipeId: 'recipe-2', title: '旧菜名', coverUrl: '/old-cover.jpg' },
  recipes
);
assert.equal(currentRecipe.id, 'plan-1', '计划项必须保留自身标识');
assert.equal(currentRecipe.title, '凉拌木耳', '关联菜谱存在时应使用当前标题');
assert.equal(currentRecipe.coverUrl, '/assets/recipes/fungus.jpg', '关联菜谱存在时应使用当前封面');

const catalogGroups = toRecipeCatalogGroups([
  { id: 'empty', recipes: [] },
  { id: 'available', recipes: [{ id: 'recipe-3', title: '番茄炒蛋' }] }
]);
assert.deepEqual(catalogGroups.map((group) => group.id), ['available']);

console.log('recipe list item verification passed');
