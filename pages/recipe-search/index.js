const { fetchRecipeGroups } = require('../../services/recipe-api');
const { addRecipeToPlan } = require('../../services/meal-plan-api');
const { requireAuthenticated } = require('../../services/auth-state');

const app = getApp();

Page({
  data: { statusBarHeight: 44, navigationBottom: 88, searchTop: 104, resultTop: 152, query: '', searchFocus: false, recipes: [], results: [], addPlanVisible: false, addPlanRecipe: null },
  onLoad(options) {
    let info = {};
    try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (error) { info = {}; }
    const statusBarHeight = Number(info.statusBarHeight || 44);
    const navigationBottom = statusBarHeight + 44;
    this.setData({ statusBarHeight, navigationBottom, searchTop: navigationBottom + 16, resultTop: navigationBottom + 64, query: options.q || '' });
    this.recipeDataVersion = Number(app.globalData.recipeDataVersion || 0);
    this.refreshRecipeCatalog(this.recipeDataVersion);
    setTimeout(() => this.setData({ searchFocus: true }), 120);
  },
  onShow() {
    const recipeDataVersion = Number(app.globalData.recipeDataVersion || 0);
    if (recipeDataVersion !== this.recipeDataVersion) this.refreshRecipeCatalog(recipeDataVersion);
  },
  refreshRecipeCatalog(version) {
    const requestId = (this.recipeCatalogRequestId || 0) + 1;
    this.recipeCatalogRequestId = requestId;
    fetchRecipeGroups().then((groups) => {
      if (requestId !== this.recipeCatalogRequestId) return;
      const recipes = [];
      groups.forEach((group, groupIndex) => group.recipes.forEach((recipe) => recipes.push({ ...recipe, groupIndex })));
      this.recipeDataVersion = Number(version || 0);
      this.setData({ recipes }, () => this.updateResults(this.data.query));
    });
  },
  updateResults(query) {
    const keyword = (query || '').trim();
    if (!keyword) { this.setData({ results: [] }); return; }
    let results = this.data.recipes.filter((recipe) => recipe.title.indexOf(keyword) >= 0);
    if (keyword.indexOf('凉拌') >= 0 && results.length < 3) {
      this.data.recipes.filter((recipe) => recipe.groupIndex === 0).forEach((recipe) => {
        if (!results.some((item) => item.id === recipe.id)) results.push(recipe);
      });
    }
    this.setData({ results: results.slice(0, 20) });
  },
  onSearchInput(event) { const query = event.detail.value; this.setData({ query }); this.updateResults(query); },
  onSearchConfirm() { this.updateResults(this.data.query); },
  onClear() { this.setData({ query: '', results: [], searchFocus: true }); },
  onBack() { wx.navigateBack(); },
  onRecipeTap(event) { wx.navigateTo({ url: '/pages/recipe-detail/index?id=' + event.detail.id }); },
  onAddPlan(event) {
    if (!requireAuthenticated()) return;
    const recipe = event.detail && event.detail.recipe;
    if (!recipe) return;
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.pendingAddPlanToast = '';
    this.setData({ searchFocus: false, addPlanRecipe: recipe, addPlanVisible: true });
  },
  onCloseAddPlan() {
    this.pendingAddPlanToast = '';
    this.setData({ addPlanVisible: false });
  },
  onConfirmAddPlan(event) {
    if (!requireAuthenticated()) return;
    const recipe = this.data.addPlanRecipe;
    if (!recipe) return;
    const { date, dateText, meal, mealName } = event.detail;
    addRecipeToPlan(date, meal, recipe);
    app.globalData.pendingPlanSelection = { date, meal, mealName, type: 'recipes', recipes: [recipe] };
    this.pendingAddPlanToast = `已添加至${dateText}${mealName}计划`;
    this.setData({ addPlanVisible: false });
  },
  onAddPlanAfterClose() {
    const title = this.pendingAddPlanToast;
    this.pendingAddPlanToast = '';
    this.setData({ addPlanRecipe: null });
    if (title) wx.showToast({ title, icon: 'none' });
  }
});
