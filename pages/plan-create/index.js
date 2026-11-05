const { fetchRecipeGroups } = require('../../services/recipe-api');

const mealNames = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };

Page({
  data: {
    mealName: '早餐',
    activeTab: 'catalog',
    groups: [],
    recipes: [],
    results: [],
    query: '',
    searchFocus: false,
    selectedIds: [],
    note: '',
    noteFocus: false,
    sheetVisible: true,
    keyboardHeight: 0,
    footerHeight: 96,
    contentBottom: 96
  },
  onLoad(options) {
    const selectedIds = [];
    this.setData({ mealName: mealNames[options.meal] || '早餐', selectedIds });
    fetchRecipeGroups().then((groups) => {
      const recipes = [];
      groups.forEach((group, groupIndex) => group.recipes.forEach((recipe) => recipes.push({ ...recipe, groupIndex })));
      this.setData({ groups, recipes, selectedIds: [] }, () => {
        if (this.data.query) this.updateResults(this.data.query);
      });
    });
    this.keyboardHandler = ({ height }) => {
      const keyboardHeight = Number(height || 0);
      const footerHeight = keyboardHeight ? 68 : 96;
      this.setData({ keyboardHeight, footerHeight, contentBottom: keyboardHeight + footerHeight });
    };
    if (wx.onKeyboardHeightChange) wx.onKeyboardHeightChange(this.keyboardHandler);
  },
  onUnload() {
    clearTimeout(this.focusTimer);
    if (wx.offKeyboardHeightChange && this.keyboardHandler) wx.offKeyboardHeightChange(this.keyboardHandler);
  },
  onClose() {
    const app = getApp();
    app.globalData.planCreateTarget = null;
    this.confirmed = false;
    this.setData({ sheetVisible: false });
  },
  onAfterClose() { wx.navigateBack(); },
  noop() {},
  onTabTap(event) {
    const activeTab = event.currentTarget.dataset.tab;
    if (activeTab === this.data.activeTab) return;
    clearTimeout(this.focusTimer);
    if (activeTab === 'note') {
      this.setData({ activeTab, searchFocus: false, noteFocus: false });
      this.focusTimer = setTimeout(() => this.setData({ noteFocus: true }), 80);
      return;
    }
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.setData({ activeTab, noteFocus: false, searchFocus: false });
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
  onSearchInput(event) {
    const query = event.detail.value;
    this.setData({ query });
    this.updateResults(query);
  },
  onSearchConfirm() { this.updateResults(this.data.query); },
  onSearchClear() { this.setData({ query: '', results: [], searchFocus: true }); },
  onSearchFocus() { this.setData({ searchFocus: true }); },
  onSearchBlur() { this.setData({ searchFocus: false }); },
  onRecipeTap(event) { wx.navigateTo({ url: `/pages/recipe-detail/index?id=${event.detail.id}` }); },
  onToggleRecipe(event) {
    const id = event.detail.id;
    const selectedIds = this.data.selectedIds.slice();
    const index = selectedIds.indexOf(id);
    if (index >= 0) selectedIds.splice(index, 1);
    else selectedIds.push(id);
    this.setData({ selectedIds });
  },
  onNoteInput(event) { this.setData({ note: event.detail.value }); },
  onConfirm() {
    const app = getApp();
    const target = app.globalData.planCreateTarget || {};
    app.globalData.planCreateTarget = null;
    app.globalData.pendingPlanSelection = this.data.activeTab === 'note'
      ? { ...target, type: 'note', mealName: this.data.mealName, note: this.data.note.trim() }
      : { ...target, type: 'recipes', mealName: this.data.mealName, recipes: this.data.recipes.filter((recipe) => this.data.selectedIds.indexOf(recipe.id) >= 0) };
    this.confirmed = true;
    this.setData({ sheetVisible: false });
  }
});
