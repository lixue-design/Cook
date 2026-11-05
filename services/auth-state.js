'use strict';

const authConfig = require('../config/auth-api');

const STORAGE_KEY = 'cook.currentUser';
let cachedUser;

function readUser() {
  if (cachedUser !== undefined) return cachedUser;
  try {
    cachedUser = wx.getStorageSync(STORAGE_KEY) || null;
  } catch (error) {
    cachedUser = null;
  }
  return cachedUser;
}

function setUser(user) {
  cachedUser = user || null;
  try {
    if (cachedUser) wx.setStorageSync(STORAGE_KEY, cachedUser);
    else wx.removeStorageSync(STORAGE_KEY);
  } catch (error) {
    // A storage failure must not turn a successful server login into a crash.
  }
  const app = typeof getApp === 'function' ? getApp() : null;
  if (app && app.globalData) app.globalData.currentUser = cachedUser;
  return cachedUser;
}

function clearUser() { return setUser(null); }
function hasCurrentAgreement(user) {
  return Boolean(
    user
    && user.requiresAgreementConfirm !== true
    && String(user.agreedAgreementVersion || '') === String(authConfig.agreementVersion || '')
  );
}
function isAuthenticated() {
  const user = readUser();
  return Boolean(user && user.id && hasCurrentAgreement(user));
}

const TAB_ROUTES = [
  'pages/recipe-list/index',
  'pages/meal-plan/index',
  'pages/shopping-list/index',
  'pages/profile/index'
];

function currentRouteTarget() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  const page = pages && pages[pages.length - 1];
  if (!page || !page.route || page.route === 'pages/profile/index') return null;
  const options = page.options || {};
  const query = Object.keys(options).map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(options[key])}`).join('&');
  return {
    url: `/${page.route}${query ? `?${query}` : ''}`,
    tab: TAB_ROUTES.indexOf(page.route) >= 0
  };
}

function loginPromptPage() {
  const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
  return pages && pages[pages.length - 1];
}

function redirectToLogin() {
  const page = loginPromptPage();
  const app = typeof getApp === 'function' ? getApp() : null;
  if (page && typeof page.setData === 'function') {
    if (page.route === 'pages/profile/index') {
      page.setData({ loginSheetVisible: true, loginAgreed: false });
    } else {
      page.setData({ globalLoginSheetVisible: true });
    }
    return false;
  }
  // A page normally exists for every user-triggered action. Retain this
  // fallback only for calls made before the page stack is ready.
  if (app && app.globalData) app.globalData.profileLoginVisible = true;
  const navigate = typeof wx.switchTab === 'function' ? wx.switchTab : wx.navigateTo;
  navigate({
    url: '/pages/profile/index'
  });
  return false;
}

function dismissLoginSheet() {
  const page = loginPromptPage();
  if (page && typeof page.setData === 'function') page.setData({ globalLoginSheetVisible: false });
}

function requireAuthenticated() {
  return isAuthenticated() || redirectToLogin();
}

function takeAuthReturnTarget() {
  const app = typeof getApp === 'function' ? getApp() : null;
  if (!app || !app.globalData) return null;
  const target = app.globalData.authReturnTarget || null;
  app.globalData.authReturnTarget = null;
  return target;
}

function handleApiError(error, options = {}) {
  if (error && error.code === 'UNAUTHENTICATED') {
    clearUser();
    if (options.promptLogin) redirectToLogin();
    return true;
  }
  return false;
}

module.exports = {
  readUser,
  setUser,
  clearUser,
  isAuthenticated,
  hasCurrentAgreement,
  requireAuthenticated,
  dismissLoginSheet,
  takeAuthReturnTarget,
  handleApiError,
  STORAGE_KEY
};
