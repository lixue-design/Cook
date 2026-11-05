'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function runCommonJs(relativePath, options = {}) {
  const filename = path.join(rootDir, relativePath);
  const dirname = path.dirname(filename);
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require: options.require || require,
    process: options.process || process,
    console,
    __filename: filename,
    __dirname: dirname
  };

  vm.runInNewContext(
    fs.readFileSync(filename, 'utf8'),
    sandbox,
    { filename }
  );

  return module.exports;
}

function loadConfig(env = {}) {
  return runCommonJs('config/recipe-api.js', {
    process: { env }
  });
}

function loadRecipeApi(config) {
  const mockApi = { name: 'mock-api' };
  const remoteApi = { name: 'remote-api' };
  const exports = runCommonJs('services/recipe-api.js', {
    require(id) {
      if (id === '../config/recipe-api') return config;
      if (id === './recipe-api-mock') return mockApi;
      if (id === './recipe-api-remote') return remoteApi;
      throw new Error(`Unexpected require in recipe-api mode verification: ${id}`);
    }
  });

  return { exports, mockApi, remoteApi };
}

const defaultConfig = loadConfig();
assert.equal(defaultConfig.mode, 'remote');
assert.equal(defaultConfig.cloudFunctionName, 'cook-recipe-api');

const envConfig = loadConfig({
  RECIPE_API_MODE: ' Remote ',
  RECIPE_CLOUD_FUNCTION_NAME: ' cookRecipeApi '
});
assert.equal(envConfig.mode, 'remote');
assert.equal(envConfig.cloudFunctionName, 'cookRecipeApi');

const mockSelection = loadRecipeApi({ mode: 'mock', cloudFunctionName: '' });
assert.equal(mockSelection.exports, mockSelection.mockApi);

const remoteSelection = loadRecipeApi({ mode: 'remote', cloudFunctionName: 'cookRecipeApi' });
assert.equal(remoteSelection.exports, remoteSelection.remoteApi);

assert.throws(
  () => loadRecipeApi({ mode: 'remote', cloudFunctionName: '' }),
  /cloudFunctionName/
);

assert.throws(
  () => loadRecipeApi({ mode: 'local', cloudFunctionName: '' }),
  /仅支持 mock 或 remote/
);

console.log('recipe-api mode verification passed');
