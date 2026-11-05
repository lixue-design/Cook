# TASK-AGREEMENT-VERSION-001

## 任务 ID

`TASK-AGREEMENT-VERSION-001`

## 背景

Full PRD 要求协议版本更新后，用户下次登录或进入核心功能前必须重新确认。当前协议版本写在服务端/小程序配置常量中，`auth.me` 不返回是否需要重新确认，缺少协议版本事实源和确认记录。

## 目标

建立协议版本事实源和用户确认状态，提供查询、确认与登录态强制确认信号。

## 范围

### 包含

- 新增协议版本表和用户确认记录表。
- `agreements.latest` / `agreements.get` 从服务端协议版本事实源读取。
- `agreements.myStatus`：查询当前用户协议确认状态。
- `agreements.confirm`：确认当前 required 协议版本。
- `auth.me` 返回 `requiredAgreementVersion` 和 `requiresAgreementConfirm`。
- 登录确认协议时校验版本有效并记录确认。
- remote/mock service 方法和测试。

### 不包含

- 新协议文案法务定稿。
- 强制确认页面 UI 或弹窗样式改造。
- 多版本富文本管理后台。
- 真实 CloudBase/真机冒烟。

## 相关上下文

- 模块 spec：`docs/specs/account-cancel-automation.md`
- API：`docs/api/full-prd-api-contract.md`
- 页面：`pages/login/index`、`pages/agreement/index`、`pages/profile/index`（本任务不改 WXML/WXSS）
- 数据模型：`agreement_versions`、`user_agreement_confirmations`、`app_users.agreed_agreement_version`

## 实现要求

- 协议 latest/get 可公开读取；用户确认状态和确认操作必须使用可信 owner。
- `auth.me` 必须返回是否需要重新确认，供核心功能拦截复用。
- `auth.wechatLogin` 和 `agreements.confirm` 必须校验确认版本是当前 required 版本。
- 确认协议需更新 `app_users.agreed_agreement_version` 并写入确认记录。
- 不因本任务改动既有登录页 WXML/WXSS。

## Full PRD 限制

- Provider 策略：不涉及 AI；不触发生成 provider。
- 前端样式保护：不修改 WXML/WXSS、页面布局、手势、自定义 Tab 或半屏弹窗。
- 数据事实来源：`agreement_versions` 是协议版本事实源；`app_users.agreed_agreement_version` 和确认记录是用户确认事实。
- 快照规则：不涉及计划/菜谱快照。
- 用户隔离：用户确认状态通过可信 owner 读取和写入，客户端 userId 无效。
- 不可做事项：不提交未确认法务新文案、不做页面视觉改造、不绕过后端版本校验。

## 前端设计保护

- 是否改 WXML：否
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：不涉及
  - 弹窗：不涉及
  - 手势：不涉及
  - 空态/加载态/失败态：后续页面任务覆盖

## API/数据变更

- 新增 migration：`0020_agreement_versions`
- 新增 action：`agreements.myStatus`
- 新增 action：`agreements.confirm`
- 扩展 `agreements.latest` / `agreements.get` 为数据库协议源。
- 扩展 `auth.me` / `auth.wechatLogin` 的协议版本校验和返回字段。

## 验收标准

- [x] 最新协议和指定版本协议从服务端事实源读取。
- [x] 用户可查询是否需要重新确认协议。
- [x] 用户确认协议会写入确认记录并更新当前确认版本。
- [x] `auth.me` 返回 `requiresAgreementConfirm`。
- [x] 登录确认协议时校验版本有效。
- [x] 不修改小程序页面 WXML/WXSS。

## 测试要求

- [x] 单元测试：latest/get/myStatus/confirm、登录版本校验、owner 隔离。
- [x] 迁移测试：协议版本表、确认表、RPC、rollback、search_path。
- [x] 客户端脚本或语法检查：auth/compliance service 方法。
- [x] 页面冒烟：不涉及。
- [x] 回归范围：`npm --prefix server run build`、`npm --prefix server run test:unit`、`node -c services/auth-api-remote.js`、`node -c services/auth-api-mock.js`、`node -c services/compliance-api-remote.js`、`node -c services/compliance-api-mock.js`。

## 风险

- 当前仍使用占位协议正文；法务最终文案和真实提审环境冒烟仍属发布门禁。

## 完成汇报模板

```text
完成：
- ...

验证：
- ...

风险/后续：
- ...
```
