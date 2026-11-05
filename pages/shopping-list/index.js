const {
  fetchShoppingList,
  updateShoppingItem,
  toggleShoppingItem,
  createShoppingItem,
  deleteShoppingItem,
  clearShoppingItems
} = require('../../services/shopping-list-api');
const { fetchRecipeGroups } = require('../../services/recipe-api');
const { formatWeekRange, weekStartForOffset } = require('../../utils/week-range');
const { publishSelectedWeek, readSelectedWeekOffset } = require('../../utils/selected-week');
const { requireAuthenticated } = require('../../services/auth-state');
const { getTopNavigationLayout } = require('../../utils/top-navigation');
const { flattenRecipeGroups, toCurrentRecipeListItem } = require('../../utils/recipe-list-item');
const { parseManualIngredientEntries } = require('../../utils/manual-ingredient-entry');
const { readPageCache, writePageCache } = require('../../utils/page-data-cache');

const app = getApp();
const toRpx = (px) => px * 750 / wx.getSystemInfoSync().windowWidth;

Page({
  onTopNavigationAction() { this.onBasketMore(); },
  data: { status: 'loading', groups: [], pendingItems: [], completedItems: [], skeletonRows: [1, 2, 3, 4, 5], tabBarHeight: 56, statusBarHeight: 44, navigationHeight: 44, navContentOffset: 8, basketHeaderHeight: 134, dateRangeText: formatWeekRange(0), swipeId: '', swipeOffset: 0, deletingId: '', reorderPhase: '', headerShadow: false, scrollIntoView: '', highlightedIngredientId: '', ingredientDragActive: false, ingredientDraggingId: '', ingredientDragGroupIndex: -1, ingredientDragTargetGroupIndex: -1, ingredientDragTargetIndex: -1, ingredientDragOffset: 0, ingredientDialogVisible: false, ingredientDialogValue: '', ingredientDialogTitle: '添加食材', ingredientEditingId: '', ingredientKeyboardFocus: false, ingredientKeyboardHeight: 0, sourceSheetVisible: false, sourceRecipes: [], basketActionVisible: false, basketActions: [{ label: '清空本周菜篮', value: 'clear-week' }] },
  rangeOffset: 0,
  touchStartX: 0,
  touchStartOffset: 0,
  touchMoved: false,
  onLoad() {
    this.initializePage();
  },
  initializePage() {
    if (this.authInitialized) return;
    this.authInitialized = true;
    this.rangeOffset = readSelectedWeekOffset(app.globalData, 0);
    this.recipeDataVersion = Number(app.globalData.recipeDataVersion || 0);
    publishSelectedWeek(app.globalData, this.rangeOffset);
    let windowInfo = {};
    try { windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (error) { windowInfo = {}; }
    const statusBarHeight = Number(windowInfo.statusBarHeight || 44);
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const menuTop = Number((menuButton && menuButton.top) || (statusBarHeight + 6));
    const menuHeight = Number((menuButton && menuButton.height) || 32);
    const navContentTop = menuTop + (menuHeight - 24) / 2;
    const navigationBottom = menuTop + menuHeight + 6;
    this.setData({
      topNavigationLayout: getTopNavigationLayout(),
      topNavigationActions: [{ id: 'more', label: '更多操作', icon: '/assets/top-nav/basket-more.svg' }],
      tabBarHeight: app.globalData.tabBarHeight,
      statusBarHeight,
      navigationHeight: navigationBottom - statusBarHeight,
      navContentOffset: navContentTop - statusBarHeight,
      basketHeaderHeight: navigationBottom + 46,
      dateRangeText: this.formatRange(this.rangeOffset)
    });
    this.loadList();
  },
  onShow() {
    if (!this.authInitialized) this.initializePage();
    else this.syncSelectedWeek();
    this.getTabBar() && this.getTabBar().setData({ selected: 2, hidden: this.data.ingredientDialogVisible || this.data.sourceSheetVisible });
    const needsRefresh = Boolean(app.globalData.shoppingBasketNeedsRefresh);
    if (this.loaded && (this.selectedWeekChanged || needsRefresh)) {
      this.selectedWeekChanged = false;
      this.loadList();
    }
  },
  onUnload() {
    clearTimeout(this.reorderTimer);
    clearTimeout(this.highlightTimer);
    clearTimeout(this.ingredientLongPressTimer);
    clearTimeout(this.ingredientFocusTimer);
  },
  getWeekStartDate() { return weekStartForOffset(this.rangeOffset); },
  syncSelectedWeek() {
    const nextRangeOffset = readSelectedWeekOffset(app.globalData, this.rangeOffset);
    if (nextRangeOffset === this.rangeOffset) return;
    this.rangeOffset = nextRangeOffset;
    this.selectedWeekChanged = true;
    this.setData({ dateRangeText: this.formatRange(nextRangeOffset), swipeId: '', swipeOffset: 0, status: 'loading', headerShadow: false });
  },
  showBasketError(error, fallback) {
    wx.showToast({ title: (error && error.message) || fallback || '菜篮操作失败，请重试', icon: 'none' });
  },
  refreshRecipeCatalog(version) {
    const requestId = (this.recipeCatalogRequestId || 0) + 1;
    this.recipeCatalogRequestId = requestId;
    return fetchRecipeGroups().then((groups) => {
      if (requestId !== this.recipeCatalogRequestId) return;
      this.recipeCatalog = flattenRecipeGroups(groups);
      this.recipeDataVersion = Number(version || 0);
      if (this.data.sourceSheetVisible && this.data.sourceRecipes.length) {
        this.setData({ sourceRecipes: this.data.sourceRecipes.map((recipe) => toCurrentRecipeListItem(recipe, this.recipeCatalog)) });
      }
    }).catch(() => { this.recipeCatalog = []; });
  },
  formatSourceRefs(sourceRefs) {
    const refs = Array.isArray(sourceRefs) ? sourceRefs : [];
    const labels = refs.map((ref) => {
      const recipeName = String((ref && (ref.recipeName || ref.name)) || '').trim();
      const date = String((ref && ref.date) || '').trim();
      const mealMap = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', recipe_detail: '菜谱详情' };
      const meal = mealMap[ref && ref.mealType] || '';
      const suffix = [date, meal].filter(Boolean).join('・');
      return recipeName ? `来自${recipeName}${suffix ? `・${suffix}` : ''}` : '';
    }).filter(Boolean);
    return labels.filter((label, index) => labels.indexOf(label) === index).join('；');
  },
  sourceRecipesFromRefs(sourceRefs) {
    const seen = new Set();
    return (Array.isArray(sourceRefs) ? sourceRefs : []).map((ref) => {
      const value = ref || {};
      const name = String(value.recipeName || value.name || '').trim();
      const key = String(value.planRecipeId || value.recipeId || name).trim();
      if (!name || !key || seen.has(key)) return null;
      seen.add(key);
      const canonical = (this.recipeCatalog || []).find((recipe) => recipe.id === value.recipeId || recipe.title === name);
      return toCurrentRecipeListItem({
        ...value,
        id: key,
        recipeId: String(value.recipeId || (canonical && canonical.id) || ''),
        title: name,
        coverUrl: value.coverUrl
      }, this.recipeCatalog);
    }).filter(Boolean);
  },
  toStatusGroups(categoryGroups) {
    const items = (categoryGroups || []).reduce((all, group) => all.concat(group.items || []), []).map((item) => ({
      ...item,
      sourceText: this.formatSourceRefs(item.sourceRefs)
    }));
    const bySortOrder = (left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
    return [
      { id: 'pending', items: items.filter((item) => !item.checked).sort(bySortOrder) },
      { id: 'completed', items: items.filter((item) => item.checked).sort(bySortOrder) }
    ];
  },
  loadList() {
    const requestId = (this.listRequestId || 0) + 1;
    this.listRequestId = requestId;
    const weekStartDate = this.getWeekStartDate();
    const cachedCategoryGroups = readPageCache('shopping-list', weekStartDate);
    if (cachedCategoryGroups) {
      const groups = this.toStatusGroups(cachedCategoryGroups);
      const items = groups.reduce((all, group) => all.concat(group.items), []);
      this.loaded = true;
      this.setData({ groups, pendingItems: groups[0].items, completedItems: groups[1].items, swipeId: '', swipeOffset: 0, status: items.length ? 'success' : 'empty' });
    }
    return fetchShoppingList(weekStartDate).then((categoryGroups) => {
      if (requestId !== this.listRequestId || weekStartDate !== this.getWeekStartDate()) return;
      this.loaded = true;
      app.globalData.shoppingBasketNeedsRefresh = false;
      writePageCache('shopping-list', weekStartDate, categoryGroups);
      const groups = this.toStatusGroups(categoryGroups);
      const items = groups.reduce((all, group) => all.concat(group.items), []);
      this.setData({ groups, pendingItems: groups[0].items, completedItems: groups[1].items, swipeId: '', swipeOffset: 0, status: items.length ? 'success' : 'empty' });
      return groups;
    }).catch((error) => {
      if (requestId !== this.listRequestId || weekStartDate !== this.getWeekStartDate()) return;
      this.loaded = true;
      if (cachedCategoryGroups) return;
      this.setData({ status: this.data.groups.some((group) => group.items.length) ? 'success' : 'error' });
      this.showBasketError(error, '菜篮加载失败');
    });
  },
  onRetryLoad() {
    this.setData({ status: 'loading' });
    this.loadList();
  },
  syncGroups(groups, extraData) {
    const items = groups.reduce((all, group) => all.concat(group.items), []);
    const nextData = extraData || {};
    nextData.groups = groups;
    nextData.pendingItems = (groups[0] && groups[0].items) || [];
    nextData.completedItems = (groups[1] && groups[1].items) || [];
    nextData.status = items.length ? 'success' : 'empty';
    this.setData(nextData);
  },
  persistGroupOrder(groups) {
    const weekStartDate = this.getWeekStartDate();
    const updates = [];
    let nextSortOrder = 0;
    groups.forEach((group) => {
      group.items.forEach((item) => {
        updates.push(updateShoppingItem(weekStartDate, item.id, {
          sortOrder: nextSortOrder
        }));
        nextSortOrder += 1;
      });
    });
    return Promise.all(updates);
  },
  onToggleIngredient(event) {
    if (!requireAuthenticated()) return;
    if (this.touchMoved || this.data.reorderPhase) {
      this.touchMoved = false;
      return;
    }
    const { groupIndex, itemIndex } = event.currentTarget.dataset;
    const groups = JSON.parse(JSON.stringify(this.data.groups));
    const ingredient = groups[groupIndex].items.splice(itemIndex, 1)[0];
    if (!ingredient) return;
    ingredient.checked = !ingredient.checked;
    const targetGroupIndex = ingredient.checked ? 1 : 0;
    if (ingredient.checked) {
      ingredient.pendingSortOrder = itemIndex;
      groups[targetGroupIndex].items.unshift(ingredient);
    } else {
      const restoreIndex = Number.isInteger(ingredient.pendingSortOrder) ? ingredient.pendingSortOrder : 0;
      ingredient.pendingSortOrder = null;
      groups[targetGroupIndex].items.splice(Math.max(0, Math.min(restoreIndex, groups[targetGroupIndex].items.length)), 0, ingredient);
    }
    toggleShoppingItem(this.getWeekStartDate(), ingredient.id, ingredient.checked)
      .catch((error) => {
        this.showBasketError(error, '勾选保存失败');
        return this.loadList().catch(() => {});
      });
    this.syncGroups(groups, { swipeId: '', swipeOffset: 0, reorderPhase: '' });
  },
  onShowIngredientSources(event) {
    if (this.touchMoved || this.data.reorderPhase || this.ingredientDragActive) {
      this.touchMoved = false;
      return;
    }
    const id = event.currentTarget.dataset.id;
    const ingredient = this.data.groups.reduce(
      (found, group) => found || (group.items || []).find((item) => item.id === id),
      null
    );
    const sourceRecipes = this.sourceRecipesFromRefs(ingredient && ingredient.sourceRefs);
    // 手动新增或没有关联菜谱的食材不应打开空的来源浮层。
    if (!sourceRecipes.length) {
      this.setData({ sourceRecipes: [] });
      return;
    }
    this.setData({ sourceSheetVisible: true, sourceRecipes, swipeId: '', swipeOffset: 0 });
    // 菜篮首页不需要完整菜谱目录；仅在用户主动查看来源时才读取，
    // 用于把来源卡片同步为菜谱当前的标题和封面。
    this.refreshRecipeCatalog(Number(app.globalData.recipeDataVersion || 0));
  },
  onCloseIngredientSources() {
    this.setData({ sourceSheetVisible: false });
  },
  onIngredientSourcesAfterClose() {
    this.setData({ sourceRecipes: [] });
  },
  onSourceRecipeTap(event) {
    const recipeId = String(event.currentTarget.dataset.recipeId || '').trim();
    if (!recipeId) return;
    this.setData({ sourceSheetVisible: false, sourceRecipes: [] });
    wx.navigateTo({ url: `/pages/recipe-detail/index?id=${encodeURIComponent(recipeId)}` });
  },
  onSourceRecipeImageError(event) {
    const update = {};
    update[`sourceRecipes[${event.currentTarget.dataset.index}].coverUrl`] = '/assets/recipes/cover-placeholder.svg';
    this.setData(update);
  },
  formatRange(offset) {
    return formatWeekRange(offset);
  },
  onRangeChange(event) {
    this.rangeOffset += Number(event.detail.direction) || 0;
    publishSelectedWeek(app.globalData, this.rangeOffset);
    this.setData({ dateRangeText: this.formatRange(this.rangeOffset), swipeId: '', swipeOffset: 0, status: 'loading', headerShadow: false });
    this.loadList();
  },
  onRangeReset() {
    this.rangeOffset = 0;
    publishSelectedWeek(app.globalData, this.rangeOffset);
    this.setData({ dateRangeText: this.formatRange(0), swipeId: '', swipeOffset: 0, status: 'loading', headerShadow: false });
    this.loadList();
  },
  onBasketScroll(event) {
    const scrollTop = Number(event.detail.scrollTop || 0);
    this.basketCurrentScrollTop = scrollTop;
    const headerShadow = scrollTop > 0;
    if (headerShadow !== this.data.headerShadow) this.setData({ headerShadow });
  },
  onIngredientTouchStart(event) {
    const touch = event.touches[0];
    const id = event.currentTarget.dataset.id;
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.ingredientDragStartY = touch.clientY;
    this.ingredientDragStartIndex = Number(event.currentTarget.dataset.itemIndex);
    this.ingredientDragGroupIndex = Number(event.currentTarget.dataset.groupIndex);
    this.touchStartOffset = this.data.swipeId === id ? this.data.swipeOffset : 0;
    this.currentIngredientSwipeOffset = this.touchStartOffset;
    if (this.data.swipeId && this.data.swipeId !== id) this.setData({ swipeId: '', swipeOffset: 0 });
    this.ingredientGestureAxis = '';
    this.touchMoved = false;
    clearTimeout(this.ingredientLongPressTimer);
  },
  onIngredientLongPress(event) {
    this.activateIngredientDrag(event.currentTarget.dataset.id);
  },
  activateIngredientDrag(id) {
    if (!requireAuthenticated()) return;
    if (this.ingredientDragActive || this.touchMoved || this.ingredientGestureAxis) return;
    clearTimeout(this.ingredientLongPressTimer);
    this.ingredientDragActive = true;
    this.touchMoved = true;
    this.setData({ ingredientDragActive: true, ingredientDraggingId: id, ingredientDragGroupIndex: this.ingredientDragGroupIndex, ingredientDragTargetGroupIndex: this.ingredientDragGroupIndex, ingredientDragTargetIndex: this.ingredientDragStartIndex, ingredientDragOffset: 0, swipeId: '', swipeOffset: 0 });
    this.measureIngredientDragLayout();
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
  },
  measureIngredientDragLayout() {
    const query = this.createSelectorQuery();
    query.selectAll('.ingredient-card').boundingClientRect();
    query.selectAll('.ingredient-swipe').boundingClientRect();
    query.exec((result) => {
      if (!this.ingredientDragActive) return;
      const groupRects = result[0] || [];
      const rowRects = result[1] || [];
      let rowCursor = 0;
      this.ingredientDragLayout = groupRects.map((rect, groupIndex) => {
        const count = this.data.groups[groupIndex].items.length;
        const rows = rowRects.slice(rowCursor, rowCursor + count);
        rowCursor += count;
        return { top: rect.top, bottom: rect.bottom, rows };
      });
      if (typeof this.ingredientDragLastClientY === 'number') this.updateIngredientDragTarget(this.ingredientDragLastClientY);
    });
  },
  updateIngredientDragTarget(clientY) {
    const layout = this.ingredientDragLayout;
    if (!layout || !layout.length) return;
    let targetGroupIndex = layout.findIndex((group) => clientY >= group.top && clientY <= group.bottom);
    if (targetGroupIndex === -1) {
      targetGroupIndex = layout.reduce((nearest, group, index) => {
        const distance = clientY < group.top ? group.top - clientY : clientY - group.bottom;
        return distance < nearest.distance ? { index, distance } : nearest;
      }, { index: 0, distance: Infinity }).index;
    }
    const rows = layout[targetGroupIndex].rows;
    let targetIndex = rows.length;
    for (let index = 0; index < rows.length; index += 1) {
      if (clientY < rows[index].top + rows[index].height / 2) {
        targetIndex = index;
        break;
      }
    }
    if (targetGroupIndex !== this.data.ingredientDragTargetGroupIndex || targetIndex !== this.data.ingredientDragTargetIndex) {
      this.setData({ ingredientDragTargetGroupIndex: targetGroupIndex, ingredientDragTargetIndex: targetIndex });
    }
  },
  onIngredientTouchMove(event) {
    const touch = event.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;
    if (this.ingredientDragActive) {
      this.ingredientDragLastClientY = touch.clientY;
      this.updateIngredientDragTarget(touch.clientY);
      this.setData({ ingredientDragOffset: toRpx(deltaY) });
      return;
    }
    if (!this.ingredientGestureAxis) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 6) return;
      this.ingredientGestureAxis = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      clearTimeout(this.ingredientLongPressTimer);
    }
    if (this.ingredientGestureAxis !== 'horizontal') {
      this.touchMoved = true;
      return;
    }
    this.touchMoved = true;
    if (!this.touchStartOffset && deltaX >= 0) return;
    const swipeOffset = Math.max(0, Math.min(152, this.touchStartOffset - toRpx(deltaX)));
    this.currentIngredientSwipeOffset = swipeOffset;
    this.setData({ swipeId: event.currentTarget.dataset.id, swipeOffset });
  },
  onIngredientTouchEnd(event) {
    clearTimeout(this.ingredientLongPressTimer);
    if (this.ingredientDragActive) {
      const groups = JSON.parse(JSON.stringify(this.data.groups));
      const sourceGroupIndex = this.ingredientDragGroupIndex;
      const targetGroupIndex = this.data.ingredientDragTargetGroupIndex;
      const sourceItems = groups[sourceGroupIndex].items;
      const moved = sourceItems.splice(this.ingredientDragStartIndex, 1)[0];
      let targetIndex = this.data.ingredientDragTargetIndex;
      if (sourceGroupIndex === targetGroupIndex && targetIndex > this.ingredientDragStartIndex) targetIndex -= 1;
      if (moved && groups[targetGroupIndex]) {
        moved.category = groups[targetGroupIndex].name;
        groups[targetGroupIndex].items.splice(Math.max(0, Math.min(targetIndex, groups[targetGroupIndex].items.length)), 0, moved);
      }
      this.ingredientDragActive = false;
      this.ingredientDragLayout = null;
      this.ingredientDragLastClientY = null;
      this.syncGroups(groups, { ingredientDragActive: false, ingredientDraggingId: '', ingredientDragGroupIndex: -1, ingredientDragTargetGroupIndex: -1, ingredientDragTargetIndex: -1, ingredientDragOffset: 0 });
      if (moved) {
        this.persistGroupOrder(groups).catch((error) => {
          this.showBasketError(error, '排序保存失败');
          return this.loadList().catch(() => {});
        });
      }
      return;
    }
    if (this.ingredientGestureAxis !== 'horizontal') {
      this.ingredientGestureAxis = '';
      return;
    }
    const id = event.currentTarget.dataset.id;
    const opened = this.currentIngredientSwipeOffset > 76;
    this.setData({ swipeId: opened ? id : '', swipeOffset: opened ? 152 : 0 });
    this.ingredientGestureAxis = '';
  },
  onIngredientTouchCancel() {
    clearTimeout(this.ingredientLongPressTimer);
    if (this.ingredientDragActive) this.resetIngredientDrag();
    this.ingredientGestureAxis = '';
    this.touchMoved = false;
    this.setData({ swipeId: '', swipeOffset: 0 });
  },
  resetIngredientDrag() {
    this.ingredientDragActive = false;
    this.ingredientDragLayout = null;
    this.ingredientDragLastClientY = null;
    this.setData({ ingredientDragActive: false, ingredientDraggingId: '', ingredientDragGroupIndex: -1, ingredientDragTargetGroupIndex: -1, ingredientDragTargetIndex: -1, ingredientDragOffset: 0 });
  },
  onDeleteIngredient(event) {
    if (!requireAuthenticated()) return;
    const id = event.currentTarget.dataset.id;
    this.setData({ deletingId: id, swipeId: '', swipeOffset: 0 });
    setTimeout(() => {
      const groups = JSON.parse(JSON.stringify(this.data.groups));
      groups.forEach((group) => {
        group.items = group.items.filter((item) => item.id !== id);
      });
      this.setData({ deletingId: '' });
      this.syncGroups(groups);
      deleteShoppingItem(this.getWeekStartDate(), id).catch((error) => {
        this.showBasketError(error, '删除失败');
        return this.loadList().catch(() => {});
      });
    }, 220);
  },
  requestIngredient() {
    if (!requireAuthenticated()) return;
    this.setData({
      ingredientDialogVisible: true,
      ingredientDialogValue: '',
      ingredientDialogTitle: '添加食材',
      ingredientEditingId: '',
      ingredientKeyboardFocus: false,
      ingredientKeyboardHeight: 0
    });
    clearTimeout(this.ingredientFocusTimer);
    this.ingredientFocusTimer = setTimeout(() => this.setData({ ingredientKeyboardFocus: true }), 80);
  },
  onIngredientDialogInput(event) { this.setData({ ingredientDialogValue: event.detail.value }); },
  onIngredientKeyboardHeightChange(event) {
    this.setData({ ingredientKeyboardHeight: Number(event.detail.height || 0) });
  },
  onIngredientDialogCancel() {
    clearTimeout(this.ingredientFocusTimer);
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.setData({ ingredientDialogVisible: false, ingredientKeyboardFocus: false });
  },
  onIngredientDialogAfterClose() {
    const locateId = this.pendingIngredientLocateId;
    this.pendingIngredientLocateId = '';
    this.setData({ ingredientDialogValue: '', ingredientDialogTitle: '添加食材', ingredientEditingId: '', ingredientKeyboardHeight: 0 });
    if (locateId) this.locateIngredient(locateId);
  },
  onIngredientDialogConfirm() {
    if (!requireAuthenticated()) return;
    const entries = parseManualIngredientEntries(this.data.ingredientDialogValue);
    if (!entries.length) return;
    const editingId = this.data.ingredientEditingId;
    if (editingId && entries.length > 1) {
      wx.showToast({ title: '编辑时请仅输入一种食材', icon: 'none' });
      return;
    }
    const action = editingId
      ? updateShoppingItem(this.getWeekStartDate(), editingId, { name: entries[0].name })
      : entries.slice().reverse().reduce(
        (queue, entry) => queue.then(() => createShoppingItem(this.getWeekStartDate(), {
          ...entry,
          category: '其他',
          sortOrder: 0
        })),
        Promise.resolve()
      );
    action.then(() => {
      this.onIngredientDialogCancel();
      return this.loadList().then(() => {
        if (!editingId && entries.length > 1) wx.showToast({ title: `已添加 ${entries.length} 种食材`, icon: 'none' });
      });
    }).catch((error) => this.showBasketError(error, editingId ? '食材修改失败' : '食材保存失败'));
  },
  onEditIngredient(event) {
    if (!requireAuthenticated()) return;
    const id = event.currentTarget.dataset.id;
    const ingredient = this.data.groups.reduce((found, group) => found || group.items.find((item) => item.id === id), null);
    if (!ingredient) return;
    this.setData({
      ingredientDialogVisible: true,
      ingredientDialogTitle: '编辑食材',
      ingredientDialogValue: ingredient.name,
      ingredientEditingId: ingredient.id,
      ingredientKeyboardFocus: false,
      ingredientKeyboardHeight: 0
    });
    clearTimeout(this.ingredientFocusTimer);
    this.ingredientFocusTimer = setTimeout(() => this.setData({ ingredientKeyboardFocus: true }), 80);
  },
  onBasketMore() {
    this.setData({ basketActionVisible: true });
  },
  onBasketActionSelect(event) {
    if (event.detail.value === 'clear-week') this.pendingBasketAction = 'clear-week';
    this.setData({ basketActionVisible: false });
  },
  onBasketActionClose() { this.setData({ basketActionVisible: false }); },
  onBasketActionAfterClose() {
    if (this.pendingBasketAction !== 'clear-week') return;
    this.pendingBasketAction = '';
    this.clearCurrentWeekBasket();
  },
  clearCurrentWeekBasket() {
    if (!requireAuthenticated()) return;
    clearShoppingItems(this.getWeekStartDate(), false)
      .then(() => this.loadList())
      .then(() => wx.showToast({ title: '已清空本周菜篮', icon: 'none' }))
      .catch((error) => this.showBasketError(error, '清空失败'));
  },
  locateIngredient(id) {
    clearTimeout(this.highlightTimer);
    this.setData({ scrollIntoView: '', highlightedIngredientId: id });
    wx.nextTick(() => {
      this.setData({ scrollIntoView: `ingredient-${id}` });
      this.highlightTimer = setTimeout(() => this.setData({ highlightedIngredientId: '', scrollIntoView: '' }), 2000);
    });
  },
  noop() {},
  onAddOther() { this.requestIngredient(); }
});

module.exports = { parseManualIngredientEntries };
