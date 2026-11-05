'use strict';

const apiConfig = require('../config/recipe-api');
const mode = String(apiConfig.mode || 'mock').trim().toLowerCase();

if (mode === 'mock') {
  module.exports = require('./recipe-generation-api-mock');
} else if (mode === 'remote') {
  if (!String(apiConfig.cloudFunctionName || '').trim()) {
    throw new Error('菜谱生成 API remote 模式缺少 config/recipe-api.js 的 cloudFunctionName 配置');
  }
  module.exports = require('./recipe-generation-api-remote');
} else {
  throw new Error(`未知的菜谱生成 API mode: ${apiConfig.mode}. 仅支持 mock 或 remote`);
}
