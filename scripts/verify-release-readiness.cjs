'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const configs = [
  'config/recipe-api.js',
  'config/plan-api.js',
  'config/basket-api.js',
  'config/auth-api.js'
];

for (const file of configs) {
  const source = read(file);
  assert.match(source, /const configuredMode = 'remote';/, `${file} must use the experience environment API`);
  assert.match(source, /const configuredCloudFunctionName = 'cook-recipe-api';/, `${file} must use the verified experience function`);
}

const migrationDir = path.join(root, 'database/migrations');
for (let version = 1; version <= 20; version += 1) {
  const prefix = String(version).padStart(4, '0');
  const files = fs.readdirSync(migrationDir).filter((name) => name.startsWith(`${prefix}_`));
  assert.equal(files.filter((name) => name.endsWith('.up.sql')).length, 1, `${prefix} up migration`);
  assert.equal(files.filter((name) => name.endsWith('.down.sql')).length, 1, `${prefix} down migration`);
}

const runbook = read('docs/checklists/TASK-RELEASE-001-release-runbook.md');
for (const required of [
  'Blocked / 不允许提审或生产发布',
  'AppSecret',
  'rollback',
  '不得把生产切到 mock',
  'docs/checklists/mvp-acceptance.md',
  'docs/reviews/pr-review-checklist.md',
  'TASK-QA-MVP-001'
]) {
  assert.ok(runbook.includes(required), `release runbook missing: ${required}`);
}

console.log('release documentation verification passed; real release remains blocked by external gates');
