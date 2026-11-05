'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const calls = [];
const jobPayload = {
  jobId: '90000000-0000-4000-8000-000000000001',
  status: 'succeeded',
  sourceType: 'text',
  provider: 'rules',
  input: { text: '番茄炒蛋' },
  resultDraft: {
    title: '番茄炒蛋',
    duration: '12',
    calories: '209',
    mainIngredients: '番茄2个、鸡蛋3个',
    sideIngredients: '',
    seasonings: '盐少许',
    steps: [{ id: 'generated-step-1', text: '炒熟。', imageUrl: '' }],
    sourceMeta: { provider: 'rules', sourceType: 'text', inputSummary: '番茄炒蛋' }
  },
  warnings: [{ code: 'LOW_CONFIDENCE', message: '请确认' }],
  explanations: [{ code: 'RULES_TEXT_PARSE', message: '已解析' }],
  error: null,
  requestId: 'request-1',
  createdAt: '2026-08-05T10:00:00.000Z',
  updatedAt: '2026-08-05T10:00:01.000Z',
  completedAt: '2026-08-05T10:00:01.000Z'
};
let rejectNext = false;
const wx = {
  cloud: {
    callFunction({ name, data }) {
      calls.push({ name, data });
      if (rejectNext) {
        rejectNext = false;
        return Promise.resolve({
          result: {
            ok: false,
            error: { code: 'IMAGE_RULES_INPUT_INSUFFICIENT', message: '需要补充说明' },
            requestId: 'request-failed'
          }
        });
      }
      return Promise.resolve({ result: { ok: true, data: jobPayload } });
    }
  }
};

const filename = path.join(rootDir, 'services/recipe-generation-api-remote.js');
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  wx,
  Promise,
  require(request) {
    if (request === '../config/recipe-api') {
      return { mode: 'remote', cloudFunctionName: 'cook-api' };
    }
    if (request === './auth-state') return { handleApiError() {} };
    if (request === './diagnostics') return { recordFailure() {}, recordSuccess() {} };
    throw new Error(`unexpected require ${request}`);
  }
}, { filename });

async function main() {
  const api = moduleStub.exports;
  const job = await api.createRecipeGenerationJob('text', { text: '番茄炒蛋' }, 'rules');
  assert.equal(job.jobId, '90000000-0000-4000-8000-000000000001');
  assert.equal(job.warnings[0].code, 'LOW_CONFIDENCE');
  const createCall = calls.find((item) => item.data.action === 'generation.recipeJobs.create');
  assert.equal(createCall.name, 'cook-api');
  assert.equal(createCall.data.payload.sourceType, 'text');
  assert.equal(createCall.data.payload.provider, 'rules');

  const form = api.mapGenerationDraftToRecipeForm(job.resultDraft);
  assert.equal(form.name, '番茄炒蛋');
  assert.equal(form.duration, '12');
  assert.equal(form.mainIngredients, '番茄2个、鸡蛋3个');
  assert.equal(form.steps[0].text, '炒熟。');

  const generated = await api.generateRecipeDraftFromText('菜名：番茄炒蛋');
  assert.equal(generated.form.name, '番茄炒蛋');
  const textCall = calls.filter((item) => item.data.action === 'generation.recipeJobs.create').at(-1);
  assert.equal(textCall.data.payload.input.text, '菜名：番茄炒蛋');

  const linkGenerated = await api.generateRecipeDraftFromLink('https://example.com/recipes/tomato-egg');
  assert.equal(linkGenerated.form.name, '番茄炒蛋');
  const linkCall = calls.filter((item) => item.data.action === 'generation.recipeJobs.create').at(-1);
  assert.equal(linkCall.data.payload.sourceType, 'link');
  assert.equal(linkCall.data.payload.input.url, 'https://example.com/recipes/tomato-egg');

  const imageGenerated = await api.generateRecipeDraftFromImage('wxfile://tmp/recipe.jpg', '菜名：番茄炒蛋');
  assert.equal(imageGenerated.form.name, '番茄炒蛋');
  const imageCall = calls.filter((item) => item.data.action === 'generation.recipeJobs.create').at(-1);
  assert.equal(imageCall.data.payload.sourceType, 'image');
  assert.equal(imageCall.data.payload.input.imageFileId, 'wxfile://tmp/recipe.jpg');
  assert.equal(imageCall.data.payload.input.text, '菜名：番茄炒蛋');

  await api.fetchRecipeGenerationJob('90000000-0000-4000-8000-000000000001');
  await api.cancelRecipeGenerationJob('90000000-0000-4000-8000-000000000001');
  assert.ok(calls.some((item) => item.data.action === 'generation.recipeJobs.get'));
  assert.ok(calls.some((item) => item.data.action === 'generation.recipeJobs.cancel'));

  rejectNext = true;
  await assert.rejects(
    () => api.createRecipeGenerationJob('image', { imageFileId: 'cloud://temp/recipe.jpg' }),
    (error) => error.code === 'IMAGE_RULES_INPUT_INSUFFICIENT' && error.requestId === 'request-failed'
  );

  console.log('recipe generation client verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
