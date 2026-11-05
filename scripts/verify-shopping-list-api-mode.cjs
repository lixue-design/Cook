'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function load(relativePath, requireFn, processValue = process) {
  const filename = path.join(rootDir, relativePath);
  const moduleStub = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: moduleStub,
    exports: moduleStub.exports,
    require: requireFn,
    process: processValue
  }, { filename });
  return moduleStub.exports;
}

const defaultConfig = load('config/basket-api.js', require);
assert.equal(defaultConfig.mode, 'remote');
assert.equal(defaultConfig.cloudFunctionName, 'cook-recipe-api');

const envConfig = load('config/basket-api.js', require, {
  env: { BASKET_API_MODE: ' Remote ', BASKET_CLOUD_FUNCTION_NAME: ' cook-api ' }
});
assert.equal(envConfig.mode, 'remote');
assert.equal(envConfig.cloudFunctionName, 'cook-api');

function select(config) {
  const mock = { name: 'mock' };
  const remote = { name: 'remote' };
  const selected = load('services/shopping-list-api.js', (id) => {
    if (id === '../config/basket-api') return config;
    if (id === './shopping-list-api-mock') return mock;
    if (id === './shopping-list-api-remote') return remote;
    throw new Error(`unexpected require ${id}`);
  });
  return { selected, mock, remote };
}

const mockSelection = select({ mode: 'mock', cloudFunctionName: '' });
assert.equal(mockSelection.selected, mockSelection.mock);
const remoteSelection = select({ mode: 'remote', cloudFunctionName: 'cook-api' });
assert.equal(remoteSelection.selected, remoteSelection.remote);
assert.throws(() => select({ mode: 'remote', cloudFunctionName: '' }), /cloudFunctionName/);
assert.throws(() => select({ mode: 'local', cloudFunctionName: '' }), /仅支持 mock 或 remote/);

console.log('shopping list API mode verification passed');
