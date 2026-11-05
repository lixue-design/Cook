const {
  fetchWeekDates,
  fetchMealPlans,
  fetchWeeklyPlan,
  generateWeeklyPlan,
  addRecipeToPlan,
  addNoteToPlan,
  removeRecipeFromPlan,
  movePlanRecipe,
  clearWeekPlan,
  clearDayPlan
} = require('../../services/meal-plan-api');
const { fetchRecipeGroups, fetchRecipeDetail } = require('../../services/recipe-api');
const { formatWeekRange, weekStartForOffset } = require('../../utils/week-range');
const { publishSelectedWeek, readSelectedWeekOffset } = require('../../utils/selected-week');
const { syncShoppingList } = require('../../services/shopping-list-api');
const { requireAuthenticated } = require('../../services/auth-state');
const { getTopNavigationLayout } = require('../../utils/top-navigation');
const { readPlanDisplaySettings, getVisibleMeals } = require('../../utils/plan-display-settings');
const { RECIPE_COVER_PLACEHOLDER, flattenRecipeGroups, toCurrentRecipeListItem } = require('../../utils/recipe-list-item');
const { readPageCache, writePageCache } = require('../../utils/page-data-cache');

const toRpx = (px) => px * 750 / wx.getSystemInfoSync().windowWidth;
const normalizePlanViewMode = (value) => (value === 'day' ? 'day' : 'week');

function persistPlanViewMode(mode) {
  const planMode = normalizePlanViewMode(mode);
  getApp().globalData.planViewMode = planMode;
  try { wx.setStorageSync('cook.planViewMode', planMode); } catch (error) { /* 内存状态仍可用。 */ }
  return planMode;
}

Page({
  data: { weekDates: [], selectedDate: '', mealPlans: [], weeklyPlanDays: [], visibleMeals: [], skeletonMeals: [1, 2, 3], skeletonWeekRows: [1, 2, 3, 4, 5], planMode: 'day', dayStatus: 'loading', weeklyLoading: false, weeklyError: false, panelMotion: '', weekSliderMotion: '', weekGridMotion: '', weekRangeText: formatWeekRange(0), showReturnToday: false, dayScrolled: false, weekScrolled: false, dayScrollIntoView: '', pressedCellKey: '', selectedEmptyCellKey: '', tabBarHeight: 56, statusBarHeight: 44, navigationHeight: 44, navContentOffset: 8, dayHeaderHeight: 176, weekHeaderHeight: 88, dayContentTop: 176, weekContentTop: 88, swipeId: '', swipeOffset: 0, deletingId: '', dayDragActive: false, dayDraggingId: '', dayDragMealIndex: -1, dayDragTargetMealIndex: -1, dayDragTargetIndex: -1, dayDragIndicatorIndex: -1, dayDragOffset: 0, weekDragActive: false, weekDraggingId: '', weekDragDayIndex: -1, weekDragMealType: '', weekDragTargetDayIndex: -1, weekDragTargetMealType: '', weekDragTargetIndex: -1, weekDragIndicatorIndex: -1, weekDragOffsetX: 0, weekDragOffsetY: 0, weekFoodActionVisible: false, weekFoodActionTitle: '', weekFoodActionCanView: false, weekFoodActionActions: [], planActionVisible: false, planDateVisible: false, planDateInitialDate: '', planCreateVisible: false, planCreateDate: '', planCreateMeal: '', planMoreVisible: false, planMoreActions: [{ label: '清空本周计划', value: 'clear-week' }, { label: '显示设置', value: 'display-settings' }] },
  touchStartX: 0,
  touchStartOffset: 0,
  weekTouchStartX: 0,
  weekOffset: 0,
  weekRangeOffset: 0,
  weeklyPlanRequestId: 0,
  weekChanging: false,
  weekDateSwitching: false,
  emptyTouchStartX: 0,
  emptyTouchStartY: 0,
  emptyTouchMoved: false,
  emptyTouchCancelOnly: false,
  suppressNextPageTap: false,
  onTopNavigationTitle() { this.onPlanModeTap({ currentTarget: { dataset: { mode: this.data.planMode === 'day' ? 'week' : 'day' } } }); },
  onTopNavigationAction(event) {
    const action = event.detail.action || {};
    if (action.id === 'basket') this.onBasketTap();
    if (action.id === 'more') this.onPlanMore();
  },
  onLoad() {
    this.initializePage();
  },
  initializePage() {
    if (this.authInitialized) return;
    this.authInitialized = true;
    const app = getApp();
    const planMode = normalizePlanViewMode(app.globalData.planViewMode);
    const initialWeekOffset = readSelectedWeekOffset(app.globalData, 0);
    this.weekOffset = initialWeekOffset;
    this.weekRangeOffset = initialWeekOffset;
    publishSelectedWeek(app.globalData, initialWeekOffset);
    this.setPlanDisplaySettings(app.globalData.planDisplaySettings || readPlanDisplaySettings());
    this.displaySettingsVersion = Number(app.globalData.planDisplaySettingsVersion || 0);
    this.recipeDataVersion = Number(app.globalData.recipeDataVersion || 0);
    let windowInfo = {};
    try { windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (error) { windowInfo = {}; }
    const statusBarHeight = Number(windowInfo.statusBarHeight || 44);
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const menuTop = Number((menuButton && menuButton.top) || (statusBarHeight + 6));
    const menuHeight = Number((menuButton && menuButton.height) || 32);
    const navContentTop = menuTop + (menuHeight - 24) / 2;
    const weekHeaderHeight = menuTop + menuHeight + 6;
    const navigationHeight = weekHeaderHeight - statusBarHeight;
    const dayHeaderHeight = weekHeaderHeight + 88;
    this.setData({
      topNavigationLayout: getTopNavigationLayout(),
      topNavigationActions: [{ id: 'basket', label: '加入菜篮', icon: '/assets/top-nav/plan-more.svg' }, { id: 'more', label: '更多操作', icon: '/assets/top-nav/plan-basket.svg' }],
      planMode,
      tabBarHeight: app.globalData.tabBarHeight,
      statusBarHeight,
      navigationHeight,
      navContentOffset: navContentTop - statusBarHeight,
      dayHeaderHeight,
      weekHeaderHeight,
      dayContentTop: dayHeaderHeight,
      weekContentTop: weekHeaderHeight
    });
    fetchWeekDates(this.weekOffset).then((weekDates) => {
      const selectedDate = (weekDates.find((item) => item.today) || weekDates[0] || {}).id || '';
      this.todayDateId = selectedDate;
      this.setData({ weekDates, selectedDate, showReturnToday: false });
      // 首屏只读取当前视图的数据。默认周视图不需要先请求一天的三餐，
      // 切换到日视图时再读取所选日期，避免打开计划页时叠加两次计划请求。
      if (selectedDate && planMode === 'day') this.onDateChange(selectedDate);
    }).catch((error) => this.showPlanError(error, '日期加载失败'));
    if (planMode === 'week') {
      this.loadWeeklyPlan().catch(() => {});
    }
  },
  onShow() {
    if (!this.authInitialized) this.initializePage();
    else this.syncSelectedWeek();
    const modalVisible = this.data.planActionVisible || this.data.planDateVisible || this.data.planCreateVisible || this.data.weekFoodActionVisible || this.data.planMoreVisible || getApp().globalData.tabBarCoveredByModal;
    this.getTabBar() && this.getTabBar().setData({ selected: 1, hidden: modalVisible });
    const app = getApp();
    const displaySettingsVersion = Number(app.globalData.planDisplaySettingsVersion || 0);
    if (displaySettingsVersion !== this.displaySettingsVersion) {
      this.displaySettingsVersion = displaySettingsVersion;
      this.setPlanDisplaySettings(app.globalData.planDisplaySettings || readPlanDisplaySettings());
      if (this.data.planMode === 'day' && this.data.selectedDate) this.onDateChange(this.data.selectedDate);
      if (this.data.planMode === 'week') this.loadWeeklyPlan().catch(() => {});
    }
    const recipeDataVersion = Number(app.globalData.recipeDataVersion || 0);
    if (recipeDataVersion !== this.recipeDataVersion) this.refreshRecipeCatalog(recipeDataVersion);
    const pending = app.globalData.pendingPlanSelection;
    if (!pending) return;
    if (!requireAuthenticated()) return;
    app.globalData.pendingPlanSelection = null;
    this.persistPlanSelection(pending);
  },
  showPlanError(error, fallback) {
    wx.showToast({ title: (error && error.message) || fallback || '计划操作失败，请重试', icon: 'none' });
  },
  getActiveWeekOffset() { return this.data.planMode === 'week' ? this.weekRangeOffset : this.weekOffset; },
  syncSelectedWeek() {
    const nextWeekOffset = readSelectedWeekOffset(getApp().globalData, this.getActiveWeekOffset());
    if (nextWeekOffset === this.getActiveWeekOffset()) return;
    if (this.data.planMode === 'week') {
      this.weekRangeOffset = nextWeekOffset;
      this.setData({ weekRangeText: this.formatWeekRange(nextWeekOffset), weeklyLoading: true, weeklyError: false, selectedEmptyCellKey: '' });
      this.loadWeeklyPlan().catch(() => {});
      return;
    }
    const selectedDayIndex = Math.max(0, this.data.weekDates.findIndex((item) => item.id === this.data.selectedDate));
    this.weekOffset = nextWeekOffset;
    fetchWeekDates(nextWeekOffset).then((weekDates) => {
      const selectedDate = (weekDates[selectedDayIndex] || weekDates[0] || {}).id || '';
      this.setData({ weekDates, weekSliderMotion: '', showReturnToday: selectedDate !== this.todayDateId });
      if (selectedDate) this.onDateChange(selectedDate);
    }).catch((error) => this.showPlanError(error, '日期加载失败'));
  },
  loadWeeklyPlan() {
    const request = this.createWeeklyPlanRequest(this.weekRangeOffset);
    const cacheScope = weekStartForOffset(request.weekOffset);
    const cachedWeeklyPlanDays = readPageCache('weekly-plan', cacheScope);
    if (cachedWeeklyPlanDays) {
      this.setData({ weeklyPlanDays: this.hydrateWeeklyPlan(cachedWeeklyPlanDays), weeklyLoading: false, weeklyError: false });
    } else {
      this.setData({ weeklyLoading: true, weeklyError: false });
    }
    return fetchWeeklyPlan(request.weekOffset).then((weeklyPlanDays) => {
      if (!this.isCurrentWeeklyPlanRequest(request)) return this.data.weeklyPlanDays;
      writePageCache('weekly-plan', cacheScope, weeklyPlanDays);
      const visibleWeeklyPlanDays = this.hydrateWeeklyPlan(weeklyPlanDays);
      this.setData({ weeklyPlanDays: visibleWeeklyPlanDays, weeklyLoading: false, weeklyError: false });
      return visibleWeeklyPlanDays;
    }).catch((error) => {
      if (!this.isCurrentWeeklyPlanRequest(request)) return this.data.weeklyPlanDays;
      if (cachedWeeklyPlanDays) {
        this.setData({ weeklyLoading: false, weeklyError: false });
        return this.data.weeklyPlanDays;
      }
      this.setData({ weeklyLoading: false, weeklyError: true });
      this.showPlanError(error, '周计划加载失败');
      throw error;
    });
  },
  createWeeklyPlanRequest(weekOffset) {
    this.weeklyPlanRequestId += 1;
    return { id: this.weeklyPlanRequestId, weekOffset: Number(weekOffset) };
  },
  isCurrentWeeklyPlanRequest(request) {
    return Boolean(request)
      && request.id === this.weeklyPlanRequestId
      && request.weekOffset === Number(this.weekRangeOffset);
  },
  applyWeeklyPlanRequest(request, weeklyPlanDays, update) {
    if (!this.isCurrentWeeklyPlanRequest(request)) return false;
    this.setData({
      ...(update || {}),
      weeklyPlanDays: this.hydrateWeeklyPlan(weeklyPlanDays)
    });
    return true;
  },
  retryWeeklyPlan() { this.loadWeeklyPlan().catch(() => {}); },
  refreshRecipeCatalog(version) {
    const requestId = (this.recipeCatalogRequestId || 0) + 1;
    this.recipeCatalogRequestId = requestId;
    return fetchRecipeGroups().then((groups) => {
      if (requestId !== this.recipeCatalogRequestId) return;
      this.recipeCatalog = flattenRecipeGroups(groups);
      this.recipeDataVersion = Number(version || 0);
      const update = {};
      if (this.data.mealPlans.length) update.mealPlans = this.hydrateMealPlans(this.data.mealPlans);
      if (this.data.weeklyPlanDays.length) update.weeklyPlanDays = this.hydrateWeeklyPlan(this.data.weeklyPlanDays);
      if (Object.keys(update).length) this.setData(update);
    }).catch((error) => this.showPlanError(error, '菜谱加载失败'));
  },
  setPlanDisplaySettings(settings) {
    const visibleMeals = getVisibleMeals(settings);
    this.visibleMealTypes = visibleMeals.map((meal) => meal.id);
    this.setData({ visibleMeals });
  },
  hydrateWeeklyPlan(weeklyPlanDays) {
    const visibleMealTypes = this.visibleMealTypes || [];
    return (weeklyPlanDays || []).map((day) => ({
      ...day,
      meals: (day.meals || []).filter((meal) => visibleMealTypes.indexOf(meal.type) >= 0).map((meal) => ({
        ...meal,
        items: (meal.items || []).map((recipe) => toCurrentRecipeListItem(recipe, this.recipeCatalog))
      }))
    }));
  },
  applyPlanSelection(pending) {
    if (pending.date && this.data.planMode === 'week') {
      const weeklyPlanDays = JSON.parse(JSON.stringify(this.data.weeklyPlanDays));
      const day = weeklyPlanDays.find((item) => item.id === pending.date);
      const meal = day && day.meals.find((item) => item.type === pending.meal);
      if (meal) {
        if (pending.type === 'note' && pending.note) meal.items.push({ id: `note-${Date.now()}`, title: pending.note });
        if (pending.type === 'recipes') {
          const existingIds = meal.items.map((item) => item.id);
          pending.recipes.forEach((recipe) => { if (existingIds.indexOf(recipe.id) < 0) meal.items.push({ id: recipe.id, title: recipe.title }); });
        }
        this.setData({ weeklyPlanDays: this.syncWeeklyEmptySlots(weeklyPlanDays) });
      }
      return;
    }
    if (pending.date && pending.date !== this.data.selectedDate) return;
    const mealPlans = JSON.parse(JSON.stringify(this.data.mealPlans));
    const meal = mealPlans.find((item) => item.id === pending.meal || item.name === pending.mealName);
    if (meal) {
      if (pending.type === 'note' && pending.note) meal.recipes.push({ id: `note-${Date.now()}`, title: pending.note, coverUrl: '', source: 'custom' });
      if (pending.type === 'recipes') {
        const existingIds = meal.recipes.map((recipe) => recipe.id);
        pending.recipes.forEach((recipe) => { if (existingIds.indexOf(recipe.id) < 0) meal.recipes.push({ ...recipe, source: 'recipe' }); });
      }
      this.setData({ mealPlans: this.hydrateMealPlans(mealPlans) });
    }
  },
  syncWeeklyEmptySlots(weeklyPlanDays) {
    weeklyPlanDays.forEach((day) => {
      const meals = Array.isArray(day.meals) ? day.meals : [];
      let rowCapacity = 0;
      meals.forEach((meal) => { rowCapacity = Math.max(rowCapacity, meal.items.length); });
      const targetCapacity = rowCapacity + 1;
      meals.forEach((meal) => {
        meal.emptySlots = [];
        for (let slotIndex = meal.items.length; slotIndex < targetCapacity; slotIndex += 1) {
          meal.emptySlots.push({ id: `${meal.type}-empty-${slotIndex}` });
        }
      });
    });
    return weeklyPlanDays;
  },
  refreshWeeklyPlanIngredients(weeklyPlanDays) {
    const detailsByRecipeId = {};
    const readRecipe = (recipeId) => {
      if (!detailsByRecipeId[recipeId]) detailsByRecipeId[recipeId] = fetchRecipeDetail(recipeId);
      return detailsByRecipeId[recipeId];
    };
    return Promise.all((weeklyPlanDays || []).map((day) => Promise.all((day.meals || []).map((meal) => (
      Promise.all((meal.items || []).map((recipe) => {
        const recipeId = String(recipe && recipe.recipeId || '').trim();
        if (!recipeId) return Promise.resolve(recipe);
        return readRecipe(recipeId).then((detail) => (
          detail ? {
            ...recipe,
            ingredients: Array.isArray(detail.ingredients) ? detail.ingredients : [],
            mainIngredients: '',
            sideIngredients: '',
            seasonings: ''
          } : recipe
        ));
      })).then((items) => ({ ...meal, items }))
    ))).then((meals) => ({ ...day, meals }))));
  },
  onUnload() {
    clearTimeout(this.dayLongPressTimer);
    clearTimeout(this.weekFoodLongPressTimer);
    clearTimeout(this.suppressWeekFoodTapTimer);
    clearTimeout(this.suppressRecipeTapTimer);
    clearTimeout(this.panelMotionTimer);
  },
  onDateTap(event) { this.onDateChange(event.currentTarget.dataset.date); },
  onPlanModeTap(event) {
    const planMode = normalizePlanViewMode(event.currentTarget.dataset.mode);
    if (planMode === this.data.planMode) return;
    clearTimeout(this.dayLongPressTimer);
    clearTimeout(this.weekFoodLongPressTimer);
    this.resetDayDrag();
    this.resetWeekDrag();
    const selectedDayIndex = Math.max(0, this.data.weekDates.findIndex((item) => item.id === this.data.selectedDate));
    const weeklyRangeChanged = planMode === 'week' && this.weekRangeOffset !== this.weekOffset;
    const dailyRangeChanged = planMode === 'day' && this.weekOffset !== this.weekRangeOffset;
    if (weeklyRangeChanged) this.weekRangeOffset = this.weekOffset;
    if (dailyRangeChanged) this.weekOffset = this.weekRangeOffset;
    publishSelectedWeek(getApp().globalData, planMode === 'week' ? this.weekRangeOffset : this.weekOffset);
    persistPlanViewMode(planMode);
    this.setData({ planMode, panelMotion: 'plan-panel--enter', swipeId: '', swipeOffset: 0, weekScrolled: false, selectedEmptyCellKey: '', weekRangeText: this.formatWeekRange(this.weekRangeOffset), dayStatus: dailyRangeChanged ? 'loading' : this.data.dayStatus });
    clearTimeout(this.panelMotionTimer);
    this.panelMotionTimer = setTimeout(() => this.setData({ panelMotion: '' }), 220);
    if (planMode === 'week' && (weeklyRangeChanged || !this.data.weeklyPlanDays.length)) {
      this.loadWeeklyPlan().catch(() => {});
    }
    if (planMode === 'day' && (dailyRangeChanged || !this.data.mealPlans.length)) {
      fetchWeekDates(this.weekOffset).then((weekDates) => {
        const selectedDate = weekDates.some((item) => item.id === this.data.selectedDate)
          ? this.data.selectedDate
          : ((weekDates[selectedDayIndex] || weekDates[0] || {}).id || '');
        this.setData({ weekDates });
        if (selectedDate) this.onDateChange(selectedDate);
      }).catch((error) => {
        this.setData({ dayStatus: 'error' });
        this.showPlanError(error, '日期加载失败');
      });
    }
  },
  onWeekTouchStart(event) { this.weekTouchStartX = event.touches[0].clientX; },
  onWeekTouchEnd(event) {
    const delta = event.changedTouches[0].clientX - this.weekTouchStartX;
    if (Math.abs(delta) < 36 || this.weekChanging) return;
    this.changeWeek(delta < 0 ? 1 : -1);
  },
  changeWeek(direction) {
    this.weekChanging = true;
    const selectedIndex = Math.max(0, this.data.weekDates.findIndex((item) => item.id === this.data.selectedDate));
    const leaveClass = direction > 0 ? 'week-row--leave-left' : 'week-row--leave-right';
    const enterClass = direction > 0 ? 'week-row--enter-right' : 'week-row--enter-left';
    this.setData({ weekSliderMotion: leaveClass });
    setTimeout(() => {
      this.weekOffset += direction;
      publishSelectedWeek(getApp().globalData, this.weekOffset);
      fetchWeekDates(this.weekOffset).then((weekDates) => {
        const selectedDate = weekDates[selectedIndex].id;
        this.setData({ weekDates, selectedDate, showReturnToday: selectedDate !== this.todayDateId, weekSliderMotion: enterClass, dayStatus: 'loading' });
        this.resetDayScroll();
        fetchMealPlans(selectedDate)
          .then((mealPlans) => this.setData({ mealPlans: this.hydrateMealPlans(mealPlans), dayStatus: 'success' }))
          .catch((error) => {
            this.setData({ dayStatus: 'error' });
            this.showPlanError(error, '日计划加载失败');
          });
        setTimeout(() => {
          this.setData({ weekSliderMotion: '' });
          this.weekChanging = false;
        }, 200);
      });
    }, 120);
  },
  onGridDateTap(event) {
    const date = event.currentTarget.dataset.date;
    if (!date || this.weekDateSwitching || this.weekRangeChanging) return;
    this.weekDateSwitching = true;
    const targetWeekOffset = this.weekRangeOffset;
    fetchWeekDates(targetWeekOffset).then((weekDates) => {
      if (!weekDates.some((item) => item.id === date)) throw new Error('目标日期不在当前周内');
      this.weekOffset = targetWeekOffset;
      publishSelectedWeek(getApp().globalData, this.weekOffset);
      persistPlanViewMode('day');
      this.setData({
        planMode: 'day',
        weekDates,
        panelMotion: 'plan-panel--enter',
        swipeId: '',
        swipeOffset: 0,
        weekScrolled: false,
        selectedEmptyCellKey: ''
      });
      clearTimeout(this.panelMotionTimer);
      this.panelMotionTimer = setTimeout(() => this.setData({ panelMotion: '' }), 220);
      this.onDateChange(date);
    }).catch((error) => this.showPlanError(error, '切换日期失败'))
      .then(() => { this.weekDateSwitching = false; });
  },
  onEmptySlotTouchStart(event) {
    if (this.data.selectedEmptyCellKey) {
      this.emptyTouchCancelOnly = true;
      this.suppressNextPageTap = true;
      this.setData({ selectedEmptyCellKey: '', pressedCellKey: '' });
      return;
    }
    this.emptyTouchCancelOnly = false;
    const touch = event.touches[0];
    this.emptyTouchStartX = touch.clientX;
    this.emptyTouchStartY = touch.clientY;
    this.emptyTouchMoved = false;
    this.setData({ pressedCellKey: event.currentTarget.dataset.key });
  },
  onEmptySlotTouchMove(event) {
    const touch = event.touches[0];
    const deltaX = touch.clientX - this.emptyTouchStartX;
    const deltaY = touch.clientY - this.emptyTouchStartY;
    if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
      this.emptyTouchMoved = true;
      if (this.data.pressedCellKey) this.setData({ pressedCellKey: '' });
    }
  },
  onEmptySlotTouchCancel() {
    this.emptyTouchMoved = true;
    this.emptyTouchCancelOnly = false;
    this.suppressNextPageTap = false;
    this.setData({ pressedCellKey: '' });
  },
  onEmptySlotTouchEnd(event) {
    if (this.emptyTouchCancelOnly) {
      this.emptyTouchCancelOnly = false;
      this.setData({ pressedCellKey: '' });
      return;
    }
    const { key } = event.currentTarget.dataset;
    if (this.emptyTouchMoved || this.data.pressedCellKey !== key) {
      this.setData({ pressedCellKey: '' });
      return;
    }
    this.suppressNextPageTap = true;
    this.setData({ pressedCellKey: '', selectedEmptyCellKey: key });
  },
  onPageTap() {
    if (this.suppressNextPageTap) {
      this.suppressNextPageTap = false;
      return;
    }
    if (this.data.selectedEmptyCellKey) this.setData({ selectedEmptyCellKey: '', pressedCellKey: '' });
  },
  onGridAddTap(event) {
    const { date, meal } = event.currentTarget.dataset;
    this.openPlanCreate(date, meal);
  },
  formatWeekRange(offset) {
    return formatWeekRange(offset);
  },
  onWeekRangeChange(event) {
    const direction = Number(event.detail.direction);
    if (!direction || this.weekRangeChanging) return;
    this.weekRangeChanging = true;
    const leave = direction > 0 ? 'week-grid--leave-left' : 'week-grid--leave-right';
    const enter = direction > 0 ? 'week-grid--enter-right' : 'week-grid--enter-left';
    this.setData({ weekGridMotion: leave });
    setTimeout(() => {
      this.weekRangeOffset += direction;
      publishSelectedWeek(getApp().globalData, this.weekRangeOffset);
      this.setData({ weeklyError: false });
      fetchWeeklyPlan(this.weekRangeOffset).then((weeklyPlanDays) => {
        this.setData({ weeklyPlanDays: this.hydrateWeeklyPlan(weeklyPlanDays), weekRangeText: this.formatWeekRange(this.weekRangeOffset), weekGridMotion: enter, selectedEmptyCellKey: '', weeklyError: false });
        setTimeout(() => {
          this.setData({ weekGridMotion: '' });
          this.weekRangeChanging = false;
        }, 200);
      }).catch((error) => {
        this.weekRangeOffset -= direction;
        publishSelectedWeek(getApp().globalData, this.weekRangeOffset);
        this.weekRangeChanging = false;
        this.setData({ weekGridMotion: '', weeklyError: true });
        this.showPlanError(error, '周计划加载失败');
      });
    }, 120);
  },
  onWeekRangeReset() {
    if (this.weekRangeChanging) return;
    this.weekRangeChanging = true;
    this.setData({ weeklyLoading: true, weeklyError: false, selectedEmptyCellKey: '' });
    fetchWeeklyPlan(0).then((weeklyPlanDays) => {
      this.weekRangeOffset = 0;
      publishSelectedWeek(getApp().globalData, this.weekRangeOffset);
      this.setData({ weeklyPlanDays: this.hydrateWeeklyPlan(weeklyPlanDays), weekRangeText: this.formatWeekRange(0), weeklyLoading: false, weeklyError: false });
      this.weekRangeChanging = false;
    }).catch(() => {
      this.setData({ weeklyLoading: false, weeklyError: true });
      this.weekRangeChanging = false;
      this.showPlanError(null, '周计划加载失败');
    });
  },
  onBasketTap() {
    if (!requireAuthenticated()) return;
    if (this.basketAdding) return;
    this.basketAdding = true;
    const isWeekMode = this.data.planMode === 'week';
    const weekOffset = isWeekMode ? this.weekRangeOffset : this.weekOffset;
    fetchWeeklyPlan(weekOffset)
      .then((weeklyPlanDays) => this.refreshWeeklyPlanIngredients(weeklyPlanDays))
      .then((weeklyPlanDays) => syncShoppingList(weekStartForOffset(weekOffset), weeklyPlanDays))
      .then(() => {
        getApp().globalData.shoppingBasketNeedsRefresh = true;
        wx.showToast({ title: '已加入本周菜篮', icon: 'none' });
      }).catch(() => {
      wx.showToast({ title: '同步失败，原菜篮已保留', icon: 'none' });
    }).then(() => { this.basketAdding = false; });
  },
  onPlanMore() {
    const isDayPlan = this.data.planMode === 'day';
    this.setData({
      planMoreVisible: true,
      planMoreActions: [
        { label: isDayPlan ? '清空当天计划' : '清空本周计划', value: isDayPlan ? 'clear-day' : 'clear-week' },
        { label: '显示设置', value: 'display-settings' }
      ]
    });
  },
  onPlanMoreClose() { this.pendingPlanMoreAction = ''; this.setData({ planMoreVisible: false }); },
  onPlanMoreSelect(event) {
    this.pendingPlanMoreAction = event.detail.value || '';
    this.setData({ planMoreVisible: false });
  },
  onPlanMoreAfterClose() {
    const action = this.pendingPlanMoreAction;
    this.pendingPlanMoreAction = '';
    if (action === 'display-settings') {
      wx.navigateTo({ url: '/pages/plan-display-settings/index' });
      return;
    }
    if (action === 'clear-day') this.confirmClearCurrentDayPlan();
    if (action === 'clear-week') this.confirmClearCurrentWeekPlan();
  },
  confirmClearCurrentWeekPlan() {
    if (!requireAuthenticated()) return;
    wx.showModal({
      title: '清空本周计划？',
      content: '清空后，本周早午晚餐中的菜品将被移除。',
      confirmText: '清空',
      success: ({ confirm }) => { if (confirm) this.clearCurrentWeekPlan(); }
    });
  },
  clearCurrentWeekPlan() {
    if (this.weekClearing) return;
    this.weekClearing = true;
    const activeWeekOffset = this.getActiveWeekOffset();
    // Immediately reflect a confirmed clear. The server request remains the source
    // of truth and restores data if it fails, but the page need not wait for a
    // whole-month read before showing the cleared week.
    this.createWeeklyPlanRequest(this.weekRangeOffset);
    const previousMealPlans = this.data.mealPlans;
    const previousWeeklyPlanDays = this.data.weeklyPlanDays;
    const clearedWeeklyPlanDays = this.syncWeeklyEmptySlots((previousWeeklyPlanDays || []).map((day) => ({
      ...day,
      meals: (day.meals || []).map((meal) => ({ ...meal, items: [] }))
    })));
    const clearedMealPlans = (previousMealPlans || []).map((meal) => ({ ...meal, recipes: [] }));
    this.setData({
      mealPlans: clearedMealPlans,
      weeklyPlanDays: clearedWeeklyPlanDays,
      dayStatus: 'success',
      weeklyLoading: false,
      weeklyError: false,
      selectedEmptyCellKey: ''
    });
    this.weekClearPromise = clearWeekPlan(activeWeekOffset);
    this.weekClearPromise.then((weeklyPlanDays) => {
      this.setData({ weeklyPlanDays: this.hydrateWeeklyPlan(weeklyPlanDays), dayStatus: 'success' });
      wx.showToast({ title: '已清空本周计划', icon: 'none' });
    }).catch((error) => {
      // A failed clear must not leave an optimistic empty screen behind.
      return Promise.all([
        fetchMealPlans(this.data.selectedDate),
        fetchWeeklyPlan(this.weekRangeOffset)
      ]).then(([mealPlans, weeklyPlanDays]) => {
        this.setData({ mealPlans: this.hydrateMealPlans(mealPlans), weeklyPlanDays: this.hydrateWeeklyPlan(weeklyPlanDays), dayStatus: 'success' });
      }).catch(() => {
        this.setData({ mealPlans: previousMealPlans, weeklyPlanDays: previousWeeklyPlanDays, dayStatus: 'success' });
      }).then(() => this.showPlanError(error, '清空本周计划失败'));
    }).then(() => {
      this.weekClearing = false;
      this.weekClearPromise = null;
    });
  },
  confirmClearCurrentDayPlan() {
    if (!requireAuthenticated()) return;
    wx.showModal({
      title: '清空当天计划？',
      content: '清空后，当天早午晚餐中的菜品将被移除。',
      confirmText: '清空',
      success: ({ confirm }) => { if (confirm) this.clearCurrentDayPlan(); }
    });
  },
  clearCurrentDayPlan() {
    const selectedDate = this.data.selectedDate;
    if (!selectedDate || this.dayClearing) return;
    this.dayClearing = true;
    clearDayPlan(selectedDate).then(() => Promise.all([
      fetchMealPlans(selectedDate),
      fetchWeeklyPlan(this.weekRangeOffset)
    ])).then(([mealPlans, weeklyPlanDays]) => {
      this.setData({ mealPlans: this.hydrateMealPlans(mealPlans), weeklyPlanDays: this.hydrateWeeklyPlan(weeklyPlanDays), dayStatus: 'success' });
      wx.showToast({ title: '已清空当天计划', icon: 'none' });
    }).catch((error) => this.showPlanError(error, '清空当天计划失败'))
      .then(() => { this.dayClearing = false; });
  },
  onDateChange(date) {
    this.resetDayScroll();
    const cachedMealPlans = readPageCache('daily-plan', date);
    this.setData({
      selectedDate: date,
      showReturnToday: Boolean(this.todayDateId && date !== this.todayDateId),
      swipeId: '',
      swipeOffset: 0,
      mealPlans: cachedMealPlans ? this.hydrateMealPlans(cachedMealPlans) : this.data.mealPlans,
      dayStatus: cachedMealPlans ? 'success' : 'loading'
    });
    return fetchMealPlans(date).then((mealPlans) => {
      writePageCache('daily-plan', date, mealPlans);
      this.setData({ mealPlans: this.hydrateMealPlans(mealPlans), swipeId: '', swipeOffset: 0, dayStatus: 'success' });
    }).catch((error) => {
      if (cachedMealPlans) return this.data.mealPlans;
      this.setData({ dayStatus: 'error' });
      this.showPlanError(error, '日计划加载失败');
    });
  },
  onReturnToday() {
    if (this.returningToday || this.weekChanging) return;
    this.returningToday = true;
    fetchWeekDates(0).then((weekDates) => {
      const selectedDate = (weekDates.find((item) => item.today) || weekDates[0] || {}).id || '';
      this.weekOffset = 0;
      publishSelectedWeek(getApp().globalData, this.weekOffset);
      this.todayDateId = selectedDate;
      this.setData({ weekDates, weekSliderMotion: '', showReturnToday: false });
      if (selectedDate) this.onDateChange(selectedDate);
      this.returningToday = false;
    }).catch((error) => {
      this.returningToday = false;
      this.showPlanError(error, '返回今天失败');
    });
  },
  retryDayPlan() {
    if (this.data.selectedDate) this.onDateChange(this.data.selectedDate);
  },
  resetDayScroll() {
    this.dayCurrentScrollTop = 0;
    this.setData({ dayScrollIntoView: '', dayScrolled: false }, () => {
      this.setData({ dayScrollIntoView: 'day-plan-top' });
    });
  },
  hydrateMealPlans(mealPlans) {
    const catalog = this.recipeCatalog || [];
    const visibleMealTypes = this.visibleMealTypes || [];
    return mealPlans.filter((meal) => visibleMealTypes.indexOf(meal.id) >= 0).map((meal) => ({
      ...meal,
      recipes: meal.recipes.map((recipe, recipeIndex) => {
        return {
          ...toCurrentRecipeListItem(recipe, catalog),
          planKey: `${meal.id}-${recipeIndex}`
        };
      })
    }));
  },
  onAddMeal(event) {
    const meal = event.currentTarget.dataset.meal || '';
    this.openPlanCreate(this.data.selectedDate, meal);
  },
  onFloatingAddTap() {
    if (!requireAuthenticated()) return;
    this.planFlowNext = '';
    this.planFlowTarget = null;
    this.setData({ planActionVisible: true });
  },
  onPlanActionClose() {
    this.planActionNext = '';
    this.setData({ planActionVisible: false });
  },
  onPlanActionChooseAI() {
    this.planActionNext = 'generate';
    this.setData({ planActionVisible: false });
  },
  onPlanActionChooseManual() {
    this.planActionNext = 'manual';
    this.setData({ planActionVisible: false });
  },
  onPlanActionAfterClose() {
    const next = this.planActionNext;
    this.planActionNext = '';
    if (next === 'generate') {
      this.onGenerateWeekPlan();
      return;
    }
    if (next !== 'manual') return;
    this.setData({
      planDateVisible: true,
      planDateInitialDate: this.data.selectedDate,
      planCreateVisible: false
    });
  },
  onPlanDateClose() {
    this.planFlowNext = '';
    this.setData({ planDateVisible: false });
  },
  onPlanDateConfirm(event) {
    this.planFlowTarget = event.detail;
    this.planFlowNext = 'recipes';
    this.setData({ planDateVisible: false });
  },
  onPlanDateAfterClose() {
    const next = this.planFlowNext;
    this.planFlowNext = '';
    if (next === 'recipes' && this.planFlowTarget) {
      this.openPlanCreate(this.planFlowTarget.date, this.planFlowTarget.meal);
      return;
    }
    this.planFlowTarget = null;
  },
  openPlanCreate(date, meal) {
    if (!requireAuthenticated()) return;
    const targetMeal = meal || 'breakfast';
    this.setData({
      selectedEmptyCellKey: '',
      pressedCellKey: '',
      planCreateDate: date || this.data.selectedDate,
      planCreateMeal: targetMeal,
      planCreateVisible: true
    });
  },
  onPlanCreateClose() {
    this.planFlowNext = '';
    this.planFlowTarget = null;
    this.setData({ planCreateVisible: false });
  },
  onPlanCreateAfterClose() {
    this.planFlowTarget = null;
    this.setData({ planCreateDate: '', planCreateMeal: '' });
  },
  onPlanCreateConfirm(event) {
    if (!requireAuthenticated()) return;
    const selection = event.detail;
    this.persistPlanSelection(selection).then(() => {
      this.setData({ planCreateVisible: false });
    }).catch((error) => this.showPlanError(error, '添加计划失败'));
  },
  persistPlanSelection(selection) {
    if (!selection) return Promise.resolve();
    // Invalidate any load that started before this save. Its snapshot may not
    // include the newly added plan item and must not overwrite this refresh.
    const weeklyPlanRequest = this.createWeeklyPlanRequest(this.weekRangeOffset);
    const shouldSelectAddedDate = this.data.planMode === 'week' && Boolean(selection.date);
    const refreshPlanViews = () => Promise.all([
      fetchMealPlans(selection.date).then((mealPlans) => {
        if (selection.date === this.data.selectedDate || shouldSelectAddedDate) {
          this.setData({
            ...(shouldSelectAddedDate ? {
              selectedDate: selection.date,
              showReturnToday: Boolean(this.todayDateId && selection.date !== this.todayDateId)
            } : {}),
            mealPlans: this.hydrateMealPlans(mealPlans),
            dayStatus: 'success'
          });
        }
      }),
      fetchWeeklyPlan(weeklyPlanRequest.weekOffset).then((weeklyPlanDays) => (
        this.applyWeeklyPlanRequest(weeklyPlanRequest, weeklyPlanDays)
      ))
    ]);
    if (selection.type === 'note') {
      const note = String(selection.note || '').trim();
      if (!note) return Promise.resolve();
      return addNoteToPlan(selection.date, selection.meal, note).then(refreshPlanViews);
    }
    if (selection.type !== 'recipes') return Promise.resolve();
    const recipes = Array.isArray(selection.recipes) ? selection.recipes : [];
    return Promise.all(recipes.map((recipe, index) => (
      addRecipeToPlan(selection.date, selection.meal, recipe, index)
    ))).then(refreshPlanViews);
  },
  onGenerateWeekPlan() {
    if (!requireAuthenticated()) return;
    if (this.weekClearing) {
      wx.showToast({ title: '正在清空本周计划，请稍候', icon: 'none' });
      return;
    }
    if (this.weekGenerating) return;
    const targetWeekOffset = this.data.planMode === 'week' ? this.weekRangeOffset : this.weekOffset;
    if (this.data.planMode !== 'week') {
      this.weekRangeOffset = targetWeekOffset;
      persistPlanViewMode('week');
      this.setData({
        planMode: 'week',
        weekRangeText: this.formatWeekRange(targetWeekOffset),
        selectedEmptyCellKey: ''
      });
    }
    const run = (overwrite) => {
      this.weekGenerating = true;
      this.setData({ weeklyLoading: true, weeklyError: false });
      generateWeeklyPlan(targetWeekOffset, overwrite).then(({ days, warnings }) => {
        this.setData({ weeklyPlanDays: this.hydrateWeeklyPlan(days), weeklyLoading: false, weeklyError: false });
        const selectedDate = this.data.selectedDate;
        const shouldRefreshDay = selectedDate && days.some((day) => day.id === selectedDate || day.date === selectedDate);
        const refreshDay = shouldRefreshDay
          ? fetchMealPlans(selectedDate).then((mealPlans) => {
            this.setData({ mealPlans: this.hydrateMealPlans(mealPlans), dayStatus: 'success' });
          }).catch((error) => {
            this.setData({ dayStatus: 'error' });
            this.showPlanError(error, '日计划加载失败');
          })
          : Promise.resolve();
        return refreshDay.then(() => {
          this.weekGenerating = false;
          if (warnings.length) {
            wx.showModal({
              title: '生成提示',
              content: warnings.map((warning) => warning.message).join('\n'),
              showCancel: false
            });
          } else {
            wx.showToast({ title: '本周计划已生成', icon: 'success' });
          }
        });
      }).catch((error) => {
        this.setData({ weeklyLoading: false });
        this.weekGenerating = false;
        if (error && error.code === 'CONFLICT' && !overwrite) {
          wx.showModal({
            title: '覆盖本周计划？',
            content: '本周已有计划，继续生成会覆盖现有安排。',
            confirmText: '覆盖生成',
            success: ({ confirm }) => { if (confirm) run(true); }
          });
          return;
        }
        this.showPlanError(error, '周计划生成失败');
      });
    };
    run(false);
  },
  onRecipeTap(event) {
    if (this.suppressRecipeTap) {
      this.suppressRecipeTap = false;
      clearTimeout(this.suppressRecipeTapTimer);
      return;
    }
    const { source, recipeId } = event.currentTarget.dataset;
    if (source !== 'recipe') return;
    const recipe = (this.recipeCatalog || []).find((item) => item.id === recipeId);
    if (!recipe) {
      wx.showToast({ title: '菜谱已不存在', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/recipe-detail/index?id=${recipe.id}` });
  },
  onCardTouchStart(event) {
    const touch = event.touches[0];
    const { id, planKey, mealIndex, recipeIndex } = event.currentTarget.dataset;
    this.touchStartX = touch.clientX;
    this.dayTouchStartY = touch.clientY;
    this.dayTouchWasVertical = false;
    this.dayGestureDirection = '';
    this.touchStartOffset = this.data.swipeId === planKey ? this.data.swipeOffset : 0;
    this.dayDragMealIndex = Number(mealIndex);
    this.dayDragStartIndex = Number(recipeIndex);
    this.dayTouchMoved = false;
    this.dayDragActive = false;
    clearTimeout(this.dayLongPressTimer);
    this.dayLongPressTimer = setTimeout(() => {
      if (this.dayTouchMoved) return;
      if (!requireAuthenticated()) return;
      this.dayDragActive = true;
      this.suppressRecipeTap = true;
      this.setData({
        dayDragActive: true,
        dayDraggingId: id,
        dayDragMealIndex: this.dayDragMealIndex,
        dayDragTargetMealIndex: this.dayDragMealIndex,
        dayDragTargetIndex: this.dayDragStartIndex,
        dayDragIndicatorIndex: this.dayDragStartIndex,
        dayDragOffset: 0,
        swipeId: '',
        swipeOffset: 0
      }, () => this.measureDayDropZones());
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    }, 500);
  },
  measureDayDropZones() {
    const query = wx.createSelectorQuery().in(this);
    query.selectAll('.meal-section').boundingClientRect();
    query.selectAll('.swipe-area').boundingClientRect();
    query.exec((result) => {
      this.dayMealRects = result[0] || [];
      this.dayRecipeRects = result[1] || [];
    });
  },
  updateDayDropTarget(clientY) {
    const mealRects = this.dayMealRects || [];
    if (!mealRects.length) return;
    let targetMealIndex = 0;
    let shortestDistance = Infinity;
    mealRects.forEach((rect, mealIndex) => {
      const distance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      if (distance < shortestDistance) {
        shortestDistance = distance;
        targetMealIndex = mealIndex;
      }
    });
    const recipeRects = (this.dayRecipeRects || [])
      .filter((rect) => Number(rect.dataset.mealIndex) === targetMealIndex
        && !(targetMealIndex === this.dayDragMealIndex && Number(rect.dataset.recipeIndex) === this.dayDragStartIndex))
      .sort((left, right) => left.top - right.top);
    let targetIndex = 0;
    recipeRects.forEach((rect) => {
      if (clientY >= rect.top + rect.height / 2) targetIndex += 1;
    });
    const indicatorIndex = targetIndex
      + (targetMealIndex === this.dayDragMealIndex && targetIndex > this.dayDragStartIndex ? 1 : 0);
    this.setData({ dayDragTargetMealIndex: targetMealIndex, dayDragTargetIndex: targetIndex, dayDragIndicatorIndex: indicatorIndex });
  },
  onCardTouchMove(event) {
    if (!this.dayDragActive && this.dayGestureDirection === 'vertical') return;
    const { planKey } = event.currentTarget.dataset;
    const touch = event.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.dayTouchStartY;
    if (!this.dayDragActive) {
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      if (absX > 8 || absY > 8) {
        this.dayTouchMoved = true;
        clearTimeout(this.dayLongPressTimer);
      }

      if (!this.dayGestureDirection && (absX > 8 || absY > 8)) {
        // An upward component wins over a simultaneous left swipe so the
        // scroll-view keeps native control of diagonal scrolling gestures.
        this.dayGestureDirection = deltaY < -6 || absY >= absX ? 'vertical' : 'horizontal';
      }

      if (this.dayGestureDirection === 'horizontal' && deltaY < -6) {
        this.dayGestureDirection = 'vertical';
      }

      if (this.dayGestureDirection === 'vertical') {
        this.dayTouchWasVertical = true;
        if (this.data.swipeId || this.data.swipeOffset) this.setData({ swipeId: '', swipeOffset: 0 });
        return;
      }

      if (this.dayGestureDirection !== 'horizontal') return;
      const swipeOffset = Math.max(0, Math.min(152, this.touchStartOffset - toRpx(deltaX)));
      if (planKey !== this.data.swipeId || Math.abs(swipeOffset - this.data.swipeOffset) >= 1) {
        this.setData({ swipeId: planKey, swipeOffset });
      }
      return;
    }
    this.updateDayDropTarget(touch.clientY);
    this.setData({ dayDragOffset: toRpx(deltaY) });
  },
  onCardTouchEnd(event) {
    clearTimeout(this.dayLongPressTimer);
    if (this.dayDragActive) {
      const mealPlans = JSON.parse(JSON.stringify(this.data.mealPlans));
      const sourceRecipes = mealPlans[this.dayDragMealIndex].recipes;
      const moved = sourceRecipes.splice(this.dayDragStartIndex, 1)[0];
      const targetMealIndex = this.data.dayDragTargetMealIndex;
      if (moved && mealPlans[targetMealIndex]) {
        mealPlans[targetMealIndex].recipes.splice(this.data.dayDragTargetIndex, 0, moved);
      }
      this.setData({ mealPlans });
      if (moved && mealPlans[targetMealIndex]) {
        movePlanRecipe(
          moved.id,
          this.data.selectedDate,
          mealPlans[targetMealIndex].id,
          this.data.dayDragTargetIndex
        ).then(() => Promise.all([
          fetchMealPlans(this.data.selectedDate),
          fetchWeeklyPlan(this.weekRangeOffset)
        ])).then(([freshPlans, freshDays]) => {
          this.setData({ mealPlans: this.hydrateMealPlans(freshPlans), weeklyPlanDays: this.hydrateWeeklyPlan(freshDays) });
        }).catch((error) => {
          Promise.all([
            fetchMealPlans(this.data.selectedDate),
            fetchWeeklyPlan(this.weekRangeOffset)
          ]).then(([freshPlans, freshDays]) => {
            this.setData({ mealPlans: this.hydrateMealPlans(freshPlans), weeklyPlanDays: this.hydrateWeeklyPlan(freshDays) });
          }).catch(() => {});
          this.showPlanError(error, '调整计划失败');
        });
      }
      this.resetDayDrag();
      clearTimeout(this.suppressRecipeTapTimer);
      this.suppressRecipeTapTimer = setTimeout(() => { this.suppressRecipeTap = false; }, 350);
      return;
    }
    if (this.dayTouchWasVertical) {
      this.dayTouchWasVertical = false;
      this.dayGestureDirection = '';
      return;
    }
    const { planKey } = event.currentTarget.dataset;
    if (this.dayGestureDirection !== 'horizontal') {
      this.dayGestureDirection = '';
      return;
    }
    const opened = this.data.swipeOffset > 76;
    this.setData({ swipeId: opened ? planKey : '', swipeOffset: opened ? 152 : 0 });
    this.dayGestureDirection = '';
  },
  onCardTouchCancel() {
    clearTimeout(this.dayLongPressTimer);
    this.dayGestureDirection = '';
    this.dayTouchWasVertical = false;
    if (this.dayDragActive) this.resetDayDrag();
  },
  onDayScroll(event) {
    const scrollTop = Number(event.detail.scrollTop || 0);
    this.dayCurrentScrollTop = scrollTop;
    const dayScrolled = scrollTop > 0.5;
    if (dayScrolled !== this.data.dayScrolled) this.setData({ dayScrolled });
  },
  onWeekScroll(event) {
    const weekScrolled = Number(event.detail.scrollTop || 0) > 0.5;
    if (weekScrolled !== this.data.weekScrolled) this.setData({ weekScrolled });
  },
  resetDayDrag() {
    this.dayDragActive = false;
    this.dayDragMealIndex = -1;
    this.dayDragStartIndex = -1;
    this.dayMealRects = [];
    this.dayRecipeRects = [];
    this.setData({ dayDragActive: false, dayDraggingId: '', dayDragMealIndex: -1, dayDragTargetMealIndex: -1, dayDragTargetIndex: -1, dayDragIndicatorIndex: -1, dayDragOffset: 0 });
  },
  onWeekFoodTouchStart(event) {
    const { id, dayIndex, mealType, foodIndex } = event.currentTarget.dataset;
    this.weekFoodStartX = event.touches[0].clientX;
    this.weekFoodStartY = event.touches[0].clientY;
    this.weekFoodDayIndex = Number(dayIndex);
    this.weekFoodMealType = mealType;
    this.weekFoodStartIndex = Number(foodIndex);
    this.weekFoodTouchMoved = false;
    this.weekFoodDragActive = false;
    clearTimeout(this.weekFoodLongPressTimer);
    this.weekFoodLongPressTimer = setTimeout(() => {
      if (this.weekFoodTouchMoved) return;
      if (!requireAuthenticated()) return;
      this.weekFoodDragActive = true;
      this.setData({
        weekDragActive: true,
        weekDraggingId: id,
        weekDragDayIndex: this.weekFoodDayIndex,
        weekDragMealType: mealType,
        weekDragTargetDayIndex: this.weekFoodDayIndex,
        weekDragTargetMealType: mealType,
        weekDragTargetIndex: this.weekFoodStartIndex,
        weekDragIndicatorIndex: this.weekFoodStartIndex,
        weekDragOffsetX: 0,
        weekDragOffsetY: 0,
        selectedEmptyCellKey: '',
        pressedCellKey: ''
      }, () => this.measureWeekDropZones());
      if (wx.vibrateShort) wx.vibrateShort({ type: 'light' });
    }, 500);
  },
  measureWeekDropZones() {
    const query = wx.createSelectorQuery().in(this);
    query.selectAll('.week-meal-cell').boundingClientRect();
    query.selectAll('.grid-food').boundingClientRect();
    query.exec((result) => {
      this.weekMealRects = result[0] || [];
      this.weekFoodRects = result[1] || [];
    });
  },
  updateWeekDropTarget(clientX, clientY) {
    const mealRects = this.weekMealRects || [];
    if (!mealRects.length) return;
    let targetRect = mealRects[0];
    let shortestDistance = Infinity;
    mealRects.forEach((rect) => {
      const distanceX = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
      const distanceY = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      const distance = distanceX * distanceX + distanceY * distanceY;
      if (distance < shortestDistance) {
        shortestDistance = distance;
        targetRect = rect;
      }
    });
    const targetDayIndex = Number(targetRect.dataset.dayIndex);
    const targetMealType = targetRect.dataset.mealType;
    const foodRects = (this.weekFoodRects || [])
      .filter((rect) => Number(rect.dataset.dayIndex) === targetDayIndex
        && rect.dataset.mealType === targetMealType
        && !(targetDayIndex === this.weekFoodDayIndex
          && targetMealType === this.weekFoodMealType
          && Number(rect.dataset.foodIndex) === this.weekFoodStartIndex))
      .sort((left, right) => left.top - right.top);
    let targetIndex = 0;
    foodRects.forEach((rect) => {
      if (clientY >= rect.top + rect.height / 2) targetIndex += 1;
    });
    const sameMeal = targetDayIndex === this.weekFoodDayIndex && targetMealType === this.weekFoodMealType;
    const indicatorIndex = targetIndex + (sameMeal && targetIndex > this.weekFoodStartIndex ? 1 : 0);
    this.setData({ weekDragTargetDayIndex: targetDayIndex, weekDragTargetMealType: targetMealType, weekDragTargetIndex: targetIndex, weekDragIndicatorIndex: indicatorIndex });
  },
  onWeekFoodTouchMove(event) {
    const touch = event.touches[0];
    const deltaX = touch.clientX - this.weekFoodStartX;
    const deltaY = touch.clientY - this.weekFoodStartY;
    if (!this.weekFoodDragActive) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        this.weekFoodTouchMoved = true;
        clearTimeout(this.weekFoodLongPressTimer);
      }
      return;
    }
    this.updateWeekDropTarget(touch.clientX, touch.clientY);
    this.setData({ weekDragOffsetX: toRpx(deltaX), weekDragOffsetY: toRpx(deltaY) });
  },
  onWeekFoodTouchEnd() {
    clearTimeout(this.weekFoodLongPressTimer);
    if (!this.weekFoodDragActive) return;
    const weeklyPlanDays = JSON.parse(JSON.stringify(this.data.weeklyPlanDays));
    const sourceDay = weeklyPlanDays[this.weekFoodDayIndex];
    const sourceMeal = sourceDay && sourceDay.meals.find((item) => item.type === this.weekFoodMealType);
    const targetDay = weeklyPlanDays[this.data.weekDragTargetDayIndex];
    const targetMeal = targetDay && targetDay.meals.find((item) => item.type === this.data.weekDragTargetMealType);
    const moved = sourceMeal && sourceMeal.items.splice(this.weekFoodStartIndex, 1)[0];
    if (moved && targetMeal) targetMeal.items.splice(this.data.weekDragTargetIndex, 0, moved);
    else if (moved) sourceMeal.items.splice(this.weekFoodStartIndex, 0, moved);
    this.setData({ weeklyPlanDays: this.syncWeeklyEmptySlots(weeklyPlanDays) });
    if (moved && targetMeal) {
      // The optimistic grid update is newer than any in-flight load. Keep its
      // result until this move has completed and returned a fresh snapshot.
      const weeklyPlanRequest = this.createWeeklyPlanRequest(this.weekRangeOffset);
      const selectedDate = this.data.selectedDate;
      const shouldRefreshDay = selectedDate === sourceDay.id || selectedDate === targetDay.id;
      const refreshPlanViews = () => Promise.all([
        fetchWeeklyPlan(weeklyPlanRequest.weekOffset),
        shouldRefreshDay ? fetchMealPlans(selectedDate) : Promise.resolve(null)
      ]);
      movePlanRecipe(
        moved.id,
        targetDay.id,
        targetMeal.type,
        this.data.weekDragTargetIndex
      ).then(refreshPlanViews).then(([freshDays, freshPlans]) => {
        const update = {};
        if (freshPlans && this.data.selectedDate === selectedDate) update.mealPlans = this.hydrateMealPlans(freshPlans);
        this.applyWeeklyPlanRequest(weeklyPlanRequest, freshDays, update);
      }).catch((error) => {
        refreshPlanViews().then(([freshDays, freshPlans]) => {
          const update = {};
          if (freshPlans && this.data.selectedDate === selectedDate) update.mealPlans = this.hydrateMealPlans(freshPlans);
          this.applyWeeklyPlanRequest(weeklyPlanRequest, freshDays, update);
        }).catch(() => {});
        this.showPlanError(error, '调整计划失败');
      });
    }
    this.resetWeekDrag();
    this.suppressWeekFoodTap = true;
    clearTimeout(this.suppressWeekFoodTapTimer);
    this.suppressWeekFoodTapTimer = setTimeout(() => { this.suppressWeekFoodTap = false; }, 350);
  },
  onWeekFoodTouchCancel() {
    clearTimeout(this.weekFoodLongPressTimer);
    this.resetWeekDrag();
  },
  resetWeekDrag() {
    this.weekFoodDragActive = false;
    this.weekFoodDayIndex = -1;
    this.weekFoodStartIndex = -1;
    this.weekFoodMealType = '';
    this.weekMealRects = [];
    this.weekFoodRects = [];
    this.setData({ weekDragActive: false, weekDraggingId: '', weekDragDayIndex: -1, weekDragMealType: '', weekDragTargetDayIndex: -1, weekDragTargetMealType: '', weekDragTargetIndex: -1, weekDragIndicatorIndex: -1, weekDragOffsetX: 0, weekDragOffsetY: 0 });
  },
  resolveWeekFoodRecipeId(recipeId, title) {
    const persistedRecipeId = String(recipeId || '').trim();
    if (persistedRecipeId) return persistedRecipeId;
    const recipe = (this.recipeCatalog || []).find((item) => item.title === String(title || '').trim());
    return recipe ? recipe.id : '';
  },
  onWeekFoodTap(event) {
    if (this.suppressWeekFoodTap || this.weekFoodDragActive) return;
    const { id, recipeId, dayIndex, mealType, foodIndex, title } = event.currentTarget.dataset;
    const resolvedRecipeId = this.resolveWeekFoodRecipeId(recipeId, title);
    this.weekFoodActionTarget = { id, dayIndex: Number(dayIndex), mealType, foodIndex: Number(foodIndex), recipeId: resolvedRecipeId };
    this.setData({
      weekFoodActionVisible: true,
      weekFoodActionTitle: title,
      weekFoodActionCanView: Boolean(resolvedRecipeId),
      weekFoodActionActions: resolvedRecipeId
        ? [{ label: '查看详情', value: 'view' }, { label: '删除', value: 'delete' }]
        : [{ label: '删除', value: 'delete' }]
    });
  },
  onWeekFoodActionSelect(event) {
    const value = event.detail.value || '';
    if (value === 'view') this.onWeekFoodViewRecipe();
    if (value === 'delete') this.onWeekFoodDelete();
  },
  onWeekFoodActionClose() {
    this.weekFoodActionNext = '';
    this.setData({ weekFoodActionVisible: false });
  },
  onWeekFoodViewRecipe() {
    const target = this.weekFoodActionTarget;
    if (!target || !target.recipeId) {
      wx.showToast({ title: '该条目暂无关联菜谱', icon: 'none' });
      return;
    }
    this.weekFoodActionNext = 'view';
    this.setData({ weekFoodActionVisible: false });
  },
  onWeekFoodDelete() {
    if (!requireAuthenticated()) return;
    const target = this.weekFoodActionTarget;
    if (!target) return;
    const day = this.data.weeklyPlanDays[target.dayIndex];
    if (!day) return;
    this.weekFoodActionNext = '';
    this.setData({ weekFoodActionVisible: false });
    removeRecipeFromPlan(day.id, target.mealType, target.id).then(() => (
      fetchWeeklyPlan(this.weekRangeOffset)
    )).then((weeklyPlanDays) => {
      this.setData({ weeklyPlanDays: this.hydrateWeeklyPlan(weeklyPlanDays) });
    }).catch((error) => this.showPlanError(error, '移除计划失败'));
  },
  onWeekFoodActionAfterClose() {
    const next = this.weekFoodActionNext;
    const target = this.weekFoodActionTarget;
    this.weekFoodActionNext = '';
    this.weekFoodActionTarget = null;
    this.setData({ weekFoodActionTitle: '', weekFoodActionCanView: false, weekFoodActionActions: [] });
    if (next === 'view' && target && target.recipeId) {
      wx.navigateTo({ url: `/pages/recipe-detail/index?id=${target.recipeId}` });
    }
  },
  onDeletePlan(event) {
    if (!requireAuthenticated()) return;
    const { id, planKey, mealIndex, recipeIndex } = event.currentTarget.dataset;
    const meal = this.data.mealPlans[Number(mealIndex)];
    const recipe = meal && meal.recipes[Number(recipeIndex)];
    if (!meal || !recipe || recipe.id !== id) return;
    this.setData({ deletingId: planKey, swipeId: '', swipeOffset: 0 });
    setTimeout(() => {
      removeRecipeFromPlan(this.data.selectedDate, meal.id, id).then(() => (
        Promise.all([
          fetchMealPlans(this.data.selectedDate),
          fetchWeeklyPlan(this.weekRangeOffset)
        ])
      )).then(([mealPlans, weeklyPlanDays]) => {
        this.setData({ mealPlans: this.hydrateMealPlans(mealPlans), weeklyPlanDays: this.hydrateWeeklyPlan(weeklyPlanDays), deletingId: '' });
      }).catch((error) => {
        this.setData({ deletingId: '' });
        this.showPlanError(error, '移除计划失败');
      });
    }, 220);
  },
  onImageError(event) {
    const path = `mealPlans[${event.currentTarget.dataset.mealIndex}].recipes[${event.currentTarget.dataset.recipeIndex}].coverUrl`;
    const update = {};
    update[path] = RECIPE_COVER_PLACEHOLDER;
    this.setData(update);
  }
});
