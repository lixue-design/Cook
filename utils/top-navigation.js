function getTopNavigationLayout() {
  let windowInfo = {};
  try { windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync(); } catch (error) { windowInfo = {}; }
  const statusBarHeight = Number(windowInfo.statusBarHeight || 44);
  const windowWidth = Number(windowInfo.windowWidth || 375);
  const menuButton = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
  const menuTop = Number((menuButton && menuButton.top) || (statusBarHeight + 6));
  const menuHeight = Number((menuButton && menuButton.height) || 32);
  const menuLeft = Number((menuButton && menuButton.left) || (windowWidth - 91));
  const contentTop = menuTop + (menuHeight - 24) / 2;
  const navigationBottom = menuTop + menuHeight + 6;
  return {
    statusBarHeight,
    navigationHeight: navigationBottom - statusBarHeight,
    navigationBottom,
    contentTop,
    actionsRight: windowWidth - menuLeft + 15
  };
}

module.exports = { getTopNavigationLayout };
