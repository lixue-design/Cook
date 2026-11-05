'use strict';

const env = typeof process !== 'undefined' && process.env ? process.env : {};
// 当前体验版统一使用业务环境中的真实数据；正式发布必须改为目标环境配置。
const configuredMode = 'remote';
const configuredCloudFunctionName = 'cook-recipe-api';

// 本地独立开发可临时改为 mock；体验版不可混用 mock 与 remote 数据。
module.exports = {
  mode: String(env.RECIPE_API_MODE || configuredMode).trim().toLowerCase(),
  cloudFunctionName: String(env.RECIPE_CLOUD_FUNCTION_NAME || configuredCloudFunctionName).trim(),
  imageLibraryBaseUrl: 'http://127.0.0.1:3000'
};
