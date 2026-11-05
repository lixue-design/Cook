'use strict';

const config = require('../config/auth-api');
const authState = require('./auth-state');
const diagnostics = require('./diagnostics');

function call(action, payload) {
  return wx.cloud.callFunction({
    name: config.cloudFunctionName,
    data: { action, payload: payload || {} }
  }).then((response) => {
    const result = response && response.result;
    if (!result || result.ok !== true) {
      const source = result && result.error;
      const error = new Error((source && source.message) || '登录服务暂时不可用');
      error.code = (source && source.code) || 'REMOTE_ERROR';
      error.requestId = source && source.requestId;
      diagnostics.recordFailure('auth', action, error);
      if (error.code === 'UNAUTHENTICATED') authState.clearUser();
      throw error;
    }
    diagnostics.recordSuccess('auth', action, result.data);
    return result.data;
  });
}

function login(profile, agreed) {
  if (!agreed) return Promise.reject(Object.assign(new Error('请先阅读并同意用户协议和隐私政策'), { code: 'INVALID_ARGUMENT' }));
  return call('agreements.latest')
    .catch(() => ({ requiredAgreementVersion: config.agreementVersion }))
    .then((agreement) => call('auth.wechatLogin', {
      agreedAgreementVersion: agreement && agreement.requiredAgreementVersion || config.agreementVersion,
      profile: profile || {}
    }))
    .then((result) => authState.setUser(result && result.user));
}
function getCurrentUser() {
  return call('auth.me').then((user) => authState.setUser(user));
}
function logout() {
  return call('auth.logout').then((result) => {
    authState.clearUser();
    return result;
  });
}

module.exports = { login, getCurrentUser, logout };
