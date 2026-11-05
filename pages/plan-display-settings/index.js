const router = require('../../utils/router');
const {
  DEFAULT_SETTINGS,
  normalizePlanDisplaySettings,
  readPlanDisplaySettings,
  savePlanDisplaySettings
} = require('../../utils/plan-display-settings');

Page({
  data: { statusBarHeight: 44, settings: { ...DEFAULT_SETTINGS } },
  onLoad() {
    let windowInfo = {};
    try { windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (error) { windowInfo = {}; }
    this.setData({ statusBarHeight: Number(windowInfo.statusBarHeight || 44), settings: readPlanDisplaySettings() });
  },
  onShow() { this.setData({ settings: readPlanDisplaySettings() }); },
  onBack() { router.back(); },
  onToggleMeal(event) {
    const key = event.currentTarget.dataset.key;
    if (!['hasBreakfast', 'hasLunch', 'hasDinner'].includes(key)) return;
    const settings = normalizePlanDisplaySettings({ ...this.data.settings, [key]: !this.data.settings[key] });
    const saved = savePlanDisplaySettings(settings);
    const app = getApp();
    app.globalData.planDisplaySettings = saved;
    app.globalData.planDisplaySettingsVersion = Number(app.globalData.planDisplaySettingsVersion || 0) + 1;
    this.setData({ settings: saved });
  }
});
