'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function loadDishImageApi(wx) {
  const filename = path.join(rootDir, 'services/dish-image-api.js');
  const moduleStub = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: moduleStub,
    exports: moduleStub.exports,
    wx,
    require(request) {
      if (request === '../config/recipe-api') {
        return { imageLibraryBaseUrl: 'http://127.0.0.1:3000/' };
      }
      return require(request);
    }
  }, { filename });
  return moduleStub.exports;
}

async function main() {
  const calls = [];
  let nextResponse = {
    statusCode: 200,
    data: {
      items: [{
        imageId: 'image-1',
        dishName: '番茄炒蛋',
        imageUrl: '/api/dish-images/image-1'
      }]
    }
  };
  const wx = {
    request(options) {
      calls.push(options);
      options.success(nextResponse);
    }
  };
  const api = loadDishImageApi(wx);

  const images = await api.searchDishImages(' 番茄 ', 2);
  assert.equal(calls[0].url, 'http://127.0.0.1:3000/api/dish-images/search');
  assert.equal(calls[0].data.q, '番茄');
  assert.equal(calls[0].data.limit, 2);
  assert.equal(images[0].imageUrl, 'http://127.0.0.1:3000/api/dish-images/image-1');

  nextResponse = {
    statusCode: 200,
    data: {
      normalizedName: '神秘新菜',
      matched: false,
      provider: 'rules',
      generationJobId: null,
      image: { status: 'pending_ops', source: 'placeholder' }
    }
  };
  const placeholder = await api.requestDishImageGenerationPlaceholder(' 神秘新菜 ');
  assert.equal(calls[1].url, 'http://127.0.0.1:3000/api/dish-images/generate');
  assert.equal(calls[1].method, 'POST');
  assert.equal(calls[1].data.dishName, '神秘新菜');
  assert.equal(calls[1].data.provider, 'rules');
  assert.equal(placeholder.provider, 'rules');
  assert.equal(placeholder.image.status, 'pending_ops');

  nextResponse = { statusCode: 400, data: { error: '菜名不能为空' } };
  await assert.rejects(
    () => api.requestDishImageGenerationPlaceholder('坏菜名'),
    /菜名不能为空/
  );

  console.log('dish image api client verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
