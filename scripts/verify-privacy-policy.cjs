'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const policyPage = read('pages/agreement/index.wxml');
const migration = read('database/migrations/0032_privacy_policy_self_service_cancellation.up.sql');
const rollback = read('database/migrations/0032_privacy_policy_self_service_cancellation.down.sql');
const authConfig = read('config/auth-api.js');
const authState = read('services/auth-state.js');

[
  '李雪',
  'recipe001@163.com',
  'OpenID',
  '菜谱封面',
  '文字生成',
  '图片识别',
  '小红书公开链接',
  '腾讯云 OCR',
  '账号注销',
  '7 天可撤回期',
  '自动删除账号、菜谱、计划、菜篮和已上传菜谱封面',
  '2026年11月6日'
].forEach((token) => assert.ok(policyPage.includes(token), `隐私政策页面缺少：${token}`));

[
  "'2026-11-06'",
  '李雪',
  'recipe001@163.com',
  'ON CONFLICT (version) DO UPDATE',
  'UPDATE agreement_versions',
  'required = false'
].forEach((token) => assert.ok(migration.includes(token), `协议迁移缺少：${token}`));

assert.ok(rollback.includes("version = '2026-11-05'"), '回滚必须恢复上一版协议为 required');
assert.ok(authConfig.includes("'2026-11-06'"), '客户端默认协议版本必须更新');
assert.ok(authState.includes('hasCurrentAgreement'), '旧版协议用户必须在写操作前重新确认');

console.log('privacy policy verification passed');
