const DRAFT_STORAGE_KEY = 'cook.feedback.draft';

const readDraft = () => {
  try {
    const draft = wx.getStorageSync(DRAFT_STORAGE_KEY);
    return draft && typeof draft === 'object' ? draft : {};
  } catch (error) {
    return {};
  }
};

Page({
  data: {
    statusBarHeight: 44,
    navigationBottom: 88,
    content: '',
    images: [],
    submitting: false
  },
  onLoad() {
    let info = {};
    try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (error) { info = {}; }
    const draft = readDraft();
    const statusBarHeight = Number(info.statusBarHeight || 44);
    this.setData({
      statusBarHeight,
      navigationBottom: statusBarHeight + 44,
      content: String(draft.content || ''),
      images: Array.isArray(draft.images) ? draft.images.filter(Boolean).slice(0, 3) : []
    });
  },
  onUnload() { this.saveDraft(); },
  goBack() { wx.navigateBack(); },
  onContentInput(event) {
    this.setData({ content: event.detail.value });
  },
  onAddImage() {
    const remaining = 3 - this.data.images.length;
    if (remaining <= 0) return;
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (result) => {
        const paths = (result.tempFiles || []).map((item) => item.tempFilePath).filter(Boolean);
        if (!paths.length) {
          wx.showToast({ title: '图片读取失败，请重试', icon: 'none' });
          return;
        }
        this.setData({ images: this.data.images.concat(paths).slice(0, 3) });
      }
    });
  },
  onDeleteImage(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (Number.isNaN(index)) return;
    const images = this.data.images.slice();
    images.splice(index, 1);
    this.setData({ images });
  },
  saveDraft() {
    try {
      const content = this.data.content.trim();
      if (!content && !this.data.images.length) {
        wx.removeStorageSync(DRAFT_STORAGE_KEY);
        return;
      }
      wx.setStorageSync(DRAFT_STORAGE_KEY, { content: this.data.content, images: this.data.images });
    } catch (error) {
      // Draft persistence is best-effort and must not prevent the page from closing.
    }
  },
  onSubmit() {
    const content = this.data.content.trim();
    if (!content) {
      wx.showToast({ title: '请填写反馈内容', icon: 'none' });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    this.saveDraft();
    wx.showToast({ title: '反馈已保存', icon: 'success' });
    this.setData({ submitting: false });
  }
});
