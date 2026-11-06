const {
  getCancelRequest,
  createCancelRequest,
  cancelCancelRequest
} = require('../../services/compliance-api');
const { requireAuthenticated } = require('../../services/auth-state');

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '');
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const presentRequest = (request) => {
  if (!request) return null;
  if (request.status === 'cancelled_by_user') return null;
  return {
    ...request,
    submittedAtText: formatDateTime(request.submittedAt),
    scheduledDeleteAtText: formatDateTime(request.scheduledDeleteAt)
  };
};

Page({
  data: {
    statusBarHeight: 44,
    reason: '',
    submitting: false,
    request: null,
    loading: true,
    withdrawn: false
  },
  onLoad() {
    if (!requireAuthenticated()) return;
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({ statusBarHeight: Number(info.statusBarHeight || 44) });
    this.loadRequest();
  },
  loadRequest() {
    this.setData({ loading: true });
    return getCancelRequest().then((request) => {
      this.setData({
        request: presentRequest(request),
        withdrawn: Boolean(request && request.status === 'cancelled_by_user')
      });
    }).catch((error) => {
      wx.showToast({ title: error.message || '注销状态获取失败，请重试', icon: 'none' });
    }).then(() => this.setData({ loading: false }));
  },
  goBack() { wx.navigateBack(); },
  onReasonInput(event) { this.setData({ reason: event.detail.value }); },
  submitRequest() {
    if (this.data.submitting || this.data.request) return;
    wx.showModal({
      title: '确认提交注销申请？',
      content: '提交后将进入 7 天可撤回期。到期后系统会自动删除账号及菜谱、计划、菜篮和封面图片，无法恢复。',
      confirmText: '确认提交',
      confirmColor: '#D84A4A',
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ submitting: true });
        createCancelRequest(this.data.reason).then((request) => {
          this.setData({ request: presentRequest(request), withdrawn: false });
          wx.showToast({ title: '已进入注销流程', icon: 'success' });
        }).catch((error) => {
          wx.showToast({ title: error.message || '提交失败，请重试', icon: 'none' });
        }).then(() => this.setData({ submitting: false }));
      }
    });
  },
  withdrawRequest() {
    const request = this.data.request;
    if (!request || request.status !== 'cooling_off' || this.data.submitting) return;
    wx.showModal({
      title: '撤回账号注销？',
      content: '撤回后账号和数据会继续保留。',
      confirmText: '确认撤回',
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ submitting: true });
        cancelCancelRequest(request.id).then((updated) => {
          this.setData({ request: presentRequest(updated), withdrawn: true });
          wx.showToast({ title: '已撤回注销', icon: 'success' });
        }).catch((error) => {
          wx.showToast({ title: error.message || '撤回失败，请重试', icon: 'none' });
        }).then(() => this.setData({ submitting: false }));
      }
    });
  }
});
