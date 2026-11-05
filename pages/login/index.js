Page({
  onLoad() {
    const app = getApp();
    app.globalData.profileLoginVisible = true;
    wx.switchTab({ url: '/pages/profile/index' });
  }
});
