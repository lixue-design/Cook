'use strict';

const config = require('../config/auth-api');
let activeRequest = null;
let confirmedAgreementVersion = config.agreementVersion;

function getLatestAgreement() {
  return Promise.resolve({
    serviceAgreementVersion: config.agreementVersion,
    privacyPolicyVersion: config.agreementVersion,
    requiredAgreementVersion: config.agreementVersion
  });
}

function getAgreement(type, version) {
  const normalizedType = String(type || '');
  if (normalizedType !== 'service' && normalizedType !== 'privacy' && normalizedType !== 'terms') {
    return Promise.reject(Object.assign(new Error('协议类型无效'), { code: 'INVALID_ARGUMENT' }));
  }
  return Promise.resolve({
    type: normalizedType === 'terms' ? 'service' : normalizedType,
    version: version || config.agreementVersion,
    title: normalizedType === 'privacy' ? '隐私政策' : '用户服务协议',
    content: normalizedType === 'privacy'
      ? '半勺处理微信用户标识及经授权的昵称、头像，用于账户识别和用户数据隔离；不获取手机号。'
      : '半勺提供菜谱、用餐计划与采购清单管理服务。用户应合法使用服务并对自行录入的内容负责。'
  });
}

function getAgreementStatus() {
  return Promise.resolve({
    agreedAgreementVersion: confirmedAgreementVersion,
    requiredAgreementVersion: config.agreementVersion,
    requiresAgreementConfirm: confirmedAgreementVersion !== config.agreementVersion,
    confirmedAt: null
  });
}

function confirmAgreement(version) {
  if (String(version || '') !== config.agreementVersion) {
    return Promise.reject(Object.assign(new Error('协议版本无效'), { code: 'INVALID_ARGUMENT' }));
  }
  confirmedAgreementVersion = config.agreementVersion;
  return getAgreementStatus();
}

function getCancelRequest() {
  return Promise.resolve(activeRequest ? { ...activeRequest } : null);
}

function createCancelRequest(reason) {
  if (String(reason || '').length > 500) {
    return Promise.reject(Object.assign(new Error('注销原因不能超过 500 个字符'), { code: 'INVALID_ARGUMENT' }));
  }
  if (!activeRequest) {
    activeRequest = {
      id: `cancel-${Date.now()}`,
      status: 'submitted',
      submittedAt: new Date().toISOString()
    };
  }
  return Promise.resolve({ ...activeRequest });
}

function cancelCancelRequest() {
  if (!activeRequest || !['submitted', 'reviewing'].includes(activeRequest.status)) {
    return Promise.reject(Object.assign(new Error('注销申请不存在或不可撤销'), { code: 'NOT_FOUND' }));
  }
  activeRequest = {
    ...activeRequest,
    status: 'cancelled_by_user',
    updatedAt: new Date().toISOString()
  };
  return Promise.resolve({ ...activeRequest });
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
