'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const filename = path.resolve(__dirname, '../utils/recipe-draft.js');
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  require(id) {
    if (id === './recipe-image') {
      return {
        isTemporaryRecipeImagePath(value) {
          return /^wxfile:\/\/tmp/i.test(String(value || ''));
        }
      };
    }
    throw new Error(`Unexpected require in recipe draft verification: ${id}`);
  }
}, { filename });

const {
  draftKey,
  validateRecipeForm,
  readDraft,
  writeDraft,
  clearDraft
} = moduleStub.exports;

const values = new Map();
const storage = {
  getStorageSync(key) { return values.get(key); },
  setStorageSync(key, value) { values.set(key, value); },
  removeStorageSync(key) { values.delete(key); }
};

assert.equal(draftKey(), 'recipeDraft:new');
assert.equal(draftKey('recipe-1'), 'recipeDraft:recipe-1');
assert.equal(validateRecipeForm({ name: '' }).message, '请输入菜品名称');
assert.equal(validateRecipeForm({ name: '汤', duration: '0' }).message, '耗时请输入正整数');
assert.equal(validateRecipeForm({ name: '汤', duration: '1000' }).message, '耗时不能超过999');
assert.equal(validateRecipeForm({ name: '汤', calories: '1.5' }).message, '热量请输入正整数');
assert.equal(validateRecipeForm({ name: '汤', calories: '10000' }).message, '热量不能超过9999');
assert.equal(validateRecipeForm({ name: '汤', category: '一二三四五六七八九' }).valid, false);
assert.equal(validateRecipeForm({ name: '菜'.repeat(13) }).message, '菜品名称不能超过12个字');
assert.equal(validateRecipeForm({ name: '汤', steps: [{ text: '步'.repeat(501) }] }).valid, false);
assert.equal(validateRecipeForm({ name: ' 汤 ', duration: '20', calories: '100' }).valid, true);

writeDraft(storage, null, { name: '新建草稿', coverUrl: 'wxfile://tmp/temporary.jpg' });
writeDraft(storage, 'recipe-1', { name: '编辑草稿' });
assert.equal(readDraft(storage, null).name, '新建草稿');
assert.equal(readDraft(storage, null).coverUrl, '');
assert.equal(
  validateRecipeForm({ name: '汤', coverUrl: 'wxfile://store_recipe-cover.jpg' }).form.coverUrl,
  'wxfile://store_recipe-cover.jpg',
  '持久化封面不能在保存前被当作临时文件清空'
);
assert.equal(readDraft(storage, 'recipe-1').name, '编辑草稿');
assert.notEqual(readDraft(storage, null).name, readDraft(storage, 'recipe-1').name);
clearDraft(storage, 'recipe-1');
assert.equal(readDraft(storage, 'recipe-1'), null);
assert.equal(readDraft(storage, null).name, '新建草稿');

console.log('recipe draft verification passed');
