'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../utils/page-data-cache.js'), 'utf8');
const storage = {};
let now = 1_000_000;
let currentUser = { id: 'user-a' };
const moduleStub = { exports: {} };

vm.runInNewContext(source, {
  module: moduleStub,
  exports: moduleStub.exports,
  Map,
  JSON,
  String,
  Number,
  Date: { now: () => now },
  encodeURIComponent,
  getApp: () => ({ globalData: { currentUser } }),
  wx: {
    getStorageSync(key) { return storage[key]; },
    setStorageSync(key, value) { storage[key] = value; },
    removeStorageSync(key) { delete storage[key]; }
  }
}, { filename: 'page-data-cache.js' });

const { readPageCache, writePageCache, clearPageCache, DEFAULT_MAX_AGE_MS } = moduleStub.exports;

assert.equal(writePageCache('weekly-plan', '2026-11-02', [{ id: 'monday' }]), true);
const firstRead = readPageCache('weekly-plan', '2026-11-02');
assert.deepEqual(firstRead, [{ id: 'monday' }], 'cache should return saved data for the same user and scope');
firstRead[0].id = 'changed-in-page';
assert.deepEqual(readPageCache('weekly-plan', '2026-11-02'), [{ id: 'monday' }], 'callers must not mutate cached data by reference');

currentUser = { id: 'user-b' };
assert.equal(readPageCache('weekly-plan', '2026-11-02'), null, 'different users must never read each other\'s cached data');

currentUser = { id: 'user-a' };
now += DEFAULT_MAX_AGE_MS + 1;
assert.equal(readPageCache('weekly-plan', '2026-11-02'), null, 'expired cache must not be displayed');

writePageCache('shopping-list', '2026-11-02', [{ id: 'pending' }]);
clearPageCache('shopping-list', '2026-11-02');
assert.equal(readPageCache('shopping-list', '2026-11-02'), null, 'cleared page cache must not be reused');

console.log('page data cache verification passed');
