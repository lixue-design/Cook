'use strict';

const remote = require('./recipe-generation-api-remote');

function draftFromText(text) {
  const source = String(text || '').trim();
  const named = source.match(/(?:菜名|标题|名称)\s*[:：]\s*([^\n，。；;]+)/);
  const ingredients = source.match(/(?:食材|材料|主料)\s*[:：]\s*(.+)/);
  const seasonings = source.match(/(?:调料|调味)\s*[:：]\s*(.+)/);
  const duration = source.match(/(?:用时|耗时)\s*[:：]?\s*(\d+)/);
  const title = named ? named[1].trim() : (source.split(/\r?\n/).find(Boolean) || '文字菜谱草稿').slice(0, 40);
  return {
    title,
    name: title,
    category: '',
    duration: duration ? duration[1] : '',
    calories: '',
    coverUrl: '',
    mainIngredients: ingredients ? ingredients[1].trim() : '',
    sideIngredients: '',
    seasonings: seasonings ? seasonings[1].trim() : '',
    steps: [{ id: 'generated-step-1', text: '请确认并补充制作步骤。', imageUrl: '' }],
    sourceType: 'text',
    sourceMeta: { provider: 'rules', sourceType: 'text', inputSummary: source.slice(0, 80) }
  };
}

function createRecipeGenerationJob(sourceType, input, provider = 'rules') {
  if (provider !== 'rules') {
    const error = new Error('AI provider 暂未启用，请使用 rules');
    error.code = 'GENERATION_PROVIDER_UNAVAILABLE';
    return Promise.reject(error);
  }
  const draft = sourceType === 'link'
    ? {
      ...draftFromText(input && (input.text || input.url)),
      title: String(input && input.url || '').split('/').filter(Boolean).pop() || '链接菜谱草稿',
      sourceType: 'link',
      sourceMeta: { provider: 'rules', sourceType: 'link', inputSummary: String(input && input.url || '') }
    }
    : draftFromText(input && input.text);
  return Promise.resolve({
    jobId: `mock-generation-${Date.now()}`,
    status: 'succeeded',
    sourceType,
    provider,
    input: input || {},
    resultDraft: draft,
    warnings: [],
    explanations: [{ code: 'RULES_TEXT_PARSE', message: '已按文本生成菜谱草稿。' }],
    error: null,
    requestId: `mock-request-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  });
}

function fetchRecipeGenerationJob() {
  return Promise.reject(new Error('Mock 不保留生成任务历史'));
}

function cancelRecipeGenerationJob() {
  return Promise.resolve({ status: 'cancelled' });
}

async function generateRecipeDraftFromText(text) {
  const job = await createRecipeGenerationJob('text', { text }, 'rules');
  return {
    job,
    form: remote.mapGenerationDraftToRecipeForm(job.resultDraft)
  };
}

async function generateRecipeDraftFromLink(url, text) {
  const job = await createRecipeGenerationJob('link', { url, text }, 'rules');
  return {
    job,
    form: remote.mapGenerationDraftToRecipeForm(job.resultDraft)
  };
}

async function generateRecipeDraftFromImage(imageFileId, text) {
  const job = await createRecipeGenerationJob('image', { imageFileId, text }, 'rules');
  return {
    job,
    form: remote.mapGenerationDraftToRecipeForm(job.resultDraft)
  };
}

module.exports = {
  createRecipeGenerationJob,
  fetchRecipeGenerationJob,
  cancelRecipeGenerationJob,
  generateRecipeDraftFromText,
  generateRecipeDraftFromLink,
  generateRecipeDraftFromImage,
  normalizeGenerationJob: remote.normalizeGenerationJob,
  mapGenerationDraftToRecipeForm: remote.mapGenerationDraftToRecipeForm
};
