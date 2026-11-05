Component({
  properties: {
    targetUrl: { type: String, value: '' }
  },
  data: { bottomOffset: 72 },
  lifetimes: {
    attached() { this.setData({ bottomOffset: getApp().globalData.tabBarHeight + 16 }); }
  },
  methods: {
    onTap() {
      const { targetUrl } = this.properties;
      if (targetUrl) wx.navigateTo({ url: targetUrl });
      this.triggerEvent('tap');
    }
  }
});
