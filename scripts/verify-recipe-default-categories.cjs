'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const filename = path.resolve(__dirname, '../services/recipe-api-mock.js');
const mockModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  module: mockModule,
  exports: mockModule.exports,
  require,
  console,
  JSON,
  Date,
  setTimeout
}, { filename });

assert.deepEqual(
  JSON.parse(JSON.stringify(mockModule.exports.getRecipeCategories().map((category) => category.name))),
  ['爽口凉菜', '家常小炒', '大口吃肉', '一碗鲜汤', '饱腹主食']
);
assert.ok(
  mockModule.exports.getRecipeCategories().every((category) => category.recipeCount === 3),
  'Mock should seed three recipes for every default category'
);

console.log('recipe default category verification passed');
