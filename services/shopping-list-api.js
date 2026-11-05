'use strict';

const apiConfig = require('../config/basket-api');
const mode = String(apiConfig.mode || 'mock').trim().toLowerCase();

if (mode === 'mock') {
  module.exports = require('./shopping-list-api-mock');
} else if (mode === 'remote') {
  if (!String(apiConfig.cloudFunctionName || '').trim()) {
    throw new Error('菜篮 API remote 模式缺少 config/basket-api.js 的 cloudFunctionName 配置');
  }
  module.exports = require('./shopping-list-api-remote');
} else {
  throw new Error(`未知的菜篮 API mode: ${apiConfig.mode}. 仅支持 mock 或 remote`);
}
