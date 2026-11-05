const DRAFT_VERSION = 1;
const DRAFT_PREFIX = 'recipeDraft:';
const { isTemporaryRecipeImagePath } = require('./recipe-image');

const draftKey = (recipeId) => `${DRAFT_PREFIX}${recipeId || 'new'}`;

const cloneForm = (form) => ({
  name: String(form && form.name || ''),
  category: String(form && form.category || ''),
  duration: String(form && form.duration || ''),
  calories: String(form && form.calories || ''),
  coverUrl: isTemporaryRecipeImagePath(form && form.coverUrl) ? '' : String(form && form.coverUrl || ''),
  mainIngredients: String(form && form.mainIngredients || ''),
  sideIngredients: String(form && form.sideIngredients || ''),
  seasonings: String(form && form.seasonings || ''),
  steps: Array.isArray(form && form.steps)
    ? form.steps.map((step, index) => ({
      id: String(step && step.id || `step-${index + 1}`),
      text: String(step && step.text || ''),
      imageUrl: isTemporaryRecipeImagePath(step && step.imageUrl) ? '' : String(step && step.imageUrl || '')
    }))
    : [{ id: 'step-1', text: '', imageUrl: '' }]
});

const validatePositiveInteger = (value, label, maximum) => {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value);
  if (!/^\d+$/.test(text) || Number(text) <= 0) return `${label}请输入正整数`;
  if (Number(text) > maximum) return `${label}不能超过${maximum}`;
  return '';
};

const validateRecipeForm = (form) => {
  const normalized = cloneForm(form);
  normalized.name = normalized.name.trim();
  normalized.category = normalized.category.trim();
  if (!normalized.name) return { valid: false, message: '请输入菜品名称', form: normalized };
  if (Array.from(normalized.name).length > 12) return { valid: false, message: '菜品名称不能超过12个字', form: normalized };
  if (Array.from(normalized.category).length > 8) return { valid: false, message: '分类名称不能超过8个字符', form: normalized };
  const durationError = validatePositiveInteger(normalized.duration, '耗时', 999);
  if (durationError) return { valid: false, message: durationError, form: normalized };
  const caloriesError = validatePositiveInteger(normalized.calories, '热量', 9999);
  if (caloriesError) return { valid: false, message: caloriesError, form: normalized };
  if (normalized.steps.length > 100) return { valid: false, message: '制作步骤不能超过100条', form: normalized };
  if (normalized.steps.some((step) => Array.from(step.text).length > 500)) {
    return { valid: false, message: '单个制作步骤不能超过500个字符', form: normalized };
  }
  return { valid: true, message: '', form: normalized };
};

const createDraft = (form) => ({
  version: DRAFT_VERSION,
  savedAt: Date.now(),
  form: cloneForm(form)
});

const readDraft = (storage, recipeId) => {
  try {
    const value = storage.getStorageSync(draftKey(recipeId));
    if (!value || value.version !== DRAFT_VERSION || !value.form) return null;
    return cloneForm(value.form);
  } catch (error) {
    return null;
  }
};

const writeDraft = (storage, recipeId, form) => {
  storage.setStorageSync(draftKey(recipeId), createDraft(form));
};

const clearDraft = (storage, recipeId) => {
  storage.removeStorageSync(draftKey(recipeId));
};

module.exports = {
  DRAFT_VERSION,
  draftKey,
  cloneForm,
  validateRecipeForm,
  createDraft,
  readDraft,
  writeDraft,
  clearDraft
};
