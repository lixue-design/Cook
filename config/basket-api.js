'use strict';

const env = typeof process !== 'undefined' && process.env ? process.env : {};
// 与菜谱、计划和登录统一指向体验版业务云函数。
const configuredMode = 'remote';
const configuredCloudFunctionName = 'cook-recipe-api';

module.exports = {
  mode: String(env.BASKET_API_MODE || configuredMode).trim().toLowerCase(),
  cloudFunctionName: String(
    env.BASKET_CLOUD_FUNCTION_NAME
      || env.PLAN_CLOUD_FUNCTION_NAME
      || env.RECIPE_CLOUD_FUNCTION_NAME
      || configuredCloudFunctionName
  ).trim()
};
