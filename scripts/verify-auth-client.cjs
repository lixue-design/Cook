'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
const storage = {};
const navigations = [];
const tabSwitches = [];
const currentPages = [{
  route: 'pages/recipe-detail/index',
  options: { id: 'cabbage' },
  data: {},
  setData(update) { Object.assign(this.data, update); }
}];
const app = { globalData: {} };
const wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; },
  removeStorageSync(key) { delete storage[key]; },
  navigateTo(options) { navigations.push(options.url); if (options.complete) options.complete(); },
  switchTab(options) { tabSwitches.push(options.url); if (options.complete) options.complete(); }
};

function load(relativePath, requireFn, extras = {}) {
  const filename = path.join(rootDir, relativePath);
  const moduleStub = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: moduleStub,
    exports: moduleStub.exports,
    require: requireFn,
    wx,
    getApp: () => app,
    getCurrentPages: () => currentPages,
    setTimeout(callback) { callback(); },
    Promise,
    Error,
    ...extras
  }, { filename });
  return moduleStub.exports;
}

const authState = load('services/auth-state.js', (request) => {
  if (request === '../config/auth-api') return { agreementVersion: '2026-11-05' };
  return require(request);
});
assert.equal(authState.isAuthenticated(), false);
assert.equal(authState.requireAuthenticated(), false);
assert.equal(tabSwitches.length, 0, '未登录拦截不能离开当前页面');
assert.equal(currentPages[0].data.globalLoginSheetVisible, true, '未登录拦截必须在当前页面打开登录弹窗');
assert.equal(authState.takeAuthReturnTarget(), null, '当前页登录不需要跳转回跳目标');
authState.setUser({ id: 'user-a', nickName: '半勺用户', agreedAgreementVersion: '2026-11-05' });
assert.equal(authState.isAuthenticated(), true);
assert.equal(storage['cook.currentUser'].id, 'user-a');
currentPages[0].data.globalLoginSheetVisible = false;
authState.handleApiError({ code: 'UNAUTHENTICATED' });
assert.equal(authState.isAuthenticated(), false);
assert.equal(tabSwitches.length, 0, '读请求鉴权失败不能离开当前页面');
assert.equal(currentPages[0].data.globalLoginSheetVisible, false, '读请求鉴权失败不应主动弹出登录窗');
authState.setUser({ id: 'user-a', nickName: '半勺用户', agreedAgreementVersion: '2026-11-05' });
authState.handleApiError({ code: 'UNAUTHENTICATED' }, { promptLogin: true });
assert.equal(tabSwitches.length, 0, '写操作鉴权失败也必须停留当前页面');
assert.equal(currentPages[0].data.globalLoginSheetVisible, true, '写操作鉴权失败必须在当前页面提示登录');

const calls = [];
const remoteWx = {
  cloud: {
    callFunction({ name, data }) {
      calls.push({ name, data });
      const response = data.action === 'agreements.latest'
        ? { requiredAgreementVersion: '2026-08-05' }
        : data.action === 'auth.me'
          ? { id: 'user-a', nickName: '半勺用户', status: 'active' }
          : data.action === 'auth.wechatLogin'
            ? { user: { id: 'user-a', nickName: '半勺用户', status: 'active' } }
            : { loggedOut: true };
      return Promise.resolve({ result: { ok: true, data: response } });
    }
  }
};
const remote = load('services/auth-api-remote.js', (request) => {
  if (request === '../config/auth-api') return {
    cloudFunctionName: 'cook-api',
    agreementVersion: '2026-07-31'
  };
  if (request === './auth-state') return authState;
  if (request === './diagnostics') return { recordFailure() {}, recordSuccess() {} };
  throw new Error(`unexpected require ${request}`);
}, { wx: remoteWx });

async function main() {
  const profilePage = read('pages/profile/index.js');
  const profileMarkup = read('pages/profile/index.wxml');
  const profileStyles = read('pages/profile/index.wxss');
  assert.ok(!profilePage.includes('wx.getUserProfile'), 'profile login must not request a WeChat nickname or avatar when defaults are server-assigned');
  assert.ok(profilePage.includes('login({}, this.data.loginAgreed)'), 'profile login must rely on server-assigned default profile data');
  assert.ok(profilePage.includes('loginSheetVisible: true'), 'profile login must open in-page');
  assert.ok(profilePage.includes('loginAgreed'), 'profile login must record agreement consent');
  assert.ok(profilePage.includes("if (!this.data.loginAgreed)"), 'profile login must block authorization before consent');
  assert.ok(profileMarkup.includes('《用户服务协议》') && profileMarkup.includes('《隐私政策》'), 'login sheet must show both required agreement links');
  assert.ok(profileStyles.includes('width: 32rpx;') && profileStyles.includes('height: 48rpx;'), 'login agreement control must match the Figma 16px checkbox and 24px line');
  const loginSheetPage = read('components/login-sheet/index.js');
  const loginSheetMarkup = read('components/login-sheet/index.wxml');
  assert.ok(loginSheetPage.includes('login({}, true)'), 'global login sheet must reuse the existing server-assigned profile login');
  assert.ok(loginSheetPage.includes('dismissLoginSheet()'), 'global login sheet must close without navigating away from the current page');
  assert.ok(loginSheetMarkup.includes('《用户服务协议》') && loginSheetMarkup.includes('《隐私政策》'), 'global login sheet must retain both agreement links');
  [
    'recipe-list', 'meal-plan', 'shopping-list', 'recipe-detail',
    'recipe-search', 'recipe-create', 'profile-edit', 'account-cancel'
  ].forEach((pageName) => {
    assert.ok(read(`pages/${pageName}/index.wxml`).includes('<login-sheet visible="{{globalLoginSheetVisible}}" />'), `${pageName} must mount the current-page login sheet`);
    assert.ok(read(`pages/${pageName}/index.json`).includes('"login-sheet": "/components/login-sheet/index"'), `${pageName} must register the current-page login sheet`);
  });
  const defaults = read('utils/default-profile.js');
  assert.ok(defaults.includes('PRESET_AVATAR_URLS') && defaults.includes('DEFAULT_SUFFIX_ALPHABET'), 'default profiles must define preset avatars and their suffix alphabet');
  await assert.rejects(() => remote.login({}, false), /请先阅读/);
  const user = await remote.login({ nickName: '半勺用户' }, true);
  assert.equal(user.id, 'user-a');
  assert.equal(calls[0].data.action, 'agreements.latest');
  assert.equal(calls[1].data.action, 'auth.wechatLogin');
  assert.equal(calls[1].data.payload.agreedAgreementVersion, '2026-08-05');
  assert.equal((await remote.getCurrentUser()).status, 'active');
  await remote.logout();
  assert.equal(authState.isAuthenticated(), false);
  console.log('auth client verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
