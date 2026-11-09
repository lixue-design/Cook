const { fetchRecipeDetail, deleteRecipe } = require('../../services/recipe-api');
const { addRecipeToPlan } = require('../../services/meal-plan-api');
const { addRecipeToShoppingList } = require('../../services/shopping-list-api');
const router = require('../../utils/router');
const { formatWeekRange, weekStartForOffset } = require('../../utils/week-range');
const { requireAuthenticated } = require('../../services/auth-state');

const app = getApp();
const DETAIL_COVER_PLACEHOLDER = '/assets/recipes/detail-cover-placeholder.svg';
const normalizeIngredientDisplay = (value) => String(value || '').trim().replace(/\s*[，,]\s*/g, '、');
const ingredientPreparationText = (ingredients) => (ingredients || [])
  .map((group) => normalizeIngredientDisplay(group && group.display))
  .filter(Boolean)
  .join('、');
const BASKET_WEEK_COUNT = 9;
const createBasketWeekOptions = () => Array.from(
  { length: BASKET_WEEK_COUNT },
  (_, offset) => formatWeekRange(offset)
);
const createBasketWeekStartDates = () => Array.from(
  { length: BASKET_WEEK_COUNT },
  (_, offset) => weekStartForOffset(offset)
);

Page({
  data: {
    status: 'loading',
    recipe: null,
    navBarHeight: 88,
    menuButtonTop: 51,
    menuButtonHeight: 32,
    bottomActionHeight: 56,
    addPlanVisible: false,
    basketWeekOptions: [],
    basketWeekStartDates: [],
    basketWeekSelectedIndex: 0,
    moreActionVisible: false,
    moreActions: [{ label: '删除菜谱', value: 'delete' }]
  },
  onLoad(options) {
    this.setLayoutMetrics();
    this.setData({
      basketWeekOptions: createBasketWeekOptions(),
      basketWeekStartDates: createBasketWeekStartDates(),
      basketWeekSelectedIndex: 0
    });
    this.recipeId = options.id || 'cabbage';
    this.loadRecipe();
  },
  onShow() {
    if (!app.globalData.recipeDetailNeedsRefresh) return;
    app.globalData.recipeDetailNeedsRefresh = false;
    this.loadRecipe();
  },
  loadRecipe() {
    this.setData({ status: 'loading' });
    fetchRecipeDetail(this.recipeId)
      .then((recipe) => {
        const normalizedRecipe = recipe && {
          ...recipe,
          heroImage: String(recipe.heroImage || '').trim(),
          heroImageUrl: String(recipe.heroImage || '').trim() || DETAIL_COVER_PLACEHOLDER,
          ingredients: (recipe.ingredients || []).map((group) => ({
            ...group,
            display: normalizeIngredientDisplay(group.display)
          })),
          ingredientPreparationText: ingredientPreparationText(recipe.ingredients)
        };
        this.setData({ status: normalizedRecipe ? 'success' : 'empty', recipe: normalizedRecipe });
      })
      .catch((error) => {
        this.setData({ status: 'error', recipe: null });
        wx.showToast({ title: error.message || '菜谱加载失败', icon: 'none' });
      });
  },
  onRetryLoad() { this.loadRecipe(); },
  setLayoutMetrics() {
    const systemInfo = wx.getSystemInfoSync();
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const safeAreaBottom = Math.max(
      0,
      systemInfo.screenHeight - (systemInfo.safeArea ? systemInfo.safeArea.bottom : systemInfo.screenHeight)
    );
    const menuButtonTop = menuButton && menuButton.top ? menuButton.top : 51;
    const menuButtonHeight = menuButton && menuButton.height ? menuButton.height : 32;
    const navBarHeight = menuButton && menuButton.bottom ? menuButton.bottom + 5 : 88;
    this.setData({
      navBarHeight,
      menuButtonTop,
      menuButtonHeight,
      bottomActionHeight: 56 + safeAreaBottom
    });
  },
  onBack() { router.back(); },
  onHeroImageError() { this.setData({ 'recipe.heroImageUrl': DETAIL_COVER_PLACEHOLDER }); },
  onStepImageError(event) {
    const update = {};
    update[`recipe.steps[${event.currentTarget.dataset.index}].imageUrl`] = '';
    this.setData(update);
  },
  onPreviewStepImage(event) {
    const current = this.data.recipe.steps[event.currentTarget.dataset.index].imageUrl;
    const urls = this.data.recipe.steps.filter((step) => step.imageUrl).map((step) => step.imageUrl);
    wx.previewImage({ current, urls });
  },
  onAddToBasket() {
    if (!requireAuthenticated()) return;
    if (!this.data.recipe || this.basketAdding) return;
  },
  onBasketWeekChange(event) {
    if (!requireAuthenticated()) return;
    if (!this.data.recipe || this.basketAdding) return;
    const selectedIndex = Number((event.detail || {}).value);
    const weekStartDate = this.data.basketWeekStartDates[selectedIndex];
    if (!weekStartDate) return;
    this.basketAdding = true;
    this.setData({ basketWeekSelectedIndex: selectedIndex });
    addRecipeToShoppingList(
      weekStartDate,
      this.data.recipe.id,
      this.data.recipe.ingredients,
      {
        recipeName: this.data.recipe.title,
        coverUrl: this.data.recipe.heroImage || this.data.recipe.heroImageUrl,
        cookTimeMinutes: this.data.recipe.duration,
        caloriesKcal: this.data.recipe.calories
      }
    ).then(() => {
      app.globalData.shoppingBasketNeedsRefresh = true;
      wx.showToast({ title: '食材已添加至菜篮', icon: 'none' });
    }).catch((error) => {
      wx.showToast({ title: error.message || '添加失败，请稍后重试', icon: 'none' });
    }).then(() => { this.basketAdding = false; });
  },
  onAddPlan() {
    if (!requireAuthenticated()) return;
    if (!this.data.recipe) return;
    this.pendingAddPlanToast = '';
    this.setData({ addPlanVisible: true });
  },
  onCloseAddPlan() {
    this.pendingAddPlanToast = '';
    this.setData({ addPlanVisible: false });
  },
  onConfirmAddPlan(event) {
    if (!requireAuthenticated()) return;
    if (this.planAdding) return;
    const recipe = this.data.recipe;
    if (!recipe) return;
    const { date, dateText, meal, mealName } = event.detail;
    const planRecipe = {
      id: recipe.id,
      title: recipe.title,
      duration: recipe.duration,
      calories: recipe.calories,
      coverUrl: recipe.heroImage || '',
      crop: { width: 64, height: 64, left: 0, top: 0 }
    };
    this.planAdding = true;
    addRecipeToPlan(date, meal, planRecipe).then(() => {
      // 菜谱页已经完成服务端写入；计划页仅在返回时刷新，不能再写一次。
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
    if (title) wx.showToast({ title, icon: 'none' });
  },
  onEdit() {
    if (!requireAuthenticated()) return;
    const recipe = this.data.recipe;
    if (!recipe) return;
    const ingredientText = (recipe.ingredients || []).map((group) => group.display || '').filter(Boolean).join('、');
    app.globalData.pendingRecipeEdit = {
      id: recipe.id,
      form: {
        name: recipe.title || '',
        category: recipe.category || '',
        duration: String(recipe.duration || '').replace(/\D/g, ''),
        calories: String(recipe.calories || '').replace(/\D/g, ''),
        coverUrl: recipe.heroImage || '',
        coverMode: recipe.coverMode || 'FOLLOW_LIBRARY',
        customCoverStorageKey: recipe.customCoverStorageKey || '',
        mainIngredients: ingredientText,
        sideIngredients: '',
        seasonings: '',
        steps: (recipe.steps || []).map((step, index) => ({ id: step.id || `edit-step-${index}`, text: step.text || '', imageUrl: step.imageUrl || '' }))
      }
    };
    wx.navigateTo({ url: '/pages/recipe-create/index?mode=manual&source=edit' });
  },
  onMore() {
    if (this.data.recipe) this.setData({ moreActionVisible: true });
  },
  onMoreActionSelect(event) {
    if (event.detail.value === 'delete') this.pendingMoreAction = 'delete';
    this.setData({ moreActionVisible: false });
  },
  onMoreActionClose() { this.setData({ moreActionVisible: false }); },
  onMoreActionAfterClose() {
    if (this.pendingMoreAction !== 'delete') return;
    this.pendingMoreAction = '';
    if (!requireAuthenticated()) return;
    const recipe = this.data.recipe;
    if (!recipe) return;
    wx.showModal({
      title: '确定删除菜谱？',
      content: `删除后将无法恢复「${recipe.title}」`,
      confirmText: '删除',
      confirmColor: '#ff4d4f',
      success: async (modalResult) => {
        if (!modalResult.confirm) return;
        try {
          const deleted = await Promise.resolve(deleteRecipe(recipe.id));
          if (!deleted) throw new Error('菜谱不存在或无权删除');
        } catch (error) {
          wx.showToast({ title: error.message || '删除失败', icon: 'none' });
          return;
        }
        app.globalData.recipeListNeedsRefresh = true;
        app.globalData.recipeDataVersion = Number(app.globalData.recipeDataVersion || 0) + 1;
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 350);
      }
    });
  }
});
