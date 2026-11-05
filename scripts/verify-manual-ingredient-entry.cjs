'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../utils/manual-ingredient-entry.js'), 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  String,
  RegExp,
  Array,
  Object
});
const { parseManualIngredientEntry, parseManualIngredientEntries } = moduleStub.exports;
const plain = (value) => JSON.parse(JSON.stringify(value));

assert.deepEqual(plain(parseManualIngredientEntry('西红柿 2 个')), {
  name: '西红柿', amount: '2', amountText: '2个', unit: '个'
});
assert.deepEqual(plain(parseManualIngredientEntry('排骨500g')), {
  name: '排骨', amount: '500', amountText: '500g', unit: 'g'
});
assert.deepEqual(plain(parseManualIngredientEntry('香菜')), {
  name: '香菜', amount: '', amountText: '', unit: ''
});
assert.deepEqual(plain(parseManualIngredientEntries('西红柿 2 个，鸡蛋3个')), [
  { name: '西红柿', amount: '2', amountText: '2个', unit: '个' },
  { name: '鸡蛋', amount: '3', amountText: '3个', unit: '个' }
]);

console.log('manual ingredient entry verification passed');
