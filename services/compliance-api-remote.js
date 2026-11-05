'use strict';

const config = require('../config/auth-api');
const { handleApiError } = require('./auth-state');
const diagnostics = require('./diagnostics');

function call(action, payload, fallbackMessage) {
  return wx.cloud.callFunction({
    name: config.cloudFunctionName,
    data: { action, payload: payload || {} }
  }).then((response) => {
    const result = response && response.result;
    if (!result || result.ok !== true) {
      const source = result && result.error;
      const error = new Error((source && source.message) || fallbackMessage);
      error.code = (source && source.code) || 'REMOTE_ERROR';
      error.requestId = source && source.requestId;
      diagnostics.recordFailure('compliance', action, error);
      handleApiError(error, { promptLogin: action === 'agreements.confirm' || action.indexOf('account.cancelRequest.') === 0 });
      throw error;
    }
    diagnostics.recordSuccess('compliance', action, result.data);
    return result.data;
  });
}

function getCancelRequest() {
  return call('account.cancelRequest.get', {}, '注销申请状态获取失败');
}

function getLatestAgreement() {
  return call('agreements.latest', {}, '协议版本获取失败');
}

function getAgreement(type, version) {
  const normalizedType = type === 'terms' ? 'service' : type;
  return call('agreements.get', {
    type: normalizedType,
    version: version || undefined
  }, '协议内容获取失败');
}

function getAgreementStatus() {
  return call('agreements.myStatus', {}, '协议确认状态获取失败');
}

function confirmAgreement(version) {
  return call('agreements.confirm', {
    version
  }, '协议确认失败');
}

function createCancelRequest(reason) {
  return call('account.cancelRequest.create', {
    reason: String(reason || '').trim()
  }, '注销申请提交失败');
}

function cancelCancelRequest(requestId) {
  return call('account.cancelRequest.cancel', {
    requestId: requestId || undefined
  }, '注销申请撤销失败');
}

module.exports = {
  getLatestAgreement,
  getAgreement,
  getAgreementStatus,
  confirmAgreement,
  getCancelRequest,
  createCancelRequest,
  cancelCancelRequest
};
