'use strict';

const authState = require('./auth-state');
const config = require('../config/auth-api');
const { generateDefaultProfile } = require('../utils/default-profile');

const MOCK_PROFILE_STORAGE_KEY = 'cook.mock.defaultProfile';

function readStoredProfile() {
  try {
    const user = wx.getStorageSync(MOCK_PROFILE_STORAGE_KEY);
    return user && typeof user === 'object' ? user : null;
  } catch (error) {
    return null;
  }
}

function saveStoredProfile(user) {
  try { wx.setStorageSync(MOCK_PROFILE_STORAGE_KEY, user); } catch (error) { /* best effort */ }
}

function login(profile, agreed) {
  if (!agreed) return Promise.reject(Object.assign(new Error('请先阅读并同意用户协议和隐私政策'), { code: 'INVALID_ARGUMENT' }));
  const storedProfile = readStoredProfile();
  const defaults = storedProfile || generateDefaultProfile();
  const user = {
    id: 'mock-wechat-user',
    nickName: String(defaults.nickName || ''),
    avatarUrl: String(defaults.avatarUrl || ''),
    defaultProfileCode: String(defaults.defaultProfileCode || ''),
    status: 'active',
    agreedAgreementVersion: config.agreementVersion,
    requiredAgreementVersion: config.agreementVersion,
    requiresAgreementConfirm: false
  };
  saveStoredProfile(user);
  authState.setUser(user);
  return Promise.resolve(user);
}
function getCurrentUser() {
  const user = authState.readUser();
  if (!user) return Promise.reject(Object.assign(new Error('请先登录'), { code: 'UNAUTHENTICATED' }));
  return Promise.resolve({
    ...user,
    requiredAgreementVersion: config.agreementVersion,
    requiresAgreementConfirm: user.agreedAgreementVersion !== config.agreementVersion
  });
}
function logout() {
  authState.clearUser();
  return Promise.resolve({ loggedOut: true });
}

module.exports = { login, getCurrentUser, logout };
