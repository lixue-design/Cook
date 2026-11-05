'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const calls = [];
const source = fs.readFileSync(path.resolve(__dirname, '../services/recipe-text-ai-api.js'), 'utf8');
const moduleStub = { exports: {} };
vm.runInNewContext(source, {
  module: moduleStub,
  exports: moduleStub.exports,
  wx: {
    cloud: {
      callFunction(request) {
        calls.push(request);
        return Promise.resolve({
          result: {
            ok: true,
            data: {
              draft: {
                title: '番茄炒蛋',
                duration: '12',
                mainIngredients: '番茄2个、鸡蛋3个',
                seasonings: '盐少许',
                steps: [{ id: 'step-1', text: '番茄切块，鸡蛋打散。' }]
              }
            }
          }
        });
      }
    }
  },
  Promise,
  Error,
  String,
  Array,
  require(request) {
    if (request === '../config/cloudbase-env') {
      return { aiEnvId: 'lixue-d8gmn8nqr073b77af', aiTextFunctionName: 'cookRecipeTextAi' };
    }
    throw new Error(`unexpected require ${request}`);
  }
}, { filename: 'recipe-text-ai-api.js' });

moduleStub.exports.generateRecipeDraftFromText('菜名：番茄炒蛋').then(({ form }) => {
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'cookRecipeTextAi');
  assert.equal(calls[0].config.env, 'lixue-d8gmn8nqr073b77af');
  assert.equal(calls[0].data.text, '菜名：番茄炒蛋');
  assert.equal(form.name, '番茄炒蛋');
  assert.equal(form.steps[0].text, '番茄切块，鸡蛋打散。');
  return moduleStub.exports.generateRecipeDraftFromLink('https://www.xiaohongshu.com/explore/test');
}).then(() => {
  assert.equal(calls.length, 2);
  assert.equal(calls[1].data.sourceUrl, 'https://www.xiaohongshu.com/explore/test');
  assert.equal(Object.hasOwn(calls[1].data, 'text'), false);
  console.log('recipe text AI client checks passed');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
