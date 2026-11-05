'use strict';

const env = typeof process !== 'undefined' && process.env ? process.env : {};
// 与菜谱、计划和菜篮统一指向体验版业务云函数。
const configuredMode = 'remote';
const configuredCloudFunctionName = 'cook-recipe-api';

module.exports = {
  mode: String(env.AUTH_API_MODE || configuredMode).trim().toLowerCase(),
  cloudFunctionName: String(
    env.AUTH_CLOUD_FUNCTION_NAME
      || env.RECIPE_CLOUD_FUNCTION_NAME
      || env.PLAN_CLOUD_FUNCTION_NAME
      || configuredCloudFunctionName
  ).trim(),
  agreementVersion: String(env.AGREEMENT_VERSION || '2026-11-05').trim()
};
