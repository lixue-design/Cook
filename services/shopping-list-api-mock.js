'use strict';

// Mock starts empty; items are added only through the normal product flows.
const previewItems = [];

const categories = ['主料', '辅料', '调料', '其他'];
const baskets = {};
// 菜谱详情和计划是两类可重复汇总的来源。保留原始食材后，每次同步计划
// 都从来源重建自动条目，避免重复同步时把已有合计再次累加。
const recipeDetailItemsByWeek = {};
const planItemsByWeek = {};
let manualItemSequence = 0;
const categoryMap = { main: '主料', 主料: '主料', side: '辅料', 辅料: '辅料', seasoning: '调料', 调料: '调料' };

function normalizeIngredientName(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/[，,、；;。．.·•]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
}

function cleanedIngredientName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function parseAmount(value) {
  const amountText = String(value || '').trim();
  const matched = amountText.match(/^(\d+(?:\.\d+)?)\s*(.+)$/);
  return matched && matched[2].trim()
    ? { amount: matched[1], amountText, unit: matched[2].trim() }
    : { amount: '', amountText, unit: '' };
}

function parseIngredientDisplay(display) {
  return String(display || '').split(/[、,，]/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const matched = part.match(/^(.+?)(\d+(?:\.\d+)?\s*\S+)$/);
    if (matched) return { name: matched[1].trim(), amount: matched[2].trim() };
    const qualitative = part.match(/^(.+?)(适量|少许)$/);
    return qualitative ? { name: qualitative[1].trim(), amount: qualitative[2] } : { name: part, amount: '' };
  });
}

function ingredientGroupsForPlanRecipe(recipe) {
  const groups = Array.isArray(recipe && recipe.ingredients) ? recipe.ingredients : [];
  if (groups.length) return groups.map((group) => ({
    group: group.group,
    items: Array.isArray(group.items) ? group.items : parseIngredientDisplay(group.display)
  }));
  return [
    { group: '主料', items: parseIngredientDisplay(recipe && recipe.mainIngredients) },
    { group: '辅料', items: parseIngredientDisplay(recipe && recipe.sideIngredients) },
    { group: '调料', items: parseIngredientDisplay(recipe && recipe.seasonings) }
  ];
}

function mergeQualitativeAmounts(items) {
  const rows = (items || []).slice();
  const indexesByName = {};
  const removedIndexes = new Set();

  rows.forEach((item, index) => {
    const normalizedName = item.normalizedName || normalizeIngredientName(item.name);
    if (!normalizedName) return;
    indexesByName[normalizedName] = (indexesByName[normalizedName] || []).concat(index);
  });

  Object.keys(indexesByName).forEach((normalizedName) => {
    const indexes = indexesByName[normalizedName];
    const measuredIndexes = indexes.filter((index) => {
      const item = rows[index];
      return item.amount && item.unit && !Number.isNaN(Number(item.amount));
    });
    const qualitativeIndexByText = {};

    indexes.forEach((index) => {
      const item = rows[index];
      const amountText = String(item.amountText || '').trim();
      if (amountText !== '少许' && amountText !== '适量') return;
      const existingIndex = qualitativeIndexByText[amountText];
      if (existingIndex === undefined) {
        qualitativeIndexByText[amountText] = index;
        return;
      }
      rows[existingIndex].sourceRefs = (rows[existingIndex].sourceRefs || []).concat(item.sourceRefs || []);
      removedIndexes.add(index);
    });

    // 只有同名食材存在唯一一种数字单位时，定性用量才可以安全附加到合计项。
    if (measuredIndexes.length !== 1) return;
    const target = rows[measuredIndexes[0]];
    const qualitativeTexts = Object.keys(qualitativeIndexByText);
    if (!qualitativeTexts.length) return;

    qualitativeTexts.forEach((amountText) => {
      const index = qualitativeIndexByText[amountText];
      target.sourceRefs = (target.sourceRefs || []).concat(rows[index].sourceRefs || []);
      removedIndexes.add(index);
    });
    const baseAmountText = target.hasUnmeasured ? `无用量+${target.amount}${target.unit}` : `${target.amount}${target.unit}`;
    target.amountText = `${baseAmountText}+${qualitativeTexts.join('+')}`;
  });

  return rows.filter((item, index) => !removedIndexes.has(index));
}

function mergePlanItems(items) {
  const merged = [];
  const indexByMeasuredKey = {};
  const unmeasuredIndexByName = {};
  const measuredKeysByName = {};
  const appendSourceRefs = (target, source) => {
    target.sourceRefs = (target.sourceRefs || []).concat(source.sourceRefs || []);
  };
  const refreshAmountText = (item) => {
    item.amountText = item.hasUnmeasured ? `无用量+${item.amount}${item.unit}` : `${item.amount}${item.unit}`;
  };
  (items || []).forEach((source) => {
    const item = { ...source, sourceRefs: (source.sourceRefs || []).slice() };
    const normalizedName = item.normalizedName || normalizeIngredientName(item.name);
    const numericAmount = item.amount && item.unit && !Number.isNaN(Number(item.amount));
    const isUnmeasured = normalizedName && !item.amount && !item.unit && !item.amountText;
    if (isUnmeasured) {
      const measuredKeys = measuredKeysByName[normalizedName] || [];
      if (measuredKeys.length === 1) {
        const existing = merged[indexByMeasuredKey[measuredKeys[0]]];
        existing.hasUnmeasured = true;
        appendSourceRefs(existing, item);
        refreshAmountText(existing);
        return;
      }
      const existingIndex = unmeasuredIndexByName[normalizedName];
      if (existingIndex !== undefined) {
        appendSourceRefs(merged[existingIndex], item);
        return;
      }
      item.amountText = '无用量';
      item.sortOrder = merged.length;
      item.normalizedName = normalizedName;
      unmeasuredIndexByName[normalizedName] = merged.length;
      merged.push(item);
      return;
    }
    // 只有名称、数字用量和单位均相同的食材才可安全相加。
    if (!normalizedName || !numericAmount) {
      item.sortOrder = merged.length;
      item.normalizedName = normalizedName;
      merged.push(item);
      return;
    }
    const key = `${normalizedName}\u0000${item.unit.normalize('NFKC').trim().toLocaleLowerCase()}`;
    const existingIndex = indexByMeasuredKey[key];
    if (existingIndex === undefined) {
      const unmeasuredIndex = unmeasuredIndexByName[normalizedName];
      const measuredKeys = measuredKeysByName[normalizedName] || [];
      if (unmeasuredIndex !== undefined && measuredKeys.length === 0) {
        const existing = merged[unmeasuredIndex];
        existing.amount = item.amount;
        existing.unit = item.unit;
        existing.hasUnmeasured = true;
        appendSourceRefs(existing, item);
        refreshAmountText(existing);
        indexByMeasuredKey[key] = unmeasuredIndex;
        measuredKeysByName[normalizedName] = [key];
        return;
      }
      item.sortOrder = merged.length;
      item.normalizedName = normalizedName;
      indexByMeasuredKey[key] = merged.length;
      measuredKeysByName[normalizedName] = measuredKeys.concat(key);
      merged.push(item);
      return;
    }
    const existing = merged[existingIndex];
    const sum = Math.round((Number(existing.amount) + Number(item.amount)) * 1000000) / 1000000;
    existing.amount = String(sum);
    appendSourceRefs(existing, item);
    refreshAmountText(existing);
  });
  return mergeQualitativeAmounts(merged).map((item, index) => {
    const { hasUnmeasured, ...result } = item;
    return { ...result, sortOrder: index };
  });
}

function extractPlanItems(planDays) {
  const items = [];
  const warnings = [];
  let planRecipeCount = 0;
  (planDays || []).forEach((day) => (day.meals || []).forEach((meal) => (meal.items || []).forEach((recipe) => {
    if (!String(recipe && recipe.title || '').trim()) return;
    planRecipeCount += 1;
    let ingredientCount = 0;
    ingredientGroupsForPlanRecipe(recipe).forEach((group) => (group.items || []).forEach((ingredient) => {
      const name = cleanedIngredientName(ingredient && ingredient.name);
      if (!name) return;
      ingredientCount += 1;
      const parsed = parseAmount(ingredient.amountText || ingredient.amount);
      items.push({
        id: `plan-${Date.now()}-${items.length}`,
        name,
        normalizedName: normalizeIngredientName(name),
        amount: parsed.amount,
        amountText: parsed.amountText,
        unit: parsed.unit,
        category: categoryMap[group.group] || '其他',
        checked: false,
        source: 'plan',
        sourceRefs: [{
          planRecipeId: String(recipe.id || ''),
          recipeId: String(recipe.recipeId || ''),
          date: String(day.id || day.date || ''),
          mealType: String(meal.type || ''),
          recipeName: String(recipe.title || ''),
          coverUrl: String(recipe.coverUrl || ''),
          cookTimeMinutes: recipe.duration || '',
          caloriesKcal: recipe.calories || ''
        }]
      });
    }));
    if (!ingredientCount) warnings.push({ code: 'RECIPE_WITHOUT_INGREDIENTS', message: `${recipe.title}没有可同步的食材，已跳过。` });
  })));
  if (!planRecipeCount) warnings.push({ code: 'PLAN_EMPTY', message: '本周暂无计划，请先添加计划。' });
  return { items: mergePlanItems(items), warnings };
}

function rebuildSortOrder(items) {
  const pending = items.filter((item) => !item.checked).sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
  const completed = items.filter((item) => item.checked).sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
  pending.forEach((item, index) => { item.sortOrder = index; });
  completed.forEach((item, index) => { item.sortOrder = 10000 + index; });
  return pending.concat(completed);
}

function itemsForWeek(weekStartDate) {
  const key = String(weekStartDate || 'preview');
  if (!baskets[key]) baskets[key] = JSON.parse(JSON.stringify(previewItems));
  return baskets[key];
}

function weekKey(weekStartDate) {
  return String(weekStartDate || 'preview');
}

function rebuildAutomaticItems(weekStartDate) {
  const key = weekKey(weekStartDate);
  const manualItems = itemsForWeek(weekStartDate).filter((item) => item.source === 'manual');
  const automaticItems = mergePlanItems(
    (recipeDetailItemsByWeek[key] || []).concat(planItemsByWeek[key] || [])
  );
  baskets[key] = rebuildSortOrder(manualItems.concat(automaticItems));
  return baskets[key];
}

function normalize(items) {
  return (items || []).map((item, index) => ({
    id: item.id || `ingredient-${index}`,
    name: item.name,
    // 页面展示用完整用量（例如“5个”）；数值和单位仅用于同步时的合并计算。
    amount: item.amountText || item.amount || '',
    checked: Boolean(item.checked),
    source: item.source || 'custom',
    sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs : [],
    category: categories.indexOf(item.category) !== -1 ? item.category : '其他',
    sortOrder: Number(item.sortOrder || index)
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

function fetchShoppingList(weekStartDate, userItems) {
  const source = Array.isArray(weekStartDate)
    ? weekStartDate
    : (typeof userItems === 'undefined' ? itemsForWeek(weekStartDate) : userItems);
  return Promise.resolve(groupItems(normalize(source)));
}
function syncShoppingList(weekStartDate, planDays) {
  // 第二个参数由计划页传入当前周的菜谱快照；远程实现则在服务端读取同一份快照。
  if (!Array.isArray(planDays)) return fetchShoppingList(weekStartDate).then((groups) => ({ groups, warnings: [] }));
  const key = weekKey(weekStartDate);
  const extracted = extractPlanItems(planDays);
  // 计划同步替换计划来源，再与详情页加入的菜谱来源统一按食材规则汇总。
  planItemsByWeek[key] = extracted.items;
  rebuildAutomaticItems(weekStartDate);
  return fetchShoppingList(weekStartDate).then((groups) => ({ groups, warnings: extracted.warnings }));
}
function syncSelectedShoppingList(weekStartDate, planRecipeIds) {
  const ids = Array.isArray(planRecipeIds) ? planRecipeIds.filter(Boolean) : [];
  return fetchShoppingList(weekStartDate).then((groups) => ({
    groups,
    warnings: ids.length ? [] : [{ code: 'SELECTED_PLAN_ITEMS_EMPTY', message: '请选择要同步的计划菜品' }]
  }));
}
function addRecipeToShoppingList(weekStartDate, recipeId, ingredientGroups, recipeSnapshot) {
  const key = weekKey(weekStartDate);
  const existingItems = recipeDetailItemsByWeek[key] || [];
  const currentItems = itemsForWeek(weekStartDate);
  const alreadyAdded = existingItems.concat(currentItems.filter((item) => item.source === 'manual'))
    .some((item) => (item.sourceRefs || []).some((ref) => String(ref.recipeId) === String(recipeId) && ref.source === 'recipe_detail'));
  if (alreadyAdded) {
    return fetchShoppingList(weekStartDate);
  }
  const snapshot = recipeSnapshot || {};
  const sourceRef = {
    recipeId: String(recipeId || ''),
    recipeName: String(snapshot.recipeName || snapshot.title || ''),
    coverUrl: String(snapshot.coverUrl || snapshot.heroImage || ''),
    cookTimeMinutes: snapshot.cookTimeMinutes || snapshot.duration || '',
    caloriesKcal: snapshot.caloriesKcal || snapshot.calories || '',
    source: 'recipe_detail'
  };
  const recipeItems = [];
  (ingredientGroups || []).forEach((group) => {
    (group.items || []).forEach((ingredient) => {
      const name = cleanedIngredientName(ingredient.name);
      if (!name) return;
      const parsed = parseAmount(ingredient.amountText || ingredient.amount);
      const manualDuplicate = currentItems.find((item) => (
        item.source === 'manual' && normalizeIngredientName(item.name) === normalizeIngredientName(name)
      ));
      if (manualDuplicate) {
        manualDuplicate.sourceRefs = (manualDuplicate.sourceRefs || []).concat({ ...sourceRef });
        return;
      }
      recipeItems.push({
        id: `recipe-${Date.now()}-${recipeItems.length}`,
        name,
        normalizedName: normalizeIngredientName(name),
        amount: parsed.amount,
        amountText: parsed.amountText,
        unit: parsed.unit,
        category: categories.indexOf(group.group) >= 0 ? group.group : '其他',
        checked: false,
        source: 'recipe_detail',
        sourceRefs: [{ ...sourceRef }]
      });
    });
  });
  recipeDetailItemsByWeek[key] = existingItems.concat(recipeItems);
  rebuildAutomaticItems(weekStartDate);
  return fetchShoppingList(weekStartDate);
}
function updateShoppingItem(weekStartDate, itemId, changes) {
  const items = itemsForWeek(weekStartDate);
  const item = items.find((value) => value.id === itemId);
  if (!item) return Promise.resolve([]);
  const nextName = Object.prototype.hasOwnProperty.call(changes || {}, 'name') ? cleanedIngredientName(changes.name) : item.name;
  const duplicate = items.find((value) => value.id !== itemId && normalizeIngredientName(value.name) === normalizeIngredientName(nextName));
  if (duplicate) {
    duplicate.sourceRefs = (duplicate.sourceRefs || []).concat(item.sourceRefs || []);
    if (Object.prototype.hasOwnProperty.call(changes || {}, 'checked')) duplicate.checked = Boolean(changes.checked);
    const index = items.indexOf(item);
    items.splice(index, 1);
    baskets[String(weekStartDate || 'preview')] = rebuildSortOrder(items);
    return Promise.resolve([duplicate]);
  }
  Object.assign(item, changes || {}, { name: nextName });
  baskets[String(weekStartDate || 'preview')] = rebuildSortOrder(items);
  return Promise.resolve([item]);
}
function createShoppingItem(weekStartDate, item) {
  const items = itemsForWeek(weekStartDate);
  const name = cleanedIngredientName(item && item.name);
  const duplicate = items.find((value) => normalizeIngredientName(value.name) === normalizeIngredientName(name));
  if (duplicate) {
    duplicate.checked = false;
    duplicate.pendingSortOrder = 0;
    duplicate.sortOrder = -1;
    baskets[String(weekStartDate || 'preview')] = rebuildSortOrder(items);
    return Promise.resolve([duplicate]);
  }
  const created = { id: `custom-${Date.now()}-${++manualItemSequence}`, source: 'manual', checked: false, name, ...item, name, sortOrder: -1 };
  items.push(created);
  baskets[String(weekStartDate || 'preview')] = rebuildSortOrder(items);
  return Promise.resolve([created]);
}
function toggleShoppingItem(weekStartDate, itemId, checked) {
  const items = itemsForWeek(weekStartDate);
  const item = items.find((value) => value.id === itemId);
  if (!item) return Promise.resolve([]);
  const pending = items.filter((value) => !value.checked).sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
  const completed = items.filter((value) => value.checked).sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));
  if (checked) {
    const pendingIndex = pending.indexOf(item);
    item.pendingSortOrder = pendingIndex >= 0 ? pendingIndex : 0;
    if (pendingIndex >= 0) pending.splice(pendingIndex, 1);
    item.checked = true;
    completed.unshift(item);
  } else {
    const completedIndex = completed.indexOf(item);
    if (completedIndex >= 0) completed.splice(completedIndex, 1);
    item.checked = false;
    const restoreIndex = Number.isInteger(item.pendingSortOrder) ? item.pendingSortOrder : 0;
    item.pendingSortOrder = null;
    pending.splice(Math.max(0, Math.min(restoreIndex, pending.length)), 0, item);
  }
  pending.forEach((value, index) => { value.sortOrder = index; });
  completed.forEach((value, index) => { value.sortOrder = 10000 + index; });
  baskets[String(weekStartDate || 'preview')] = pending.concat(completed);
  return Promise.resolve([item]);
}
function deleteShoppingItem(weekStartDate, itemId) {
  const items = itemsForWeek(weekStartDate);
  const index = items.findIndex((item) => item.id === itemId);
  if (index >= 0) items.splice(index, 1);
  return Promise.resolve({ deleted: index >= 0 });
}
function clearShoppingItems(weekStartDate, completedOnly) {
  const key = String(weekStartDate || 'preview');
  const items = itemsForWeek(weekStartDate);
  const next = completedOnly ? items.filter((item) => !item.checked) : [];
  const deletedCount = items.length - next.length;
  // “清空本周菜篮”必须连同自动来源缓存一起清除；否则后续从计划页同步时会把
  // 已清空的详情页菜谱来源再次汇总回来。计划本身保留，下一次同步再从当前计划重建。
  if (!completedOnly) {
    delete recipeDetailItemsByWeek[key];
    delete planItemsByWeek[key];
  }
  baskets[key] = rebuildSortOrder(next);
  return Promise.resolve({ deletedCount });
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
  groupItems,
  normalize,
  normalizeIngredientName,
  cleanedIngredientName,
  parseAmount,
  mergePlanItems,
  extractPlanItems
};
