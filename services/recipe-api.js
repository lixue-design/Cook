'use strict';

const apiConfig = require('../config/recipe-api');

const mode = String(apiConfig.mode || 'mock').trim().toLowerCase();

function requireNonEmpty(value, message) {
  if (!String(value || '').trim()) {
    throw new Error(message);
  }
}

if (mode === 'mock') {
  module.exports = require('./recipe-api-mock');
} else if (mode === 'remote') {
  requireNonEmpty(
    apiConfig.cloudFunctionName,
    '菜谱 API remote 模式缺少 config/recipe-api.js 的 cloudFunctionName 配置'
  );
  module.exports = require('./recipe-api-remote');
} else {
  throw new Error(`未知的菜谱 API mode: ${apiConfig.mode}. 仅支持 mock 或 remote`);
}
