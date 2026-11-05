'use strict';

const apiConfig = require('../config/recipe-api');
const { handleApiError } = require('./auth-state');
const diagnostics = require('./diagnostics');

function call(action, payload) {
  return wx.cloud.callFunction({
    name: apiConfig.cloudFunctionName,
    data: { action, payload: payload || {} }
  }).then((response) => {
    const result = response && response.result;
    if (!result || result.ok !== true) {
      const error = result && result.error;
      const apiError = new Error((error && error.message) || '生成服务暂时不可用');
      apiError.code = (error && error.code) || 'REMOTE_ERROR';
      apiError.requestId = (result && result.requestId) || (error && error.requestId);
      diagnostics.recordFailure('recipe-generation', action, apiError);
      handleApiError(apiError, { promptLogin: false });
      throw apiError;
    }
    diagnostics.recordSuccess('recipe-generation', action, result.data);
    return result.data;
  });
}

function normalizeStep(step, index) {
  const value = step || {};
  return {
    id: String(value.id || `generated-step-${index + 1}`),
    text: String(value.text || ''),
    imageUrl: String(value.imageUrl || '')
  };
}

function normalizeWarning(warning) {
  const value = warning || {};
  return {
    code: String(value.code || ''),
    message: String(value.message || '')
  };
}

function normalizeGenerationJob(job) {
  const value = job || {};
  const error = value.error || null;
  return {
    jobId: String(value.jobId || value.id || ''),
    status: String(value.status || ''),
    sourceType: String(value.sourceType || ''),
    provider: String(value.provider || ''),
    input: value.input || {},
    resultDraft: value.resultDraft || null,
    warnings: (Array.isArray(value.warnings) ? value.warnings : []).map(normalizeWarning).filter((item) => item.code),
    explanations: (Array.isArray(value.explanations) ? value.explanations : []).map(normalizeWarning).filter((item) => item.code),
    error: error ? { code: String(error.code || ''), message: String(error.message || '') } : null,
    requestId: String(value.requestId || ''),
    createdAt: String(value.createdAt || ''),
    updatedAt: String(value.updatedAt || ''),
    completedAt: value.completedAt || null
  };
}

function mapGenerationDraftToRecipeForm(draft) {
  const value = draft || {};
  const title = String(value.title || value.name || value.displayName || '');
  const steps = (Array.isArray(value.steps) ? value.steps : []).map(normalizeStep)
    .filter((step) => step.text.trim() || step.imageUrl.trim());
  return {
    name: title,
    category: String(value.category || ''),
    duration: String(value.duration || ''),
    calories: String(value.calories || ''),
    coverUrl: String(value.coverUrl || ''),
    mainIngredients: String(value.mainIngredients || ''),
    sideIngredients: String(value.sideIngredients || ''),
    seasonings: String(value.seasonings || ''),
    steps: steps.length ? steps : [{ id: 'generated-step-1', text: '', imageUrl: '' }]
  };
}

function createRecipeGenerationJob(sourceType, input, provider = 'rules') {
  return call('generation.recipeJobs.create', { sourceType, provider, input: input || {} })
    .then(normalizeGenerationJob);
}

function fetchRecipeGenerationJob(jobId) {
  return call('generation.recipeJobs.get', { jobId }).then(normalizeGenerationJob);
}

function cancelRecipeGenerationJob(jobId) {
  return call('generation.recipeJobs.cancel', { jobId }).then(normalizeGenerationJob);
}

async function generateRecipeDraftFromText(text) {
  const job = await createRecipeGenerationJob('text', { text }, 'rules');
  if (job.status !== 'succeeded' || !job.resultDraft) {
    const error = new Error((job.error && job.error.message) || '生成失败，请手动录入');
    error.code = (job.error && job.error.code) || 'GENERATION_FAILED';
    error.job = job;
    throw error;
  }
  return {
    job,
    form: mapGenerationDraftToRecipeForm(job.resultDraft)
  };
}

async function generateRecipeDraftFromLink(url, text) {
  const input = { url };
  if (text) input.text = text;
  const job = await createRecipeGenerationJob('link', input, 'rules');
  if (job.status !== 'succeeded' || !job.resultDraft) {
    const error = new Error((job.error && job.error.message) || '链接生成失败，请手动录入');
    error.code = (job.error && job.error.code) || 'GENERATION_FAILED';
    error.job = job;
    throw error;
  }
  return {
    job,
    form: mapGenerationDraftToRecipeForm(job.resultDraft)
  };
}

async function generateRecipeDraftFromImage(imageFileId, text) {
  const job = await createRecipeGenerationJob('image', { imageFileId, text }, 'rules');
  if (job.status !== 'succeeded' || !job.resultDraft) {
    const error = new Error((job.error && job.error.message) || '图片生成失败，请手动录入');
    error.code = (job.error && job.error.code) || 'GENERATION_FAILED';
    error.job = job;
    throw error;
  }
  return {
    job,
    form: mapGenerationDraftToRecipeForm(job.resultDraft)
  };
}

module.exports = {
  createRecipeGenerationJob,
  fetchRecipeGenerationJob,
  cancelRecipeGenerationJob,
  generateRecipeDraftFromText,
  generateRecipeDraftFromLink,
  generateRecipeDraftFromImage,
  normalizeGenerationJob,
  mapGenerationDraftToRecipeForm
};
