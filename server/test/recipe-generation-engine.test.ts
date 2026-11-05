import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeRecipeGeneration,
  recipeGenerationEngineInternals,
  type RecipeGenerationProviderResult
} from '../src/recipe-generation-engine';

test('rules text provider creates an editable draft with parsed fields', async () => {
  const result = await executeRecipeGeneration({
    sourceType: 'text',
    provider: 'rules',
    input: {
      text: [
        '菜名：番茄炒蛋',
        '食材：番茄2个、鸡蛋3个',
        '调料：盐少许',
        '用时：12分钟',
        '步骤1：番茄切块，鸡蛋打散。',
        '步骤2：先炒鸡蛋，再炒番茄并混合。'
      ].join('\n')
    }
  }, { createRequestId: () => 'request-rules-text' });

  assert.equal(result.ok, true);
  assert.equal(result.requestId, 'request-rules-text');
  if (result.ok) {
    assert.equal(result.data.draft.title, '番茄炒蛋');
    assert.equal(result.data.draft.duration, '12');
    assert.equal(result.data.draft.mainIngredients, '番茄2个、鸡蛋3个');
    assert.equal(result.data.draft.seasonings, '盐少许');
    assert.equal(result.data.draft.steps.length, 2);
    assert.equal(result.data.draft.sourceMeta.provider, 'rules');
  }
});

test('rules link provider validates URL and returns low confidence warning', async () => {
  const result = await executeRecipeGeneration({
    sourceType: 'link',
    provider: 'rules',
    input: { url: 'https://example.com/recipes/tomato-egg' }
  }, { createRequestId: () => 'request-link' });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.draft.title, 'tomato egg');
    assert.ok(result.data.warnings.some((warning) => warning.code === 'LOW_CONFIDENCE'));
  }

  const invalid = await executeRecipeGeneration({
    sourceType: 'link',
    provider: 'rules',
    input: { url: 'file:///tmp/recipe.txt' }
  }, { createRequestId: () => 'request-link-invalid' });
  assert.deepEqual(invalid, {
    ok: false,
    requestId: 'request-link-invalid',
    error: { code: 'INVALID_ARGUMENT', message: '链接必须以 http 或 https 开头' }
  });
});

test('rules image provider requires user supplied description and does not pretend vision recognition', async () => {
  const insufficient = await executeRecipeGeneration({
    sourceType: 'image',
    provider: 'rules',
    input: { imageFileId: 'cloud://temp/recipe.jpg' }
  }, { createRequestId: () => 'request-image-empty' });
  assert.deepEqual(insufficient, {
    ok: false,
    requestId: 'request-image-empty',
    error: { code: 'IMAGE_RULES_INPUT_INSUFFICIENT', message: '图片规则生成需要补充菜名或文字说明' }
  });

  const result = await executeRecipeGeneration({
    sourceType: 'image',
    provider: 'rules',
    input: {
      imageFileId: 'cloud://temp/recipe.jpg',
      text: '菜名：凉拌黄瓜\n食材：黄瓜2根\n步骤：黄瓜拍碎后加调料拌匀。'
    }
  }, { createRequestId: () => 'request-image-text' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.draft.sourceType, 'image');
    assert.ok(result.data.warnings.some((warning) => warning.message.includes('未接视觉识别')));
  }
});

test('ai provider is reserved but unavailable in the first version', async () => {
  const result = await executeRecipeGeneration({
    sourceType: 'text',
    provider: 'ai',
    input: { text: '番茄炒蛋' }
  }, { createRequestId: () => 'request-ai' });

  assert.deepEqual(result, {
    ok: false,
    requestId: 'request-ai',
    error: { code: 'GENERATION_PROVIDER_UNAVAILABLE', message: 'AI provider 暂未启用，请使用 rules' }
  });
});

test('execution timeout is mapped to a stable generation error', async () => {
  const result = await executeRecipeGeneration({
    sourceType: 'text',
    provider: 'rules',
    input: { text: '番茄炒蛋' }
  }, {
    createRequestId: () => 'request-timeout',
    timeoutMs: 5,
    rulesProvider: () => new Promise<RecipeGenerationProviderResult>((resolve) => {
      setTimeout(() => resolve({
        draft: recipeGenerationEngineInternals.draftFromText('番茄炒蛋', 'text', '番茄炒蛋'),
        warnings: [],
        explanations: []
      }), 50);
    })
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: 'request-timeout',
    error: { code: 'GENERATION_TIMEOUT', message: '生成超时，请稍后重试或手动录入' }
  });
});

test('invalid provider output is blocked by schema validation', async () => {
  const result = await executeRecipeGeneration({
    sourceType: 'text',
    provider: 'rules',
    input: { text: '番茄炒蛋' }
  }, {
    createRequestId: () => 'request-invalid-output',
    rulesProvider: async () => ({
      draft: {
        name: '',
        title: '',
        rawName: '',
        displayName: '',
        category: '',
        duration: '',
        calories: '',
        coverUrl: '',
        mainIngredients: '',
        sideIngredients: '',
        seasonings: '',
        steps: [],
        sourceType: 'text',
        sourceMeta: { provider: 'rules', sourceType: 'text', inputSummary: '' }
      },
      warnings: [],
      explanations: []
    })
  });

  assert.deepEqual(result, {
    ok: false,
    requestId: 'request-invalid-output',
    error: { code: 'GENERATION_OUTPUT_INVALID', message: '生成草稿缺少菜名' }
  });
});

test('text input validation returns stable argument errors', async () => {
  const result = await executeRecipeGeneration({
    sourceType: 'text',
    provider: 'rules',
    input: { text: '   ' }
  }, { createRequestId: () => 'request-empty-text' });

  assert.deepEqual(result, {
    ok: false,
    requestId: 'request-empty-text',
    error: { code: 'INVALID_ARGUMENT', message: '文字描述不能为空' }
  });
});
