let activeModal = null;

Component({
  options: { multipleSlots: true },
  properties: {
    visible: { type: Boolean, value: false },
    height: { type: String, value: '532rpx' },
    closeOnMask: { type: Boolean, value: true },
    coverTabBar: { type: Boolean, value: true },
    showClose: { type: Boolean, value: false },
    closeIcon: { type: String, value: '/assets/add-recipe/close.svg' },
    panelRadius: { type: String, value: '16rpx 16rpx 0 0' },
    panelShadow: { type: String, value: '0 0 8rpx rgba(0, 0, 0, 0.1), inset 0 1rpx 0 #e2ebea' },
    bottomOffset: { type: String, value: '0px' },
    avoidKeyboard: { type: Boolean, value: false },
    keyboardHeight: { type: Number, value: 0 }
  },
  data: {
    rendered: false,
    closing: false,
    viewportHeight: 0,
    resolvedKeyboardHeight: 0,
    keyboardReady: true,
    opening: false
  },
  observers: {
    visible(visible) {
      if (visible) this.open();
      else this.close();
    },
    keyboardHeight(height) {
      this.updateKeyboardHeight(Number(height || 0));
    }
  },
  lifetimes: {
    attached() {
      if (this.properties.visible) this.open();
    },
    detached() {
      clearTimeout(this.closeTimer);
      clearTimeout(this.openTimer);
      clearTimeout(this.keyboardSettleTimer);
      clearTimeout(this.keyboardReadyFallbackTimer);
      clearTimeout(this.openingTimer);
      if (activeModal === this) {
        activeModal = null;
        this.setTabBarHidden(false);
      }
      this.tabBar = null;
    }
  },
  pageLifetimes: {
    show() {
      if (!this.properties.visible && !this.data.rendered) return;
      this.tabBar = null;
      this.setTabBarHidden(true);
    }
  },
  methods: {
    setTabBarHidden(hidden) {
      if (!this.properties.coverTabBar) return;
      getApp().globalData.tabBarCoveredByModal = hidden;
      let tabBar = this.tabBar;
      if (!tabBar) {
        const pages = getCurrentPages();
        const page = pages[pages.length - 1];
        tabBar = page && page.getTabBar ? page.getTabBar() : null;
        if (tabBar) this.tabBar = tabBar;
      }
      if (tabBar) tabBar.setData({ hidden });
    },
    open() {
      clearTimeout(this.closeTimer);
      clearTimeout(this.openTimer);
      if (this.data.rendered && !this.data.closing) return;
      if (activeModal && activeModal !== this) {
        const previousModal = activeModal;
        previousModal.triggerEvent('close', { reason: 'replaced' });
        previousModal.close();
        this.openTimer = setTimeout(() => {
          this.openTimer = null;
          if (this.properties.visible) this.finishOpen();
        }, 280);
        return;
      }
      this.finishOpen();
    },
    finishOpen() {
      activeModal = this;
      this.setTabBarHidden(true);
      let viewportHeight = 0;
      try {
        const metrics = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        viewportHeight = Number(metrics.windowHeight || 0);
      } catch (error) {
        viewportHeight = 0;
      }
      const resolvedKeyboardHeight = this.properties.avoidKeyboard ? Number(this.properties.keyboardHeight || 0) : 0;
      const keyboardReady = !this.properties.avoidKeyboard || resolvedKeyboardHeight > 0;
      this.setData({ rendered: true, closing: false, viewportHeight, resolvedKeyboardHeight, keyboardReady: false, opening: false }, () => {
        if (keyboardReady) this.startPanelEntrance();
      });
      clearTimeout(this.keyboardReadyFallbackTimer);
      if (!keyboardReady) {
        this.keyboardReadyFallbackTimer = setTimeout(() => {
          if (this.data.rendered && !this.data.closing && !this.data.keyboardReady) this.startPanelEntrance();
        }, 1200);
      }
    },
    close() {
      clearTimeout(this.closeTimer);
      if (!this.data.rendered) {
        if (activeModal === this) {
          activeModal = null;
          this.setTabBarHidden(false);
        }
        return;
      }
      if (this.data.closing) return;
      clearTimeout(this.keyboardSettleTimer);
      clearTimeout(this.keyboardReadyFallbackTimer);
      clearTimeout(this.openingTimer);
      this.setData({ closing: true, opening: false });
      this.closeTimer = setTimeout(() => {
        this.setData({ rendered: false, closing: false, resolvedKeyboardHeight: 0, keyboardReady: !this.properties.avoidKeyboard, opening: false });
        if (activeModal === this) {
          activeModal = null;
          this.setTabBarHidden(false);
        }
        this.triggerEvent('afterclose');
        this.closeTimer = null;
      }, 260);
    },
    onMaskTap() {
      if (this.properties.closeOnMask) this.triggerEvent('close');
    },
    updateKeyboardHeight(height) {
      if (!this.properties.avoidKeyboard || !this.data.rendered || this.data.closing) return;
      if (!height) {
        if (this.data.keyboardReady && this.data.resolvedKeyboardHeight) this.setData({ resolvedKeyboardHeight: 0 });
        return;
      }
      clearTimeout(this.keyboardSettleTimer);
      this.keyboardSettleTimer = setTimeout(() => {
        if (!this.data.rendered || this.data.closing) return;
        clearTimeout(this.keyboardReadyFallbackTimer);
        if (this.data.keyboardReady) {
          this.setData({ resolvedKeyboardHeight: height });
          return;
        }
        this.setData({ resolvedKeyboardHeight: height }, () => this.startPanelEntrance());
      }, 48);
    },
    startPanelEntrance() {
      if (!this.data.rendered || this.data.closing || this.data.keyboardReady) return;
      wx.nextTick(() => {
        if (!this.data.rendered || this.data.closing || this.data.keyboardReady) return;
        this.setData({ keyboardReady: true, opening: true });
        clearTimeout(this.openingTimer);
        this.openingTimer = setTimeout(() => {
          if (this.data.rendered && !this.data.closing) this.setData({ opening: false });
        }, 320);
      });
    },
    onCloseTap() { this.triggerEvent('close'); },
    noop() {}
  }
});
