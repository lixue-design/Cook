'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const filename = path.join(rootDir, 'services/recipe-api-mock.js');
const moduleStub = { exports: {} };

vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  JSON,
  Date,
  Promise,
  setTimeout
}, { filename });

async function main() {
  const api = moduleStub.exports;
  const groups = await api.fetchRecipeGroups();

  assert.equal(groups.length, 5, '应保留五个默认分类');
  assert.ok(groups.every((group) => group.recipes.length === 3), '每个默认分类应有三道测试菜谱');

  const recipes = groups.flatMap((group) => group.recipes.map((recipe) => ({ ...recipe, category: group.name })));
  assert.equal(recipes.length, 15, '应提供十五道测试菜谱');

  await Promise.all(recipes.map(async (recipe) => {
    assert.ok(recipe.id && recipe.title, '列表菜谱必须有 ID 和标题');
    assert.match(recipe.coverUrl, /^\/assets\/recipes\/.+\.jpg$/, '列表菜谱必须有本地封面');
    assert.equal(fs.existsSync(path.join(rootDir, recipe.coverUrl)), true, '列表菜谱封面资源必须存在');
    assert.ok(recipe.mainIngredients, '列表菜谱必须有食材');
    assert.ok(Array.isArray(recipe.steps) && recipe.steps.length >= 3, '列表菜谱必须至少有三步详细做法');

    const detail = await api.fetchRecipeDetail(recipe.id);
    assert.ok(detail, `${recipe.title} 应能打开详情`);
    assert.equal(detail.title, recipe.title, '详情标题必须与列表共用同一菜谱数据');
    assert.equal(detail.heroImage, recipe.coverUrl, '详情封面必须与列表封面一致');
    assert.equal(detail.category, recipe.category, '详情分类必须与列表分类一致');
    assert.ok(detail.ingredients.some((group) => group.items.length > 0), '详情必须提供可加入菜篮的食材');
  }));

  console.log('recipe usability seed verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
