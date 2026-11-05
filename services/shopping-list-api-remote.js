'use strict';

const apiConfig = require('../config/basket-api');
const { handleApiError } = require('./auth-state');
const diagnostics = require('./diagnostics');
const categories = ['主料', '辅料', '调料', '其他'];

function call(action, payload) {
  return wx.cloud.callFunction({
    name: apiConfig.cloudFunctionName,
    data: { action, payload: payload || {} }
  }).then((response) => {
    const result = response && response.result;
    if (!result || result.ok !== true) {
      const error = result && result.error;
      const apiError = new Error((error && error.message) || '菜篮服务暂时不可用');
      apiError.code = (error && error.code) || 'REMOTE_ERROR';
      apiError.requestId = error && error.requestId;
      diagnostics.recordFailure('basket', action, apiError);
      handleApiError(apiError, { promptLogin: action !== 'baskets.week.get' });
      throw apiError;
    }
    diagnostics.recordSuccess('basket', action, result.data);
    return result.data;
  });
}

function displayAmount(item) {
  const amountText = String(item && item.amountText || '').trim();
  if (amountText) return amountText;
  const amount = String(item && item.amount || '').trim();
  const unit = String(item && item.unit || '').trim();
  return `${amount}${unit}`;
}

function normalize(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: String(item && item.id || ''),
    name: String(item && item.name || ''),
    amount: displayAmount(item),
    checked: Boolean(item && item.checked),
    source: String(item && item.source || 'manual'),
    sourceRefs: Array.isArray(item && item.sourceRefs) ? item.sourceRefs : [],
    category: categories.indexOf(item && item.category) >= 0 ? item.category : '其他',
    sortOrder: Number(item && item.sortOrder || index)
  }));
}

function groupItems(items) {
  return categories.map((name, index) => ({
    id: name,
    name,
    showDivider: index < categories.length - 1,
    items: items.filter((item) => item.category === name)
  }));
}

function normalizeBasket(response) {
  const value = response || {};
  const items = Array.isArray(value.items)
    ? value.items
    : (Array.isArray(value.groups)
      ? value.groups.reduce((all, group) => all.concat(group.items || []), [])
      : []);
  return groupItems(normalize(items));
}

function fetchShoppingList(weekStartDate) {
  return call('baskets.week.get', { weekStartDate }).then(normalizeBasket);
}
function syncShoppingList(weekStartDate) {
  return call('baskets.week.syncFromPlan', {
    weekStartDate,
    mode: 'replace_plan_items'
  }).then((response) => ({
    groups: normalizeBasket(response),
    warnings: Array.isArray(response && response.warnings) ? response.warnings : []
  }));
}
function syncSelectedShoppingList(weekStartDate, planRecipeIds) {
  return call('baskets.week.syncSelected', {
    weekStartDate,
    mode: 'replace_selected_plan_items',
    planRecipeIds
  }).then((response) => ({
    groups: normalizeBasket(response),
    warnings: Array.isArray(response && response.warnings) ? response.warnings : []
  }));
}
function addRecipeToShoppingList(weekStartDate, recipeId) {
  return call('baskets.week.addRecipe', { weekStartDate, recipeId }).then(normalizeBasket);
}
function updateShoppingItem(weekStartDate, itemId, changes) {
  return call('baskets.items.update', { weekStartDate, itemId, ...changes });
}
function toggleShoppingItem(weekStartDate, itemId, checked) {
  return call('baskets.items.toggle', { weekStartDate, itemId, checked });
}
function createShoppingItem(weekStartDate, item) {
  return call('baskets.items.create', { weekStartDate, ...item });
}
function deleteShoppingItem(weekStartDate, itemId) {
  return call('baskets.items.delete', { weekStartDate, itemId });
}
function clearShoppingItems(weekStartDate, completedOnly) {
  return call('baskets.items.clear', { weekStartDate, completedOnly: Boolean(completedOnly) });
}

module.exports = {
  fetchShoppingList,
  syncShoppingList,
  syncSelectedShoppingList,
  addRecipeToShoppingList,
  updateShoppingItem,
  toggleShoppingItem,
  createShoppingItem,
  deleteShoppingItem,
  clearShoppingItems,
  normalizeBasket,
  groupItems,
  normalize,
  displayAmount
};
