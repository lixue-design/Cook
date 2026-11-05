Page({
  data: { title: '用户服务协议', type: 'terms', statusBarHeight: 44 },
  onLoad(options) {
    const type = options.type === 'privacy' ? 'privacy' : 'terms';
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({
      type,
      title: type === 'privacy' ? '隐私政策' : '用户服务协议',
      statusBarHeight: Number(info.statusBarHeight || 44)
    });
  },
  goBack() { wx.navigateBack(); }
});
