const { fetchMonthPlan } = require('../../services/meal-plan-api');

const pad2 = (value) => String(value).padStart(2, '0');
const formatMonth = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
const monthTitle = (month) => `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
const mealLabels = { breakfast: '早', lunch: '午', dinner: '晚' };

Page({
  data: {
    statusBarHeight: 44,
    navigationBottom: 88,
    contentTop: 100,
    status: 'loading',
    month: '',
    monthTitle: '',
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    calendarDays: [],
    plannedDays: 0,
    totalDays: 0
  },
  onLoad(options) {
    let info = {};
    try { info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (error) { info = {}; }
    const statusBarHeight = Number(info.statusBarHeight || 44);
    const navigationBottom = statusBarHeight + 44;
    const month = options.month && /^\d{4}-\d{2}$/.test(options.month)
      ? options.month
      : formatMonth(new Date());
    this.setData({
      statusBarHeight,
      navigationBottom,
      contentTop: navigationBottom + 12,
      month,
      monthTitle: monthTitle(month)
    });
    this.loadMonth(month);
  },
  onBack() {
    const pages = getCurrentPages ? getCurrentPages() : [];
    if (pages.length > 1) {
      wx.navigateBack();
      return;
    }
    wx.switchTab({ url: '/pages/meal-plan/index' });
  },
  onPrevMonth() { this.changeMonth(-1); },
  onNextMonth() { this.changeMonth(1); },
  onRetry() { this.loadMonth(this.data.month); },
  changeMonth(offset) {
    const date = new Date(`${this.data.month}-01T00:00:00`);
    date.setMonth(date.getMonth() + offset);
    const month = formatMonth(date);
    this.setData({ month, monthTitle: monthTitle(month) });
    this.loadMonth(month);
  },
  loadMonth(month) {
    this.setData({ status: 'loading' });
    fetchMonthPlan(month).then((result) => {
      const calendarDays = this.buildCalendarDays(result);
      const plannedDays = Number(result.summary && result.summary.plannedDays || 0);
      this.setData({
        status: plannedDays ? 'success' : 'empty',
        calendarDays,
        plannedDays,
        totalDays: Number(result.summary && result.summary.totalDays || calendarDays.filter((item) => !item.placeholder).length)
      });
    }).catch((error) => {
      this.setData({ status: 'error' });
      wx.showToast({ title: error.message || '月计划加载失败', icon: 'none' });
    });
  },
  buildCalendarDays(result) {
    const days = Array.isArray(result && result.days) ? result.days : [];
    const firstDate = days[0] && days[0].date;
    const leading = firstDate ? ((new Date(`${firstDate}T00:00:00`).getDay() + 6) % 7) : 0;
    const placeholders = Array.from({ length: leading }, (_, index) => ({ id: `placeholder-${index}`, placeholder: true }));
    return placeholders.concat(days.map((day) => {
      const meals = Array.isArray(day.meals) ? day.meals : [];
      const mealSummaries = ['breakfast', 'lunch', 'dinner'].map((type) => {
        const meal = meals.find((item) => item.type === type) || {};
        const items = Array.isArray(meal.items) ? meal.items : [];
        const titles = items.map((item) => item.title).filter(Boolean).slice(0, 2);
        return {
          type,
          label: mealLabels[type],
          text: titles.join('、'),
          count: items.length
        };
      });
      return {
        id: day.date,
        date: day.date,
        day: day.day,
        weekday: day.weekday,
        weekStartDate: day.weekStartDate,
        mealSummaries,
        hasItems: mealSummaries.some((meal) => meal.count > 0)
      };
    }));
  }
});
