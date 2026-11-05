Component({
  data: {
    hidden: false,
    selected: 0,
    barHeight: 56,
    safeAreaBottom: 0,
    list: [
      { pagePath: '/pages/recipe-list/index', text: '食谱', iconPath: '/assets/tab-bar/recipes.svg', selectedIconPath: '/assets/tab-bar/recipes-selected.svg' },
      { pagePath: '/pages/meal-plan/index', text: '计划', iconPath: '/assets/tab-bar/plan.svg', selectedIconPath: '/assets/tab-bar/plan-selected.svg' },
      { pagePath: '/pages/shopping-list/index', text: '菜篮', iconPath: '/assets/tab-bar/basket.svg', selectedIconPath: '/assets/tab-bar/basket-selected.svg' },
      { pagePath: '/pages/profile/index', text: '我的', iconPath: '/assets/tab-bar/profile.svg', selectedIconPath: '/assets/tab-bar/profile-selected.svg' }
    ]
  },
  lifetimes: {
    attached() {
      const { tabBarHeight, safeAreaBottom, tabBarCoveredByModal } = getApp().globalData;
      this.setData({ barHeight: tabBarHeight, safeAreaBottom, hidden: !!tabBarCoveredByModal });
    }
  },
  methods: {
    switchTab(event) {
      const { path, index } = event.currentTarget.dataset;
      // Update before routing so the highlight never lags behind page switching.
      this.setData({ selected: Number(index) });
      wx.switchTab({ url: path });
    }
  }
});
