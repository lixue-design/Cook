'use strict';

const apiConfig = require('../config/plan-api');
const mode = String(apiConfig.mode || 'mock').trim().toLowerCase();

if (mode === 'mock') {
  module.exports = require('./meal-plan-api-mock');
} else if (mode === 'remote') {
  if (!String(apiConfig.cloudFunctionName || '').trim()) {
    throw new Error('计划 API remote 模式缺少 config/plan-api.js 的 cloudFunctionName 配置');
  }
  module.exports = require('./meal-plan-api-remote');
} else {
  throw new Error(`未知的计划 API mode: ${apiConfig.mode}. 仅支持 mock 或 remote`);
}
