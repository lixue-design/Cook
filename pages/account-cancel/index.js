const { createCancelRequest } = require('../../services/compliance-api');
const { requireAuthenticated } = require('../../services/auth-state');

Page({
  data: {
    statusBarHeight: 44,
    reason: '',
    submitting: false,
    request: null
  },
  onLoad() {
    if (!requireAuthenticated()) return;
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusBarHeight: Number(info.statusBarHeight || 44) });
  },
  goBack() { wx.navigateBack(); },
  onReasonInput(event) { this.setData({ reason: event.detail.value }); },
  submitRequest() {
    if (this.data.submitting || this.data.request) return;
    wx.showModal({
      title: '确认提交注销申请？',
      content: '提交后工作人员将核验并处理。当前版本不会立即自动删除数据。',
      confirmText: '确认提交',
      confirmColor: '#D84A4A',
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ submitting: true });
        createCancelRequest(this.data.reason).then((request) => {
          this.setData({ request });
          wx.showToast({ title: '申请已提交', icon: 'success' });
        }).catch((error) => {
          wx.showToast({ title: error.message || '提交失败，请重试', icon: 'none' });
        }).then(() => this.setData({ submitting: false }));
      }
    });
  }
});
