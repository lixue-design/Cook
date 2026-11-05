'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const moduleStub = { exports: {} };
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../utils/default-profile.js'), 'utf8'),
  { module: moduleStub, exports: moduleStub.exports, Math }
);
const profile = moduleStub.exports;

assert.equal(profile.PRESET_AVATAR_URLS.length, 6, 'there must be six preset avatars');
assert.deepEqual(Array.from(profile.PRESET_AVATAR_URLS), [1, 2, 3, 4, 5, 6].map((index) => `/assets/profile/preset-avatar-${index}.png`));
assert.equal(profile.DEFAULT_SUFFIX_ALPHABET.includes('O'), false);
assert.equal(profile.DEFAULT_SUFFIX_ALPHABET.includes('0'), false);
assert.equal(profile.DEFAULT_SUFFIX_ALPHABET.includes('I'), false);
assert.equal(profile.DEFAULT_SUFFIX_ALPHABET.includes('1'), false);
const generated = profile.generateDefaultProfile(() => 0);
assert.equal(generated.nickName, '食光旅人 AAAA');
assert.equal(generated.avatarUrl, '/assets/profile/preset-avatar-1.png');
assert.match(generated.defaultProfileCode, /^[A-HJ-NP-Z2-9]{4}$/);
console.log('default profile verification passed');
