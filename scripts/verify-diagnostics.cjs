'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const storage = {};
const warnings = [];
const filename = path.resolve(__dirname, '../services/diagnostics.js');
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  require,
  Date,
  wx: {
    getStorageSync(key) { return storage[key]; },
    setStorageSync(key, value) { storage[key] = value; }
  },
  console: { warn(...args) { warnings.push(args); } }
}, { filename });

const diagnostics = moduleStub.exports;
diagnostics.recordFailure('recipe', 'recipes.create', {
  code: 'INVALID_ARGUMENT',
  message: 'private@example.com token=secret',
  requestId: 'request-1'
});
diagnostics.recordSuccess('plan', 'plans.week.generate', {
  warnings: [{ code: 'INSUFFICIENT_RECIPES', message: '私人菜谱名称' }]
});
for (let index = 0; index < 25; index += 1) {
  diagnostics.recordFailure('basket', 'baskets.week.syncFromPlan', {
    code: 'REMOTE_ERROR',
    message: `private-${index}`
  });
}
const entries = diagnostics.listDiagnostics();
assert.equal(entries.length, 20);
assert.equal(entries.at(-1).code, 'REMOTE_ERROR');
const serialized = JSON.stringify({ entries, warnings });
assert.doesNotMatch(serialized, /private@example|token=secret|私人菜谱|private-/);
assert.ok(entries.every((entry) => !Object.hasOwn(entry, 'message') && !Object.hasOwn(entry, 'payload')));

console.log('diagnostics verification passed');
