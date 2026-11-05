'use strict';

const config = require('../config/auth-api');
const mode = String(config.mode || 'mock').trim().toLowerCase();

if (mode === 'mock') {
  module.exports = require('./auth-api-mock');
} else if (mode === 'remote') {
  if (!String(config.cloudFunctionName || '').trim()) {
    throw new Error('登录 API remote 模式缺少 config/auth-api.js 的 cloudFunctionName 配置');
  }
  module.exports = require('./auth-api-remote');
} else {
  throw new Error(`未知的登录 API mode: ${config.mode}. 仅支持 mock 或 remote`);
}
