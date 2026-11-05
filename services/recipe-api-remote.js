'use strict';

const apiConfig = require('../config/recipe-api');
const { handleApiError } = require('./auth-state');
const diagnostics = require('./diagnostics');
const { isLocalRecipeImagePath, isTemporaryRecipeImagePath } = require('../utils/recipe-image');

const DEFAULT_CROP = { width: 64, height: 64, left: 0, top: 0 };
const READ_ACTIONS = new Set(['recipes.list', 'recipes.catalog', 'recipes.detail', 'categories.list']);

function durationLabel(value) {
  return value === undefined || value === null || value === '' ? '' : `${value}分钟`;
}

function caloriesLabel(value) {
  return value === undefined || value === null || value === '' ? '' : `${value}kcal`;
}

function call(action, payload) {
  return wx.cloud.callFunction({
    name: apiConfig.cloudFunctionName,
    data: { action, payload: payload || {} }
  }).then((response) => {
    const result = response && response.result;
    if (!result || result.ok !== true) {
      const error = result && result.error;
      const apiError = new Error((error && error.message) || '菜谱服务暂时不可用');
      apiError.code = (error && error.code) || 'REMOTE_ERROR';
      apiError.requestId = error && error.requestId;
      diagnostics.recordFailure('recipe', action, apiError);
      handleApiError(apiError, { promptLogin: !READ_ACTIONS.has(action) });
      throw apiError;
    }
    diagnostics.recordSuccess('recipe', action, result.data);
    return result.data;
  });
}

function readLocalFileBase64(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: (result) => resolve(result.data),
      fail: reject
    });
  });
}

function detectContentType(filePath) {
  const value = String(filePath || '').toLowerCase();
  if (value.endsWith('.png')) return 'image/png';
  if (value.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function uploadCustomCover(filePath) {
  if (!filePath || !isLocalRecipeImagePath(filePath)) {
    return { storageKey: '', coverUrl: filePath || '' };
  }
  const base64 = await readLocalFileBase64(filePath);
  return call('covers.upload', { base64, contentType: detectContentType(filePath) });
}

function normalizeStep(step, index) {
  const value = step || {};
  return {
    id: String(value.id || `step-${index + 1}`),
    text: String(value.text || ''),
    imageUrl: String(value.imageUrl || '')
  };
}

function prepareStepsForRemote(steps) {
  return (Array.isArray(steps) ? steps : []).map((step, index) => {
    const next = normalizeStep(step, index);
    if (isTemporaryRecipeImagePath(next.imageUrl)) next.imageUrl = '';
    return next;
  }).filter((step) => step.text.trim() || step.imageUrl.trim());
}

function normalizeListRecipe(recipe) {
  const value = recipe || {};
  const coverUrl = value.coverUrl || value.coverImageUrl || value.heroImage || '';
  return {
    id: String(value.id || ''),
    title: String(value.title || value.displayName || value.name || ''),
    coverUrl: String(coverUrl),
    duration: String(value.duration || durationLabel(value.durationMinutes || value.cookTimeMinutes)),
    calories: String(value.calories || caloriesLabel(value.caloriesKcal)),
    crop: value.crop || DEFAULT_CROP
  };
}

function normalizeGroups(groups) {
  const list = Array.isArray(groups) ? groups : groups && Array.isArray(groups.groups) ? groups.groups : [];
  return list.map((group) => ({
    id: String(group && group.id || ''),
    name: String(group && group.name || '未分类'),
    recipeCount: Number(group && group.recipeCount === undefined
      ? (Array.isArray(group && group.recipes) ? group.recipes.length : 0)
      : group.recipeCount || 0),
    hasMore: Boolean(group && group.hasMore),
    nextOffset: group && group.nextOffset !== undefined && group.nextOffset !== null
      ? Number(group.nextOffset)
      : null,
    recipes: (Array.isArray(group && group.recipes) ? group.recipes : []).map(normalizeListRecipe)
  }));
}

function normalizeCategories(categories) {
  const list = Array.isArray(categories)
    ? categories
    : categories && Array.isArray(categories.categories) ? categories.categories : [];
  return list.map((category) => ({
    id: String(category && category.id || ''),
    name: String(category && category.name || '未分类'),
    recipeCount: Number(category && category.recipeCount || 0),
    sortOrder: category && category.sortOrder === undefined ? undefined : Number(category && category.sortOrder)
  }));
}

function normalizeIngredientGroup(group) {
  const value = group || {};
  return {
    group: String(value.group || ''),
    display: String(value.display || ''),
    items: Array.isArray(value.items) ? value.items.map((item) => ({
      name: String(item && item.name || ''),
      amount: String(item && item.amount || '')
    })).filter((item) => item.name) : []
  };
}

function normalizeDetailRecipe(recipe) {
  if (!recipe) return null;
  const value = recipe || {};
  const coverUrl = value.coverUrl || value.heroImage || value.coverImageUrl || '';
  return {
    ...value,
    id: String(value.id || ''),
    category: String(value.category || '未分类'),
    categoryId: String(value.categoryId || ''),
    title: String(value.title || value.displayName || value.name || ''),
    rawName: String(value.rawName || value.name || value.title || ''),
    displayName: String(value.displayName || value.title || value.name || ''),
    coverMode: String(value.coverMode || 'FOLLOW_LIBRARY'),
    customCoverStorageKey: String(value.customCoverStorageKey || ''),
    coverUrl: String(coverUrl),
    heroImage: String(value.heroImage || coverUrl),
    duration: String(value.duration || durationLabel(value.durationMinutes || value.cookTimeMinutes)),
    calories: String(value.calories || caloriesLabel(value.caloriesKcal)),
    durationMinutes: value.durationMinutes === undefined ? null : value.durationMinutes,
    caloriesKcal: value.caloriesKcal === undefined ? null : value.caloriesKcal,
    mainIngredients: String(value.mainIngredients || ''),
    sideIngredients: String(value.sideIngredients || ''),
    seasonings: String(value.seasonings || ''),
    ingredients: (Array.isArray(value.ingredients) ? value.ingredients : []).map(normalizeIngredientGroup)
      .filter((group) => group.group && group.display),
    steps: (Array.isArray(value.steps) ? value.steps : []).map(normalizeStep)
      .filter((step) => step.text.trim() || step.imageUrl.trim())
  };
}

async function prepareForm(form) {
  const next = { ...(form || {}) };
  const coverUrl = String(next.coverUrl || '');
  if (coverUrl && isLocalRecipeImagePath(coverUrl)) {
    let uploaded;
    try {
      uploaded = await uploadCustomCover(coverUrl);
    } catch (error) {
      const uploadError = new Error((error && error.message) || '封面上传失败，请重试或重新选择图片');
      uploadError.code = (error && error.code) || 'COVER_UPLOAD_FAILED';
      throw uploadError;
    }
    next.customCoverStorageKey = uploaded.storageKey;
    next.coverUrl = uploaded.coverUrl;
  } else if (next.coverMode !== 'CUSTOM' || !next.customCoverStorageKey) {
    next.customCoverStorageKey = '';
  }
  next.rawName = String(next.rawName || next.name || next.title || '').trim();
  next.displayName = String(next.displayName || next.name || next.title || '').trim();
  next.steps = prepareStepsForRemote(next.steps);
  return next;
}

// Full catalogue remains available to search, plan selection and source lists.
// The recipe browsing page uses fetchRecipeListPage to avoid loading every card.
function fetchRecipeGroups() { return call('recipes.catalog').then(normalizeGroups); }
function fetchRecipeListPage(options) {
  const value = options || {};
  return call('recipes.list', {
    categoryId: String(value.categoryId || ''),
    offset: Number(value.offset || 0)
  }).then(normalizeGroups);
}
function getRecipeCategories() { return call('categories.list').then(normalizeCategories); }
function fetchRecipeDetail(id) { return call('recipes.detail', { id }).then(normalizeDetailRecipe); }
async function createRecipe(form) { return normalizeDetailRecipe(await call('recipes.create', await prepareForm(form))); }
async function updateRecipe(id, form) { return normalizeDetailRecipe(await call('recipes.update', { ...(await prepareForm(form)), id })); }
function deleteRecipe(id) { return call('recipes.delete', { id }); }
function reorderRecipeCategories(orderedIds) { return call('categories.reorder', { orderedIds }).then(normalizeGroups); }
function renameRecipeCategory(id, name) { return call('categories.rename', { id, name }).then(normalizeGroups); }
function createRecipeCategory(name) { return call('categories.create', { name }).then(normalizeGroups); }
function deleteRecipeCategory(id) { return call('categories.delete', { id }).then(normalizeGroups); }

function recognizeRecipeFromImage() {
  return Promise.reject(new Error('阶段 2 不提供图片识别功能'));
}

module.exports = {
  fetchRecipeGroups,
  fetchRecipeListPage,
  getRecipeCategories,
  reorderRecipeCategories,
  renameRecipeCategory,
  createRecipeCategory,
  deleteRecipeCategory,
  fetchRecipeDetail,
  createRecipe,
  recognizeRecipeFromImage,
  updateRecipe,
  deleteRecipe,
  uploadCustomCover
};
