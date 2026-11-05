'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const calls = [];
const source = fs.readFileSync(path.resolve(__dirname, '../services/recipe-image-ocr-ai-api.js'), 'utf8');
const moduleStub = { exports: {} };
vm.runInNewContext(source, {
  module: moduleStub,
  exports: moduleStub.exports,
  wx: {
    cloud: {
      uploadFile(request) {
        calls.push({ type: 'upload', request });
        return Promise.resolve({ fileID: 'cloud://lixue-d8gmn8nqr073b77af.recipe-ocr/test.jpg' });
      },
      callFunction(request) {
        calls.push({ type: 'function', request });
        return Promise.resolve({ result: { ok: true, data: { draft: {
          title: '番茄炒鸡蛋', category: '家常小炒', mainIngredients: '番茄2个、鸡蛋3个', steps: [{ text: '番茄切块。' }]
        } } } });
      }
    }
  },
  Promise,
  Error,
  String,
  Math,
  Date,
  Array,
  require(request) {
    if (request === '../config/cloudbase-env') return { aiEnvId: 'lixue-d8gmn8nqr073b77af', aiTextFunctionName: 'cookRecipeTextAi' };
    if (request === './recipe-text-ai-api') return { mapDraftToForm: (draft) => ({ name: draft.title, category: draft.category, mainIngredients: draft.mainIngredients, steps: draft.steps }) };
    throw new Error(`unexpected require ${request}`);
  }
}, { filename: 'recipe-image-ocr-ai-api.js' });

moduleStub.exports.generateRecipeDraftFromImage('wxfile://tmp/recipe.png').then(({ form }) => {
  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, 'upload');
  assert.equal(calls[0].request.config.env, 'lixue-d8gmn8nqr073b77af');
  assert.match(calls[0].request.cloudPath, /^recipe-ocr\/.+\.png$/);
  assert.equal(calls[1].request.name, 'cookRecipeTextAi');
  assert.equal(calls[1].request.config.env, 'lixue-d8gmn8nqr073b77af');
  assert.equal(calls[1].request.data.imageFileId, 'cloud://lixue-d8gmn8nqr073b77af.recipe-ocr/test.jpg');
  assert.equal(form.name, '番茄炒鸡蛋');
  console.log('recipe image OCR AI client checks passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
