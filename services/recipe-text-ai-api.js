'use strict';

const cloudbaseEnv = require('../config/cloudbase-env');

function asString(value) {
  return String(value == null ? '' : value);
}

function mapDraftToForm(draft) {
  const value = draft || {};
  const steps = (Array.isArray(value.steps) ? value.steps : []).map((step, index) => ({
    id: asString(step && step.id || `generated-step-${index + 1}`),
    text: asString(step && step.text),
    imageUrl: ''
  })).filter((step) => step.text.trim());
  return {
    name: asString(value.name || value.title),
    category: asString(value.category),
    duration: asString(value.duration),
    calories: asString(value.calories),
    coverUrl: '',
    mainIngredients: asString(value.mainIngredients),
    sideIngredients: asString(value.sideIngredients),
    seasonings: asString(value.seasonings),
    steps: steps.length ? steps : [{ id: 'generated-step-1', text: '', imageUrl: '' }]
  };
}

async function generateRecipeDraftFromText(text) {
  return generateRecipeDraft({ text: asString(text) });
}

async function generateRecipeDraftFromLink(sourceUrl) {
  return generateRecipeDraft({ sourceUrl: asString(sourceUrl) });
}

async function generateRecipeDraft(data) {
  const response = await wx.cloud.callFunction({
    name: cloudbaseEnv.aiTextFunctionName,
    config: { env: cloudbaseEnv.aiEnvId },
    data
  });
  const result = response && response.result;
  if (!result || result.ok !== true || !result.data || !result.data.draft) {
    const error = new Error(result && result.error && result.error.message || 'AI 生成失败，请稍后重试');
    error.code = result && result.error && result.error.code || 'GENERATION_FAILED';
    throw error;
  }
  return { form: mapDraftToForm(result.data.draft) };
}

module.exports = { generateRecipeDraftFromText, generateRecipeDraftFromLink, mapDraftToForm };
