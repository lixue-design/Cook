const cloudbaseEnv = require('./config/cloudbase-env');

App({
  globalData: {
    recipeListRestore: null,
    pendingRecipeCover: '',
    pendingRecipeImportLink: '',
    recipeListNeedsRefresh: false,
    recipeDataVersion: 0,
    tabBarCoveredByModal: false,
    pendingRecognizedRecipe: null,
    pendingRecipeEdit: null,
    recipeDetailNeedsRefresh: false,
    shoppingBasket: [],
    shoppingBasketsByWeek: {},
    shoppingBasketWeekKey: '',
    shoppingBasketNeedsRefresh: false,
    selectedWeekStartDate: '',
    planViewMode: 'week',
    planCreateTarget: null,
    pendingPlanSelection: null,
    currentUser: null,
    profileLoginVisible: false,
    authReturnTarget: null,
    tabBarHeight: 56,
    safeAreaBottom: 0,
    systemSafeAreaBottom: 0
  },
  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({ env: cloudbaseEnv.businessEnvId, traceUser: true });
    }
    try {
      this.globalData.currentUser = wx.getStorageSync('cook.currentUser') || null;
    } catch (error) {
      this.globalData.currentUser = null;
    }
    try {
      const savedPlanViewMode = wx.getStorageSync('cook.planViewMode');
      this.globalData.planViewMode = savedPlanViewMode === 'day' || savedPlanViewMode === 'week'
        ? savedPlanViewMode
        : 'week';
    } catch (error) {
      this.globalData.planViewMode = 'week';
    }
    let info = {};
    try {
      info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (error) {
      // Layout has safe defaults below. A metrics API failure must never stop
      // Page registration on a real device.
      info = {};
    }
    const screenHeight = Number(info.screenHeight || info.windowHeight || 0);
    const safeAreaBottom = Math.max(0, screenHeight - (info.safeArea ? Number(info.safeArea.bottom || screenHeight) : screenHeight));
    // The Figma tab bar reserves a 22px visual inset on full-screen iPhones.
    // Preserve the raw device inset separately for future form/input handling.
    const visualSafeAreaBottom = safeAreaBottom > 0 ? 22 : 0;
    this.globalData.systemSafeAreaBottom = safeAreaBottom;
    this.globalData.safeAreaBottom = visualSafeAreaBottom;
    this.globalData.tabBarHeight = 56 + visualSafeAreaBottom;
  }
});
