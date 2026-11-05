Component({
  properties: {
    visible: { type: Boolean, value: false },
    actions: { type: Array, value: [] },
    title: { type: String, value: '' },
    cancelText: { type: String, value: '取消' },
    closeOnMask: { type: Boolean, value: true }
  },
  data: {
    rendered: false,
    closing: false,
    opening: false,
    viewportHeight: 0,
    safeAreaBottom: 0
  },
  observers: {
    visible(visible) {
      if (visible) this.open();
      else this.close();
    }
  },
  lifetimes: {
    detached() {
      clearTimeout(this.openTimer);
      clearTimeout(this.closeTimer);
      this.setTabBarHidden(false);
    }
  },
  methods: {
    setTabBarHidden(hidden) {
      const page = getCurrentPages().slice(-1)[0];
      const tabBar = page && page.getTabBar ? page.getTabBar() : null;
      if (tabBar) tabBar.setData({ hidden });
    },
    open() {
      clearTimeout(this.closeTimer);
      if (this.data.rendered && !this.data.closing) return;
      let info = {};
      try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (error) { info = {}; }
      const safeArea = info.safeArea || {};
      const screenHeight = Number(info.screenHeight || info.windowHeight || 0);
      const safeAreaBottom = Math.max(0, screenHeight - Number(safeArea.bottom || screenHeight));
      this.setTabBarHidden(true);
      this.setData({
        rendered: true,
        closing: false,
        opening: false,
        viewportHeight: Number(info.windowHeight || screenHeight),
        safeAreaBottom
      }, () => {
        this.openTimer = setTimeout(() => {
          if (this.data.rendered && !this.data.closing) this.setData({ opening: true });
        }, 16);
      });
    },
    close() {
      clearTimeout(this.openTimer);
      if (!this.data.rendered || this.data.closing) return;
      this.setData({ closing: true, opening: false });
      this.closeTimer = setTimeout(() => {
        this.setData({ rendered: false, closing: false });
        this.setTabBarHidden(false);
        this.triggerEvent('afterclose');
      }, 260);
    },
    requestClose(reason) {
      this.triggerEvent('close', { reason });
    },
    onMaskTap() {
      if (this.properties.closeOnMask) this.requestClose('mask');
    },
    onCancelTap() { this.requestClose('cancel'); },
    onOptionTap(event) {
      const index = Number(event.currentTarget.dataset.index);
      const action = this.properties.actions[index];
      this.triggerEvent('select', { index, action, value: action && action.value });
    },
    noop() {}
  }
});
