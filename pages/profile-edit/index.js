const { readUser, setUser, requireAuthenticated } = require('../../services/auth-state');

Page({
  data: {
    statusBarHeight: 44,
    navigationBottom: 88,
    avatarUrl: '',
    nickname: '',
    saving: false
  },
  onLoad() {
    if (!requireAuthenticated()) return;
    let info = {};
    try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (error) { info = {}; }
    this.currentUser = readUser() || {};
    const statusBarHeight = Number(info.statusBarHeight || 44);
    this.setData({
      statusBarHeight,
      navigationBottom: statusBarHeight + 44,
      avatarUrl: String(this.currentUser.avatarUrl || ''),
      nickname: String(this.currentUser.nickName || '')
    });
  },
  goBack() { wx.navigateBack(); },
  onChooseAvatar() {
    if (this.data.saving) return;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (result) => {
        const file = result.tempFiles && result.tempFiles[0];
        const avatarUrl = file && file.tempFilePath;
        if (!avatarUrl) {
          wx.showToast({ title: '图片读取失败，请重试', icon: 'none' });
          return;
        }
        this.setData({ avatarUrl });
      }
    });
  },
  onNicknameInput(event) { this.setData({ nickname: event.detail.value }); },
  onSave() {
    if (this.data.saving) return;
    const nickName = this.data.nickname.trim();
    if (!nickName) {
      wx.showToast({ title: '请输入用户名', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    setUser({
      ...this.currentUser,
      nickName,
      avatarUrl: this.data.avatarUrl
    });
    wx.showToast({ title: '资料已保存', icon: 'success' });
    this.setData({ saving: false });
    wx.navigateBack();
  }
});
