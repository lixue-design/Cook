'use strict';

const MAX_TEXT_LENGTH = 5000;

function asString(value, maximum) {
  return Array.from(String(value == null ? '' : value).trim()).slice(0, maximum).join('');
}

function parseModelJson(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型未返回有效的菜谱数据');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('模型返回的菜谱数据格式不正确');
  }
}

function normalizeSteps(value) {
  if (!Array.isArray(value)) throw new Error('模型未返回制作步骤');
  const steps = value.slice(0, 100).map((item, index) => {
    const raw = item && typeof item === 'object' ? item : { text: item };
    const text = asString(raw.text, 500);
    if (!text) return null;
    return { id: `generated-step-${index + 1}`, text, imageUrl: '' };
  }).filter(Boolean);
  if (!steps.length) throw new Error('模型未返回有效制作步骤');
  return steps;
}

function normalizeRecipeDraft(value, sourceType = 'text') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('模型返回的菜谱数据格式不正确');
  }
  const title = asString(value.title || value.name, 40);
  if (!title) throw new Error('模型未返回菜名');
  const normalizedSourceType = sourceType === 'image' || sourceType === 'link' ? sourceType : 'text';
  return {
    name: title,
    title,
    rawName: title,
    displayName: title,
    category: asString(value.category, 8),
    duration: asString(value.duration, 3).replace(/\D/g, ''),
    calories: asString(value.calories, 4).replace(/\D/g, ''),
    coverUrl: '',
    mainIngredients: asString(value.mainIngredients, 2000),
    sideIngredients: asString(value.sideIngredients, 2000),
    seasonings: asString(value.seasonings, 2000),
    steps: normalizeSteps(value.steps),
    sourceType: normalizedSourceType,
    sourceMeta: {
      provider: 'ai',
      sourceType: normalizedSourceType
    }
  };
}

module.exports = {
  MAX_TEXT_LENGTH,
  parseModelJson,
  normalizeRecipeDraft
};
