'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCommonJs(relativePath, customRequire) {
  const filename = path.resolve(__dirname, '..', relativePath);
  const loadedModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: loadedModule,
    exports: loadedModule.exports,
    require: customRequire || require,
    Date,
    Math,
    String,
    Number
  }, { filename });
  return loadedModule.exports;
}

const weekRange = loadCommonJs('utils/week-range.js');
const { publishSelectedWeek, readSelectedWeekOffset } = loadCommonJs('utils/selected-week.js', (id) => {
  if (id === './week-range') return weekRange;
  throw new Error(`Unexpected require: ${id}`);
});

const globalData = {};
for (const offset of [-3, 0, 4]) {
  const weekStartDate = publishSelectedWeek(globalData, offset);
  assert.match(weekStartDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(readSelectedWeekOffset(globalData, 99), offset);
}
assert.equal(readSelectedWeekOffset({ selectedWeekStartDate: '2026-01-01' }, 7), 7);
assert.equal(readSelectedWeekOffset({ selectedWeekStartDate: '2026-02-31' }, 7), 7);
assert.equal(readSelectedWeekOffset({}, 7), 7);

console.log('selected week verification passed');
