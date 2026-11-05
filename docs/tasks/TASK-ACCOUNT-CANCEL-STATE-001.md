# TASK-ACCOUNT-CANCEL-STATE-001

## 任务 ID

`TASK-ACCOUNT-CANCEL-STATE-001`

## 背景

当前 MVP 已有注销申请入口和 owner-scoped 创建 RPC，但缺少完整状态机、撤销、查看当前状态和审计日志。Full PRD 要求先建立可追踪流程，再进入 dry-run 和正式数据处理。

## 目标

建立注销申请状态机和审计基础，支持用户查看/撤销申请，并为后续管理员处理与执行任务预留 owner-scoped RPC。

## 范围

### 包含

- 扩展申请状态：`submitted`、`reviewing`、`approved`、`processing`、`completed`、`rejected`、`cancelled_by_user`、`failed`。
- 新增注销申请审计日志表。
- `account.cancelRequest.get`：用户查看当前注销申请。
- `account.cancelRequest.cancel`：用户撤销尚未进入处理的申请。
- 服务端状态流转 RPC 基础，供后续管理员流程使用。
- remote/mock service 方法和测试。

### 不包含

- dry-run 数据清单。
- 正式删除或匿名化用户数据。
- 管理后台 UI。
- 协议版本强制确认。

## 相关上下文

- 模块 spec：`docs/specs/account-cancel-automation.md`
- API：`docs/api/full-prd-api-contract.md`
- 页面：`pages/account-cancel/index`（本任务不改）
- 数据模型：`account_cancel_requests`、`account_cancel_audit_logs`

## 实现要求

- 所有用户侧操作必须使用服务端可信 owner。
- 创建申请仍保持幂等：存在 active 申请时返回当前申请。
- 撤销只允许 `submitted` / `reviewing` 状态。
- 状态流转必须写审计日志。
- 已完成、已拒绝、已撤销、已失败申请不得被用户撤销。

## Full PRD 限制

- Provider 策略：不涉及 AI；不触发生成 provider。
- 前端样式保护：不修改 WXML/WXSS、页面布局、手势、自定义 Tab 或半屏弹窗。
- 数据事实来源：`account_cancel_requests` 是注销申请状态事实源；审计日志只记录状态变更证据。
- 快照规则：不涉及计划/菜谱快照。
- 用户隔离：所有用户侧 RPC 调用通过可信 owner，客户端 userId 无效。
- 不可做事项：不执行真实删除/匿名化、不跳过 dry-run、不做管理员 UI、不做法务文案变更。

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

- 新增 migration：`0019_account_cancel_state`
- 新增 action：`account.cancelRequest.get`
- 新增 action：`account.cancelRequest.cancel`
- 扩展现有 `account.cancelRequest.create` 返回状态字段。
- 新增 remote/mock service 方法：`getCancelRequest`、`cancelCancelRequest`

## 验收标准

- [x] 用户可查看当前注销申请状态。
- [x] 用户可撤销 `submitted` / `reviewing` 状态申请。
- [x] 状态变更写入审计日志。
- [x] 所有用户侧读写 owner-scoped。
- [x] 不执行真实删除或匿名化。
- [x] 不修改小程序页面 WXML/WXSS。

## 测试要求

- [x] 单元测试：查看、撤销、创建 owner 隔离和错误态。
- [x] 迁移测试：状态枚举、审计表、RPC、rollback、search_path。
- [x] 客户端脚本或语法检查：remote/mock service 方法。
- [x] 页面冒烟：不涉及。
- [x] 回归范围：`npm --prefix server run build`、`npm --prefix server run test:unit`、`node -c services/compliance-api-remote.js`、`node -c services/compliance-api-mock.js`。

## 风险

- 后续 5.2 才实现 dry-run 和正式执行；当前状态机不会实际清理用户数据。

## 完成汇报模板

```text
完成：
- ...

验证：
- ...

风险/后续：
- ...
```
