const { logout } = require('../../services/auth-api');
const { clearUser, isAuthenticated } = require('../../services/auth-state');

Page({
  data: {
    statusBarHeight: 44,
    navigationBottom: 88,
    loggedIn: false,
    loggingOut: false
  },
  onLoad() {
    let info = {};
    try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (error) { info = {}; }
    const statusBarHeight = Number(info.statusBarHeight || 44);
    this.setData({
      statusBarHeight,
      navigationBottom: statusBarHeight + 44,
      loggedIn: isAuthenticated()
    });
  },
  goBack() { wx.navigateBack(); },
  openAgreement(event) {
    const type = event.currentTarget.dataset.type === 'privacy' ? 'privacy' : 'terms';
    wx.navigateTo({ url: `/pages/agreement/index?type=${type}` });
  },
  openCancelAccount() {
    if (!this.data.loggedIn) return;
    wx.navigateTo({ url: '/pages/account-cancel/index' });
  },
  onLogout() {
    if (!this.data.loggedIn || this.data.loggingOut) return;
    wx.showModal({
      title: '退出登录？',
      content: '退出后需要重新登录才能使用菜谱、计划和菜篮。',
      confirmText: '退出',
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ loggingOut: true });
        logout().then(() => {
          clearUser();
          wx.navigateBack();
        }).catch((error) => {
          wx.showToast({ title: error.message || '退出失败，请重试', icon: 'none' });
        }).then(() => this.setData({ loggingOut: false }));
      }
    });
  }
});
