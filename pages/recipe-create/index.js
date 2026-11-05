'use strict';

const { getRecipeCategories, createRecipe, updateRecipe } = require('../../services/recipe-api');
const { generateRecipeDraftFromText } = require('../../services/recipe-text-ai-api');
const { requireAuthenticated } = require('../../services/auth-state');
const { cloneForm, validateRecipeForm, readDraft, writeDraft, clearDraft } = require('../../utils/recipe-draft');
const { prepareRecipeImage, persistRecipeImage, isLocalRecipeImagePath } = require('../../utils/recipe-image');
const router = require('../../utils/router');

const app = getApp();
const EMPTY_STEP = () => ({ id: `step-${Date.now()}-${Math.random().toString(16).slice(2)}`, text: '', imageUrl: '' });
const emptyForm = () => ({ name: '', category: '', duration: '', calories: '', coverUrl: '', mainIngredients: '', sideIngredients: '', seasonings: '', steps: [EMPTY_STEP()] });
const combineIngredients = (form) => [form.mainIngredients, form.sideIngredients, form.seasonings].map((value) => String(value || '').trim()).filter(Boolean).join('、');

function formFromExternal(source) {
  const form = cloneForm({ ...emptyForm(), ...(source || {}) });
  if (!form.steps.length) form.steps = [EMPTY_STEP()];
  // The target Figma design has one uninterrupted ingredient input. Keep it
  // compatible with the current three-field API by storing it as main ingredients.
  form.mainIngredients = combineIngredients(form);
  form.sideIngredients = '';
  form.seasonings = '';
  return form;
}

Page({
  data: {
    navBarHeight: 88, menuButtonTop: 51, menuButtonHeight: 32, bottomActionHeight: 96, textGenerationInputHeight: 0,
    submitting: false, isEditing: false, swipedStepId: '',
    categories: [], categoryIndex: 0, form: emptyForm(), globalLoginSheetVisible: false,
    isTextGeneration: false, textGenerationValue: '', textGenerating: false
  },

  onLoad(options) {
    this.options = options || {};
    this.setLayoutMetrics();
    this.isTextGeneration = this.options.mode === 'text';
    this.setData({ isTextGeneration: this.isTextGeneration });
    if (this.isTextGeneration) return;
    this.initializeForm();
    this.loadCategories();
  },
  onHide() {
    if (!this.isTextGeneration) this.persistDraft();
  },
  onUnload() {
    if (!this.isTextGeneration) this.persistDraft();
  },

  setLayoutMetrics() {
    const systemInfo = wx.getSystemInfoSync();
    const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const safeAreaBottom = Math.max(0, systemInfo.screenHeight - (systemInfo.safeArea ? systemInfo.safeArea.bottom : systemInfo.screenHeight));
    const bottomActionHeight = 68 + safeAreaBottom;
    const navBarHeight = menuButton && menuButton.bottom ? menuButton.bottom + 5 : 88;
    const textGenerationInputHeight = Math.max(0, Number(systemInfo.windowHeight || systemInfo.screenHeight) - navBarHeight - bottomActionHeight);
    this.setData({
      menuButtonTop: menuButton && menuButton.top ? menuButton.top : 51,
      menuButtonHeight: menuButton && menuButton.height ? menuButton.height : 32,
      navBarHeight,
      bottomActionHeight,
      textGenerationInputHeight
    });
  },
  initializeForm() {
    const pendingEdit = app.globalData.pendingRecipeEdit;
    const pendingRecognized = app.globalData.pendingRecognizedRecipe;
    const isEditing = Boolean(pendingEdit && pendingEdit.id);
    this.recipeId = isEditing ? pendingEdit.id : '';
    this.skipNewDraftRestore = !isEditing && ['manual', 'generated-text', 'generated-image', 'generated-link'].includes(this.options.source);
    let form = emptyForm();
    if (isEditing) {
      form = formFromExternal(pendingEdit.form);
      app.globalData.pendingRecipeEdit = null;
    } else if (pendingRecognized) {
      form = formFromExternal(pendingRecognized);
      app.globalData.pendingRecognizedRecipe = null;
    }
    const draft = this.skipNewDraftRestore ? null : readDraft(wx, this.recipeId);
    if (draft) form = formFromExternal(draft);
    this.initialForm = JSON.stringify(form);
    this.setData({ isEditing, form, categoryIndex: 0 });
  },
  loadCategories() {
    Promise.resolve(getRecipeCategories()).then((categories) => {
      const list = (categories || []).map((item) => String(item.name || '').trim()).filter(Boolean);
      this.setData({ categories: list, categoryIndex: Math.max(0, list.indexOf(this.data.form.category)) });
    }).catch(() => this.setData({ categories: [] }));
  },
  markChanged(update) { this.setData(update); this.changed = true; },
  updateFormText(path, value) {
    const nextValue = String(value || '');
    this.markChanged({ [path]: nextValue });
  },
  onNameInput(event) { this.updateFormText('form.name', event.detail.value); },
  onNameBlur(event) { this.updateFormText('form.name', event.detail.value); },
  onIngredientInput(event) { this.updateFormText('form.mainIngredients', event.detail.value); },
  onIngredientBlur(event) { this.updateFormText('form.mainIngredients', event.detail.value); },
  onStepInput(event) {
    this.closeStepSwipe();
    this.updateFormText(`form.steps[${Number(event.currentTarget.dataset.index)}].text`, event.detail.value);
  },
  onStepBlur(event) { this.updateFormText(`form.steps[${Number(event.currentTarget.dataset.index)}].text`, event.detail.value); },
  onTextGenerationInput(event) { this.setData({ textGenerationValue: event.detail.value }); },
  onConfirmText() {
    if (this.data.textGenerating || !requireAuthenticated()) return;
    const text = String(this.data.textGenerationValue || '').trim();
    if (!text) {
      wx.showToast({ title: '请输入菜谱内容', icon: 'none' });
      return;
    }
    this.setData({ textGenerating: true });
    wx.showLoading({ title: '正在生成' });
    generateRecipeDraftFromText(text).then(({ form }) => {
      wx.hideLoading();
      app.globalData.pendingRecognizedRecipe = form;
      wx.navigateTo({ url: '/pages/recipe-create/index?mode=manual&source=generated-text' });
    }).catch((error) => {
      wx.hideLoading();
      this.setData({ textGenerating: false });
      wx.showToast({ title: error.message || '文字生成失败，请重试', icon: 'none' });
    });
  },
  onCategoryChange(event) {
    const categoryIndex = Number(event.detail.value || 0);
    this.markChanged({ categoryIndex, 'form.category': this.data.categories[categoryIndex] || '' });
  },
  chooseAndPersistImage() {
    return new Promise((resolve, reject) => {
      const choose = wx.chooseMedia || wx.chooseImage;
      choose({ count: 1, mediaType: ['image'], sizeType: ['compressed'], sourceType: ['album', 'camera'], success: resolve, fail: reject });
    }).then((result) => {
      const selected = (result.tempFiles && result.tempFiles[0]) || {};
      const path = selected.tempFilePath || (result.tempFilePaths && result.tempFilePaths[0]);
      return prepareRecipeImage(path, selected.size).then((prepared) => persistRecipeImage(prepared.filePath));
    });
  },
  onChooseCover() {
    this.chooseAndPersistImage().then((coverUrl) => this.markChanged({ 'form.coverUrl': coverUrl })).catch((error) => {
      if (!/cancel/i.test(error && (error.errMsg || error.message) || '')) wx.showToast({ title: error.message || '图片选择失败，请重试', icon: 'none' });
    });
  },
  onChooseStepImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.chooseAndPersistImage().then((imageUrl) => this.markChanged({ [`form.steps[${index}].imageUrl`]: imageUrl })).catch((error) => {
      if (!/cancel/i.test(error && (error.errMsg || error.message) || '')) wx.showToast({ title: error.message || '图片选择失败，请重试', icon: 'none' });
    });
  },
  onAddStep() {
    if (this.data.form.steps.length >= 100) { wx.showToast({ title: '制作步骤不能超过100条', icon: 'none' }); return; }
    this.closeStepSwipe();
    this.markChanged({ 'form.steps': this.data.form.steps.concat(EMPTY_STEP()) });
  },
  onRemoveStep(event) {
    const steps = this.data.form.steps.slice();
    steps.splice(Number(event.currentTarget.dataset.index), 1);
    this.markChanged({ 'form.steps': steps.length ? steps : [EMPTY_STEP()], swipedStepId: '' });
  },
  onStepTouchStart(event) {
    const touch = (event.touches || [])[0];
    const step = this.data.form.steps[Number(event.currentTarget.dataset.stepIndex)];
    if (!touch || !step || (!String(step.text || '').trim() && !step.imageUrl)) return;
    this.stepSwipe = {
      id: String(event.currentTarget.dataset.stepId || ''),
      startX: Number(touch.clientX || touch.pageX || 0)
    };
  },
  onStepTouchEnd(event) {
    const gesture = this.stepSwipe;
    this.stepSwipe = null;
    const touch = (event.changedTouches || [])[0];
    if (!gesture || !gesture.id || !touch) return;
    const deltaX = Number(touch.clientX || touch.pageX || 0) - gesture.startX;
    if (deltaX <= -30) this.setData({ swipedStepId: gesture.id });
    if (deltaX >= 30 && this.data.swipedStepId === gesture.id) this.setData({ swipedStepId: '' });
  },
  closeStepSwipe() {
    if (this.data.swipedStepId) this.setData({ swipedStepId: '' });
  },
  persistDraft() {
    if (!this.changed || this.saving || this.skipNewDraftRestore) return;
    try { writeDraft(wx, this.recipeId, this.data.form); } catch (error) { /* best effort */ }
  },
  hasUnsavedChanges() { return this.changed && JSON.stringify(this.data.form) !== this.initialForm; },
  onBack() {
    if (this.isTextGeneration) { router.back(); return; }
    if (!this.hasUnsavedChanges()) { router.back(); return; }
    wx.showModal({ title: '放弃本次编辑？', content: '当前填写内容会保留为草稿，可在下次进入时恢复。', confirmText: '放弃', success: ({ confirm }) => { if (confirm) { this.persistDraft(); router.back(); } } });
  },
  toSubmitForm(withoutStepImages = false) {
    const form = cloneForm(this.data.form);
    if (withoutStepImages) form.steps = form.steps.map((step) => ({ ...step, imageUrl: '' }));
    return form;
  },
  onSubmit() {
    if (this.data.submitting || !requireAuthenticated()) return;
    const validation = validateRecipeForm(this.toSubmitForm());
    if (!validation.valid) { wx.showToast({ title: validation.message, icon: 'none' }); return; }
    if (validation.form.steps.some((step) => isLocalRecipeImagePath(step.imageUrl))) {
      wx.showModal({ title: '步骤图片暂无法上传', content: '可继续保存文字步骤，步骤图片将不被保存。', confirmText: '继续保存', success: ({ confirm }) => { if (confirm) this.saveRecipe(true); } });
      return;
    }
    this.saveRecipe(false);
  },
  saveRecipe(withoutStepImages) {
    const validation = validateRecipeForm(this.toSubmitForm(withoutStepImages));
    if (!validation.valid) { wx.showToast({ title: validation.message, icon: 'none' }); return; }
    this.saving = true;
    this.setData({ submitting: true });
    const request = this.recipeId ? updateRecipe(this.recipeId, validation.form) : createRecipe(validation.form);
    Promise.resolve(request).then((recipe) => {
      if (!recipe || !recipe.id) throw new Error('菜谱保存失败');
      clearDraft(wx, this.recipeId);
      this.changed = false;
      this.initialForm = JSON.stringify(validation.form);
      app.globalData.recipeListNeedsRefresh = true;
      app.globalData.recipeDataVersion = Number(app.globalData.recipeDataVersion || 0) + 1;
      app.globalData.recipeDetailNeedsRefresh = true;
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => { if (this.recipeId) router.back(); else wx.redirectTo({ url: `/pages/recipe-detail/index?id=${recipe.id}` }); }, 350);
    }).catch((error) => {
      this.persistDraft();
      wx.showToast({ title: error.message || '保存失败，内容已保留', icon: 'none' });
    }).then(() => { this.saving = false; this.setData({ submitting: false }); });
  }
});
