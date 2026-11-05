'use strict';

const env = typeof process !== 'undefined' && process.env ? process.env : {};
// 与菜谱、菜篮和登录统一指向体验版业务云函数。
const configuredMode = 'remote';
const configuredCloudFunctionName = 'cook-recipe-api';

module.exports = {
  mode: String(env.PLAN_API_MODE || configuredMode).trim().toLowerCase(),
  cloudFunctionName: String(
    env.PLAN_CLOUD_FUNCTION_NAME || env.RECIPE_CLOUD_FUNCTION_NAME || configuredCloudFunctionName
  ).trim()
};
