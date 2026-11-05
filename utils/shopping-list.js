const CATEGORIES = ['主料', '辅料', '调料', '其他'];
const SEASONING_PATTERN = /油|盐|糖|醋|酱|料酒|胡椒|孜然|淀粉|味精|鸡精|蚝油|生抽|老抽|辣椒粉/;
const SIDE_PATTERN = /^(葱|葱花|姜|蒜|蒜末|香菜|芝麻|辣椒|小米椒)$/;

function normalizeIngredientName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

function inferCategory(groupName, ingredientName) {
  if (CATEGORIES.indexOf(groupName) >= 0) return groupName;
  if (SEASONING_PATTERN.test(ingredientName)) return '调料';
  if (SIDE_PATTERN.test(ingredientName)) return '辅料';
  return '主料';
}

function addIngredients(existingItems, ingredientGroups) {
  const merged = JSON.parse(JSON.stringify(existingItems || []));
  (ingredientGroups || []).forEach((group) => (group.items || []).forEach((ingredient) => {
    const name = normalizeIngredientName(ingredient.name);
    if (!name) return;
    const normalizedName = name.toLocaleLowerCase();
    const matched = merged.find((item) => normalizeIngredientName(item.name).toLocaleLowerCase() === normalizedName);
    if (matched) {
      matched.amount = mergeAmount(matched.amount, ingredient.amount);
      return;
    }
    merged.push({
      id: `ingredient-${Date.now()}-${merged.length}`,
      name,
      amount: String(ingredient.amount || '').trim(),
      category: inferCategory(group.group, name),
      checked: false,
      source: 'recipe'
    });
  }));
  return merged;
}

function mergeAmount(previous, next) {
  previous = String(previous || '').trim();
  next = String(next || '').trim();
  if (!previous) return next;
  if (!next) return previous;
  if (previous === next) return previous;
  if (previous === '适量' || next === '适量') return '适量';
  return `${previous} + ${next}`;
}

function addIngredientGroupsToWeekBasket(globalData, ingredientGroups, weekOffset = 0) {
  const offset = Number(weekOffset || 0);
  const weekKey = `week-${offset}`;
  const store = globalData.shoppingBasketsByWeek || (globalData.shoppingBasketsByWeek = {});
  const activeMatches = globalData.shoppingBasketWeekKey === weekKey;
  const initialCurrentWeek = weekKey === 'week-0' && !globalData.shoppingBasketWeekKey;
  const existing = Object.prototype.hasOwnProperty.call(store, weekKey)
    ? store[weekKey]
    : ((activeMatches || initialCurrentWeek) ? globalData.shoppingBasket : []);
  const merged = addIngredients(existing, ingredientGroups);
  store[weekKey] = JSON.parse(JSON.stringify(merged));
  if (activeMatches || initialCurrentWeek) {
    globalData.shoppingBasket = JSON.parse(JSON.stringify(merged));
    globalData.shoppingBasketWeekKey = weekKey;
  }
  return merged;
}

module.exports = { addIngredients, addIngredientGroupsToWeekBasket, inferCategory };
