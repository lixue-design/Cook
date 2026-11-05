const { getCurrentUser, login, logout } = require('../../services/auth-api');
const authState = require('../../services/auth-state');
const { getTopNavigationLayout } = require('../../utils/top-navigation');

function getMoreActions(loggedIn) {
  const actions = [
    { label: '用户服务协议', value: 'terms' },
    { label: '隐私政策', value: 'privacy' }
  ];
  if (loggedIn) {
    actions.push(
      { label: '退出登录', value: 'logout', destructive: true },
      { label: '账号注销', value: 'cancel-account', destructive: true }
    );
  }
  return actions;
}

Page({
  data: {
    status: 'loading',
    user: null,
    loggingOut: false,
    loggingIn: false,
    loginAgreed: false,
    tabBarHeight: 56,
    safeAreaBottom: 0,
    accountTop: 96,
    loginSheetVisible: false,
    actionSheetVisible: false,
    actionSheetActions: getMoreActions(false)
  },
  onLoad() {
    const layout = getTopNavigationLayout();
    const globalData = getApp().globalData;
    this.setData({
      tabBarHeight: Number(globalData.tabBarHeight || 56),
      safeAreaBottom: Number(globalData.systemSafeAreaBottom || 0),
      accountTop: layout.navigationBottom + 10
    });
  },
  onShow() {
    this.getTabBar() && this.getTabBar().setData({ selected: 3 });
    const globalData = getApp().globalData;
    const shouldOpenLogin = !!globalData.profileLoginVisible;
    globalData.profileLoginVisible = false;
    const cached = authState.readUser();
    if (!cached) {
      this.setProfileState('loggedOut', null);
      if (shouldOpenLogin) this.setData({ loginSheetVisible: true, loginAgreed: false });
      return;
    }
    this.setProfileState('loading', cached);
    getCurrentUser().then((user) => {
      this.setProfileState('loggedIn', user);
      if (user && user.requiresAgreementConfirm) {
        this.setData({ loginSheetVisible: true, loginAgreed: false });
      }
    }).catch((error) => {
      if (error.code === 'UNAUTHENTICATED') {
        authState.clearUser();
        this.setProfileState('loggedOut', null);
        return;
      }
      this.setProfileState('loggedIn', cached);
      wx.showToast({ title: error.message || '用户信息刷新失败', icon: 'none' });
    });
  },
  setProfileState(status, user) {
    this.setData({
      status,
      user,
      actionSheetActions: getMoreActions(status !== 'loggedOut')
    });
  },
  goLogin() {
    authState.takeAuthReturnTarget();
    this.setData({ loginSheetVisible: true, loginAgreed: false });
  },
  closeLoginSheet() {
    authState.takeAuthReturnTarget();
    this.setData({ loginSheetVisible: false, loginAgreed: false });
  },
  onLoginAgreementToggle() {
    if (this.data.loggingIn) return;
    this.setData({ loginAgreed: !this.data.loginAgreed });
  },
  openLoginAgreement(event) {
    const type = event.currentTarget.dataset.type === 'privacy' ? 'privacy' : 'terms';
    wx.navigateTo({ url: `/pages/agreement/index?type=${type}` });
  },
  onWechatLogin() {
    if (this.data.loggingIn) return;
    if (!this.data.loginAgreed) {
      wx.showToast({ title: '请先阅读并同意用户协议和隐私政策', icon: 'none' });
      return;
    }
    this.setData({ loggingIn: true });
    login({}, this.data.loginAgreed).then((user) => {
      this.setProfileState('loggedIn', user);
      this.setData({ loginSheetVisible: false });
      const target = authState.takeAuthReturnTarget();
      if (target && target.url) {
        setTimeout(() => {
          if (target.tab) wx.switchTab({ url: target.url });
          else wx.navigateTo({ url: target.url });
        }, 300);
      }
    }).catch((error) => {
      wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none' });
    }).then(() => this.setData({ loggingIn: false }));
  },
  openAbout() {
    wx.navigateTo({ url: '/pages/about/index' });
  },
  openFeedback() {
    wx.navigateTo({ url: '/pages/feedback/index' });
  },
  openProfileEdit() {
    wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
  openMore() {
    this.setData({
      actionSheetActions: getMoreActions(this.data.status !== 'loggedOut'),
      actionSheetVisible: true
    });
  },
  closeMore() { this.setData({ actionSheetVisible: false }); },
  onMoreActionSelect(event) {
    const value = event.detail.value;
    this.setData({ actionSheetVisible: false });
    if (value === 'terms' || value === 'privacy') {
      wx.navigateTo({ url: `/pages/agreement/index?type=${value}` });
      return;
    }
    if (value === 'cancel-account') {
      wx.navigateTo({ url: '/pages/account-cancel/index' });
      return;
    }
    if (value === 'logout') this.onLogout();
  },
  onLogout() {
    if (this.data.loggingOut) return;
    wx.showModal({
      title: '退出登录？',
      content: '退出后需要重新登录才能使用菜谱、计划和菜篮。',
      confirmText: '退出',
      success: (result) => {
        if (!result.confirm) return;
        this.setData({ loggingOut: true });
        logout().then(() => {
          authState.clearUser();
          this.setProfileState('loggedOut', null);
        }).catch((error) => {
          wx.showToast({ title: error.message || '退出失败，请重试', icon: 'none' });
        }).then(() => this.setData({ loggingOut: false }));
      }
    });
  }
});
