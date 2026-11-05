const { login } = require('../../services/auth-api');
const { dismissLoginSheet } = require('../../services/auth-state');

Component({
  properties: {
    visible: { type: Boolean, value: false }
  },
  data: {
    loggingIn: false,
    loginAgreed: false,
    safeAreaBottom: 0
  },
  observers: {
    visible(visible) {
      if (visible && !this.data.loggingIn) this.setData({ loginAgreed: false });
    }
  },
  lifetimes: {
    attached() {
      const app = getApp();
      this.setData({ safeAreaBottom: Number(app.globalData.systemSafeAreaBottom || 0) });
    }
  },
  methods: {
    close() {
      if (this.data.loggingIn) return;
      dismissLoginSheet();
      this.triggerEvent('close');
    },
    onAgreementToggle() {
      if (!this.data.loggingIn) this.setData({ loginAgreed: !this.data.loginAgreed });
    },
    openAgreement(event) {
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
      login({}, true).then((user) => {
        dismissLoginSheet();
        this.triggerEvent('success', { user });
      }).catch((error) => {
        wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none' });
      }).then(() => this.setData({ loggingIn: false }));
    }
  }
});
