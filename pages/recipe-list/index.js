const {
  fetchRecipeListPage,
  reorderRecipeCategories,
  renameRecipeCategory,
  createRecipeCategory,
  deleteRecipeCategory
} = require('../../services/recipe-api');
const { generateRecipeDraftFromLink } = require('../../services/recipe-text-ai-api');
const { generateRecipeDraftFromImage } = require('../../services/recipe-image-ocr-ai-api');
const { addRecipeToPlan } = require('../../services/meal-plan-api');
const { requireAuthenticated } = require('../../services/auth-state');
const { getTopNavigationLayout } = require('../../utils/top-navigation');
const { toRecipeCatalogGroups } = require('../../utils/recipe-list-item');
const { readPageCache, writePageCache } = require('../../utils/page-data-cache');

const app = getApp();
const toCategoryRpx = (px) => px * 750 / wx.getSystemInfoSync().windowWidth;
const SYSTEM_CATEGORY_NAME = '未分类';
const isManageableCategory = (category) => String(category && category.name || '').trim() !== SYSTEM_CATEGORY_NAME;
const RECIPE_LIST_PAGE_SIZE = 20;

const normalizeRecipePageGroups = (groups) => (Array.isArray(groups) ? groups : []).map((group) => {
  const recipes = Array.isArray(group && group.recipes) ? group.recipes : [];
  const recipeCount = Number(group && group.recipeCount);
  const total = Number.isInteger(recipeCount) && recipeCount >= recipes.length ? recipeCount : recipes.length;
  const nextOffset = group && group.nextOffset === null ? null : Number(group && group.nextOffset);
  return {
    ...group,
    recipes,
    recipeCount: total,
    hasMore: Boolean(group && group.hasMore),
    nextOffset: Number.isInteger(nextOffset) && nextOffset >= recipes.length ? nextOffset : (total > recipes.length ? recipes.length : null),
    loadingMore: false
  };
});

const initialRecipePageCache = (groups) => normalizeRecipePageGroups(groups).map((group) => ({
  ...group,
  recipes: group.recipes.slice(0, RECIPE_LIST_PAGE_SIZE),
  hasMore: group.recipeCount > RECIPE_LIST_PAGE_SIZE,
  nextOffset: group.recipeCount > RECIPE_LIST_PAGE_SIZE ? RECIPE_LIST_PAGE_SIZE : null,
  loadingMore: false
}));

Page({
  data: {
    status: 'loading',
    skeletonRows: [1, 2, 3],
    topNavigationLayout: getTopNavigationLayout(),
    topNavigationActions: [{ id: 'search', label: '搜索食谱', icon: '/assets/top-nav/recipe-search.svg' }, { id: 'manage', label: '管理食谱', icon: '/assets/top-nav/recipe-more.svg' }],
    groups: [],
    createSheetMode: '',
    createSheetVisible: false,
    createSheetHeight: '532rpx',
    createLinkFocus: false,
    createKeyboardHeight: 0,
    pendingCreateSheetMode: '',
    createLinkValue: '',
    addPlanVisible: false,
    addPlanRecipe: null,
    categoryModalVisible: false,
    categoryKeyboardFocus: false,
    categoryKeyboardHeight: 0,
    categoryDialogVisible: false,
    categoryDialogMode: '',
    categoryDialogTargetId: '',
    categoryDialogValue: '',
    categoryDialogRecipeCount: 8,
    categoryDraggingId: '',
    categoryDragTargetIndex: -1,
    categoryDragOffset: 0,
    headerShadow: false,
    categories: [],
    manageCategories: [],
    activeCategoryIndex: 0,
    activeIndicatorTop: 0,
    scrollIntoView: '',
    scrollTop: 0,
    tabBarHeight: 78,
    statusBarHeight: 44,
    navigationHeight: 44,
    navContentOffset: 8,
    navigationBottom: 88,
    contentTop: 104
  },
  sectionTops: [],
  currentScrollTop: 0,
  isProgrammaticScroll: false,
  scrollTimer: null,
  scrollFrame: null,
  categoryKeyboardTimer: null,
  categoryLongPressTimer: null,
  categoryDragStartY: 0,
  categoryDragStartIndex: -1,
  categoryDragActive: false,
  loadingRecipePages: new Set(),

  onLoad() {
    this.initializePage();
  },
  initializePage() {
    if (this.authInitialized) return;
    this.authInitialized = true;
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = Number(windowInfo.statusBarHeight || 44);
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const menuTop = Number((menuButton && menuButton.top) || (statusBarHeight + 6));
    const menuHeight = Number((menuButton && menuButton.height) || 32);
    const navContentTop = menuTop + (menuHeight - 24) / 2;
    const navigationBottom = menuTop + menuHeight + 6;
    this.setData({
      tabBarHeight: app.globalData.tabBarHeight,
      statusBarHeight,
      navigationHeight: navigationBottom - statusBarHeight,
      navContentOffset: navContentTop - statusBarHeight,
      navigationBottom,
      contentTop: navigationBottom + 16
    });
    this.loadRecipes();
    this.categoryKeyboardHandler = ({ height }) => {
      const heightValue = Number(height || 0);
      const categoryKeyboardHeight = this.data.categoryDialogVisible && this.data.categoryDialogMode !== 'delete' ? heightValue : 0;
      const createKeyboardHeight = this.createSheetClosing
        ? this.data.createKeyboardHeight
        : this.data.createSheetVisible && this.data.createSheetMode === 'link' ? heightValue : 0;
      const update = {};
      if (categoryKeyboardHeight !== this.data.categoryKeyboardHeight) update.categoryKeyboardHeight = categoryKeyboardHeight;
      if (createKeyboardHeight !== this.data.createKeyboardHeight) update.createKeyboardHeight = createKeyboardHeight;
      if (Object.keys(update).length) this.setData(update);
    };
    if (wx.onKeyboardHeightChange) wx.onKeyboardHeightChange(this.categoryKeyboardHandler);
  },
  onShow() {
    if (!this.authInitialized) this.initializePage();
    const tabBar = this.getTabBar();
    const modalVisible = this.data.createSheetVisible || this.data.addPlanVisible || this.data.categoryModalVisible || app.globalData.tabBarCoveredByModal;
    if (tabBar) tabBar.setData({ selected: 0, hidden: modalVisible });
    const restore = app.globalData.recipeListRestore;
    if (restore && this.data.status === 'success') this.restoreBrowseState(restore);
    if (app.globalData.recipeListNeedsRefresh) {
      app.globalData.recipeListNeedsRefresh = false;
      this.loadRecipes();
    }
  },
  onHide() { this.persistBrowseState(); },
  onUnload() {
    clearTimeout(this.categoryKeyboardTimer);
    clearTimeout(this.categoryLongPressTimer);
    if (wx.offKeyboardHeightChange && this.categoryKeyboardHandler) wx.offKeyboardHeightChange(this.categoryKeyboardHandler);
    this.persistBrowseState();
  },

  loadRecipes(options = {}) {
    const cachedGroups = options.skipCache ? null : readPageCache('recipe-list-pages', 'initial');
    const requestId = (this.recipeListRequestId || 0) + 1;
    this.recipeListRequestId = requestId;
    if (cachedGroups) this.applyRecipeGroups(cachedGroups, true);
    else this.setData({ status: 'loading' });
    fetchRecipeListPage().then((groups) => {
      if (requestId !== this.recipeListRequestId) return;
      writePageCache('recipe-list-pages', 'initial', initialRecipePageCache(groups));
      this.applyRecipeGroups(groups, true);
    }).catch((error) => {
      if (requestId !== this.recipeListRequestId || cachedGroups) return;
      this.setData({ status: 'error' });
      wx.showToast({ title: error.message || '菜谱加载失败', icon: 'none' });
    });
  },
  onRetryLoad() { this.loadRecipes({ skipCache: true }); },
  onTopNavigationAction(event) { (event.detail.action.id === 'search' ? this.onSearchTap : this.onManageTap).call(this); },
  applyRecipeGroups(groups, restoreBrowse = false) {
    const allGroups = normalizeRecipePageGroups(groups);
    // Empty categories remain available from the management panel, but should
    // not occupy space in the recipe catalog or sidebar.
    const displayGroups = toRecipeCatalogGroups(allGroups);
    const activeGroup = this.data.groups[this.data.activeCategoryIndex];
    let activeCategoryIndex = activeGroup ? displayGroups.findIndex((group) => group.id === activeGroup.id) : 0;
    if (activeCategoryIndex < 0) activeCategoryIndex = Math.min(this.data.activeCategoryIndex, Math.max(0, displayGroups.length - 1));
    const categories = allGroups.map((group) => ({ id: group.id, name: group.name, recipeCount: group.recipeCount }));
    const manageCategories = categories.filter(isManageableCategory);
    this.setData({
      status: displayGroups.length ? 'success' : 'empty',
      groups: displayGroups,
      categories,
      manageCategories,
      activeCategoryIndex,
      activeIndicatorTop: activeCategoryIndex * 112
    }, () => {
        this.measureSections();
        const restore = restoreBrowse ? app.globalData.recipeListRestore : null;
        if (restore) this.restoreBrowseState(restore);
      });
  },
  measureSections() {
    const query = wx.createSelectorQuery().in(this);
    query.select('#recipe-scroll').boundingClientRect();
    query.selectAll('.recipe-section').boundingClientRect();
    query.exec((result) => {
      const viewport = result[0]; const sections = result[1] || [];
      if (!viewport) return;
      this.sectionTops = sections.map((section) => section.top - viewport.top + this.currentScrollTop);
    });
  },
  onCategoryTap(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.isProgrammaticScroll = true;
    this.setData({
      activeCategoryIndex: index,
      activeIndicatorTop: index * 112,
      scrollIntoView: `category-${this.data.groups[index].id}`
    });
    clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => { this.isProgrammaticScroll = false; }, 420);
  },
  onRecipeScroll(event) {
    const scrollTop = event.detail.scrollTop;
    // Do not setData(scrollTop) here: binding scroll-top during every native
    // scroll frame causes scroll-view to be repositioned and visibly jump.
    this.currentScrollTop = scrollTop;
    if (this.isProgrammaticScroll || this.scrollFrame) return;
    this.scrollFrame = setTimeout(() => {
      this.scrollFrame = null;
      let active = 0;
      this.sectionTops.forEach((top, index) => { if (top <= scrollTop + 24) active = index; });
      if (active !== this.data.activeCategoryIndex) {
        this.setData({ activeCategoryIndex: active, activeIndicatorTop: active * 112 });
      }
    }, 16);
  },
  onImageError(event) {
    const { groupIndex, recipeIndex } = event.currentTarget.dataset;
    const path = `groups[${groupIndex}].recipes[${recipeIndex}].coverUrl`;
    const update = {};
    update[path] = '';
    this.setData(update);
  },
  onRecipeCatalogScroll(event) {
    const headerShadow = Number(event.detail.scrollTop || 0) > 0;
    if (headerShadow !== this.data.headerShadow) this.setData({ headerShadow });
  },
  onRecipeCatalogLoadMore(event) {
    const categoryId = String(event.detail && event.detail.id || '');
    const group = this.data.groups.find((item) => item.id === categoryId);
    if (!group || !group.hasMore || group.loadingMore || this.loadingRecipePages.has(categoryId)) return;
    const offset = Number(group.nextOffset);
    if (!Number.isInteger(offset) || offset < 0) return;
    this.loadingRecipePages.add(categoryId);
    const groupIndex = this.data.groups.findIndex((item) => item.id === categoryId);
    if (groupIndex < 0) {
      this.loadingRecipePages.delete(categoryId);
      return;
    }
    this.setData({ [`groups[${groupIndex}].loadingMore`]: true });
    fetchRecipeListPage({ categoryId, offset }).then((groups) => {
      const page = normalizeRecipePageGroups(groups).find((item) => item.id === categoryId);
      const currentIndex = this.data.groups.findIndex((item) => item.id === categoryId);
      if (!page || currentIndex < 0) return;
      const current = this.data.groups[currentIndex];
      const seen = new Set((current.recipes || []).map((recipe) => recipe.id));
      const recipes = (current.recipes || []).concat((page.recipes || []).filter((recipe) => !seen.has(recipe.id)));
      this.setData({
        [`groups[${currentIndex}].recipes`]: recipes,
        [`groups[${currentIndex}].recipeCount`]: page.recipeCount,
        [`groups[${currentIndex}].hasMore`]: page.hasMore,
        [`groups[${currentIndex}].nextOffset`]: page.nextOffset,
        [`groups[${currentIndex}].loadingMore`]: false
      }, () => this.measureSections());
    }).catch((error) => {
      const currentIndex = this.data.groups.findIndex((item) => item.id === categoryId);
      if (currentIndex >= 0) this.setData({ [`groups[${currentIndex}].loadingMore`]: false });
      wx.showToast({ title: error.message || '菜谱加载失败，请重试', icon: 'none' });
    }).finally(() => this.loadingRecipePages.delete(categoryId));
  },
  onSearchTap() { this.persistBrowseState(); wx.navigateTo({ url: '/pages/recipe-search/index' }); },
  onManageTap() {
    clearTimeout(this.categoryKeyboardTimer);
    this.setData({ categoryModalVisible: true, categoryKeyboardFocus: false });
  },
  noop() {},
  onOpenCreateSheet() {
    if (!requireAuthenticated()) return;
    this.setData({
      createSheetMode: 'choose',
      createSheetHeight: '532rpx',
      createSheetVisible: true,
      pendingCreateSheetMode: '',
      createLinkFocus: false,
      createKeyboardHeight: 0
    });
  },
  onCloseCreateSheet() {
    this.createSheetClosing = true;
    this.setData({ createSheetVisible: false, pendingCreateSheetMode: '', createLinkFocus: false });
  },
  onCreateSheetAfterClose() {
    const nextMode = this.data.pendingCreateSheetMode;
    if (nextMode) {
      this.setData({
        createSheetMode: nextMode,
        createSheetHeight: nextMode === 'link' ? '556rpx' : '532rpx',
        createSheetVisible: true,
        pendingCreateSheetMode: '',
        createLinkFocus: nextMode === 'link'
      });
      return;
    }
    this.createSheetClosing = false;
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.setData({ createSheetMode: '', createLinkValue: '', createLinkFocus: false, createKeyboardHeight: 0 });
  },
  switchCreateSheet(nextMode) {
    this.setData({ createSheetVisible: false, pendingCreateSheetMode: nextMode });
  },
  onChooseCreateLink() { this.switchCreateSheet('link'); },
  onCreateLinkInput(event) { this.setData({ createLinkValue: event.detail.value }); },
  onCloseCategoryModal() {
    clearTimeout(this.categoryKeyboardTimer);
    this.resetCategoryDrag();
    this.categoryKeyboardTimer = null;
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.setData({
      categoryModalVisible: false,
      categoryKeyboardFocus: false,
      categoryDialogVisible: false,
      categoryDialogMode: '',
      categoryDialogTargetId: '',
      categoryDialogValue: '',
      categoryKeyboardHeight: 0
    });
  },
  onCategoryModalAfterClose() {
    this.setData({ categoryDialogVisible: false, categoryDialogMode: '', categoryDialogTargetId: '', categoryDialogValue: '' });
  },
  onCategoryDragStart(event) {
    if (this.data.categoryDialogVisible) return;
    const touch = event.touches[0];
    const index = Number(event.currentTarget.dataset.index);
    this.categoryDragStartY = touch.clientY;
    this.categoryDragStartIndex = index;
    this.categoryDragActive = false;
    clearTimeout(this.categoryLongPressTimer);
    this.categoryLongPressTimer = setTimeout(() => {
      if (!requireAuthenticated()) return;
      const item = this.data.manageCategories[index];
      if (!item) return;
      this.categoryDragActive = true;
      this.setData({ categoryDraggingId: item.id, categoryDragTargetIndex: index, categoryDragOffset: 0 });
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    }, 500);
  },
  onCategoryDragMove(event) {
    const touch = event.touches[0];
    const deltaY = touch.clientY - this.categoryDragStartY;
    if (!this.categoryDragActive) {
      if (Math.abs(deltaY) > 8) clearTimeout(this.categoryLongPressTimer);
      return;
    }
    const rowStepPx = 40 * wx.getSystemInfoSync().windowWidth / 375;
    const lastIndex = this.data.manageCategories.length - 1;
    const finalIndex = Math.max(0, Math.min(lastIndex, this.categoryDragStartIndex + Math.round(deltaY / rowStepPx)));
    const insertionSlot = finalIndex > this.categoryDragStartIndex ? finalIndex + 1 : finalIndex;
    this.setData({ categoryDragOffset: toCategoryRpx(deltaY), categoryDragTargetIndex: insertionSlot });
  },
  async onCategoryDragEnd() {
    clearTimeout(this.categoryLongPressTimer);
    if (!this.categoryDragActive) {
      this.resetCategoryDrag();
      return;
    }
    const fromIndex = this.categoryDragStartIndex;
    const insertionSlot = this.data.categoryDragTargetIndex;
    const categories = this.data.manageCategories.slice();
    const moved = categories.splice(fromIndex, 1)[0];
    const toIndex = insertionSlot > fromIndex ? insertionSlot - 1 : insertionSlot;
    if (moved) categories.splice(Math.max(0, Math.min(toIndex, categories.length)), 0, moved);
    try {
      const groups = await Promise.resolve(reorderRecipeCategories(categories.map((item) => item.id)));
      this.applyRecipeGroups(groups);
    } catch (error) {
      wx.showToast({ title: error.message || '排序失败', icon: 'none' });
    }
    this.resetCategoryDrag();
  },
  onCategoryDragCancel() {
    clearTimeout(this.categoryLongPressTimer);
    this.resetCategoryDrag();
  },
  resetCategoryDrag() {
    clearTimeout(this.categoryLongPressTimer);
    this.categoryLongPressTimer = null;
    this.categoryDragActive = false;
    this.categoryDragStartIndex = -1;
    this.setData({ categoryDraggingId: '', categoryDragTargetIndex: -1, categoryDragOffset: 0 });
  },
  onCategoryEdit(event) {
    if (!requireAuthenticated()) return;
    const targetId = event.currentTarget.dataset.id;
    const target = this.data.manageCategories.find((item) => item.id === targetId);
    if (!target) return;
    this.setData({
      categoryDialogVisible: true,
      categoryDialogMode: 'rename',
      categoryDialogTargetId: target.id,
      categoryDialogValue: target.name,
      categoryKeyboardFocus: true
    });
  },
  onCategoryDialogInput(event) { this.setData({ categoryDialogValue: event.detail.value }); },
  onCategoryDelete(event) {
    if (!requireAuthenticated()) return;
    const targetId = event.currentTarget.dataset.id;
    const target = this.data.manageCategories.find((item) => item.id === targetId);
    if (!target) return;
    this.setData({
      categoryDialogVisible: true,
      categoryDialogMode: 'delete',
      categoryDialogTargetId: targetId,
      categoryDialogRecipeCount: target ? target.recipeCount : 0,
      categoryKeyboardFocus: false
    });
  },
  onCategoryCreate() {
    if (!requireAuthenticated()) return;
    this.setData({
      categoryDialogVisible: true,
      categoryDialogMode: 'create',
      categoryDialogTargetId: '',
      categoryDialogValue: '',
      categoryKeyboardFocus: true
    });
  },
  onCategoryDialogCancel() {
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.setData({ categoryDialogVisible: false, categoryDialogMode: '', categoryDialogTargetId: '', categoryDialogValue: '', categoryKeyboardFocus: false, categoryKeyboardHeight: 0 });
  },
  async onCategoryDialogConfirm() {
    if (!requireAuthenticated()) return;
    const { categoryDialogMode: mode, categoryDialogTargetId: targetId } = this.data;
    if ((mode === 'rename' || mode === 'delete') && !this.data.manageCategories.some((item) => item.id === targetId)) {
      this.onCategoryDialogCancel();
      return;
    }
    if (mode === 'delete') {
      try {
        this.applyRecipeGroups(await Promise.resolve(deleteRecipeCategory(targetId)));
      } catch (error) {
        wx.showToast({ title: error.message || '删除失败', icon: 'none' });
        return;
      }
      this.onCategoryDialogCancel();
      return;
    }
    const value = this.data.categoryDialogValue.trim();
    if (!value) return;
    if (value === SYSTEM_CATEGORY_NAME) {
      wx.showToast({ title: '“未分类”为系统分类', icon: 'none' });
      return;
    }
    if (mode === 'rename') {
      try {
        this.applyRecipeGroups(await Promise.resolve(renameRecipeCategory(targetId, value)));
      } catch (error) {
        wx.showToast({ title: error.message || '修改失败', icon: 'none' });
        return;
      }
    } else if (mode === 'create') {
      try {
        this.applyRecipeGroups(await Promise.resolve(createRecipeCategory(value)));
      } catch (error) {
        wx.showToast({ title: error.message || '创建失败', icon: 'none' });
        return;
      }
    }
    this.onCategoryDialogCancel();
  },
  onConfirmCreateLink() {
    if (!requireAuthenticated()) return;
    const link = this.data.createLinkValue.trim();
    if (!link) { wx.showToast({ title: '请粘贴菜谱链接', icon: 'none' }); return; }
    wx.showLoading({ title: '正在生成' });
    generateRecipeDraftFromLink(link).then(({ form }) => {
      wx.hideLoading();
      app.globalData.pendingRecognizedRecipe = form;
      this.setData({ createSheetVisible: false, createSheetMode: '', pendingCreateSheetMode: '', createLinkFocus: false, createKeyboardHeight: 0 });
      wx.navigateTo({ url: '/pages/recipe-create/index?mode=manual&source=generated-link' });
    }).catch((error) => {
      wx.hideLoading();
      wx.showToast({ title: error.message || '链接生成失败，请手动录入', icon: 'none' });
    });
  },
  onChooseCreateText() {
    this.setData({ createSheetVisible: false, createSheetMode: '', pendingCreateSheetMode: '' });
    wx.navigateTo({ url: '/pages/recipe-create/index?mode=text' });
  },
  onChooseCreateManual() {
    this.setData({ createSheetVisible: false, createSheetMode: '', pendingCreateSheetMode: '' });
    wx.navigateTo({ url: '/pages/recipe-create/index?mode=manual&source=manual' });
  },
  onChooseCreateImage() {
    if (!requireAuthenticated()) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (result) => {
        const file = result.tempFiles && result.tempFiles[0];
        const imagePath = file && file.tempFilePath;
        if (!imagePath) {
          wx.showToast({ title: '图片读取失败，请重试', icon: 'none' });
          return;
        }
        wx.showLoading({ title: '正在识别' });
        generateRecipeDraftFromImage(imagePath).then(({ form }) => {
          wx.hideLoading();
          app.globalData.pendingRecognizedRecipe = form;
          this.setData({ createSheetVisible: false, createSheetMode: '', pendingCreateSheetMode: '', createLinkFocus: false, createKeyboardHeight: 0 });
          wx.navigateTo({ url: '/pages/recipe-create/index?mode=manual&source=generated-image' });
        }).catch((error) => {
          wx.hideLoading();
          wx.showToast({ title: error.message || '图片识别失败，请手动录入', icon: 'none' });
        });
      }
    });
  },
  onRecipeTap(event) {
    const recipeId = event.detail && event.detail.id ? event.detail.id : event.currentTarget.dataset.id;
    this.persistBrowseState();
    wx.navigateTo({ url: `/pages/recipe-detail/index?id=${recipeId}` });
  },
  onAddPlan(event) {
    if (!requireAuthenticated()) return;
    const recipe = event.detail && event.detail.recipe ? event.detail.recipe : event.currentTarget.dataset.recipe;
    if (!recipe) return;
    this.pendingAddPlanToast = '';
    this.setData({ addPlanRecipe: recipe, addPlanVisible: true });
  },
  onCloseAddPlan() {
    this.pendingAddPlanToast = '';
    this.setData({ addPlanVisible: false });
  },
  onConfirmAddPlan(event) {
    if (!requireAuthenticated()) return;
    if (this.planAdding) return;
    const recipe = this.data.addPlanRecipe;
    if (!recipe) return;
    const { date, dateText, meal, mealName } = event.detail;
    this.planAdding = true;
    addRecipeToPlan(date, meal, recipe).then(() => {
      // 此入口已落库，计划页返回时只刷新数据，不再重复提交。
      app.globalData.planNeedsRefresh = true;
      this.pendingAddPlanToast = `已添加至${dateText}${mealName}计划`;
      this.setData({ addPlanVisible: false });
    }).catch((error) => {
      wx.showToast({ title: error.message || '添加计划失败，请稍后重试', icon: 'none' });
    }).then(() => { this.planAdding = false; });
  },
  onAddPlanAfterClose() {
    const title = this.pendingAddPlanToast;
    this.pendingAddPlanToast = '';
    this.setData({ addPlanRecipe: null });
    if (title) wx.showToast({ title, icon: 'none' });
  },
  persistBrowseState() { app.globalData.recipeListRestore = { scrollTop: this.currentScrollTop, activeCategoryIndex: this.data.activeCategoryIndex }; },
  restoreBrowseState({ scrollTop, activeCategoryIndex }) {
    this.isProgrammaticScroll = true;
    this.currentScrollTop = scrollTop;
    this.setData({ activeCategoryIndex, activeIndicatorTop: activeCategoryIndex * 112, scrollTop, scrollIntoView: '' });
    setTimeout(() => { this.isProgrammaticScroll = false; }, 80);
    app.globalData.recipeListRestore = null;
  }
});
