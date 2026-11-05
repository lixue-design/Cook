# 账号注销自动化 Spec

## 1. 模块目标

在现有注销申请入口基础上，建立可审计、可追踪、可回滚决策的注销处理流程，并在产品/法务确认后支持 15 个工作日内完成账号注销、数据删除或匿名化。

## 2. 范围

### 2.1 必做

- 注销申请状态机。
- 处理 SLA 和到期提醒。
- 注销前置校验。
- 数据删除/匿名化 dry-run。
- 正式处理任务和审计日志。
- 注销完成后强制退出登录。
- 协议版本更新后重新确认。

### 2.2 不做

- 不在无备份、无审计时物理删除真实用户数据。
- 不允许客户端直接触发最终删除。
- 不处理法律法规要求保留的日志删除。

## 3. 状态机

```text
submitted -> reviewing -> approved -> processing -> completed
         -> rejected
         -> cancelled_by_user
         -> failed
```

## 4. API 契约建议

| REST 语义 | Action | 说明 |
| --- | --- | --- |
| `GET /api/account/cancel-request` | `account.cancelRequest.get` | 查看当前申请。 |
| `POST /api/account/cancel-request` | `account.cancelRequest.create` | 提交申请。 |
| `POST /api/account/cancel-request/cancel` | `account.cancelRequest.cancel` | 用户撤销未处理申请。 |
| `POST /api/admin/account-cancel/{id}/review` | `admin.accountCancel.review` | 管理员审核。 |
| `POST /api/admin/account-cancel/{id}/dry-run` | `admin.accountCancel.dryRun` | 生成将删除/匿名化的数据清单。 |
| `POST /api/admin/account-cancel/{id}/execute` | `admin.accountCancel.execute` | 执行注销处理任务。 |
| `POST /api/agreements/confirm` | `agreements.confirm` | 确认新协议版本。 |

## 5. 数据模型建议

- `account_cancel_requests`
- `account_cancel_audit_logs`
- `account_cancel_execution_jobs`
- `agreement_versions`
- `user_agreement_confirmations`

## 6. 业务规则

- 用户可提交注销申请，但最终删除必须由服务端任务执行。
- 执行前必须生成 dry-run 清单。
- 处理任务必须幂等。
- 删除或匿名化范围至少覆盖用户资料、自建菜谱、计划、菜篮和相关草稿/缓存提示。
- 保留法律法规要求的脱敏合规日志。
- 协议版本更新后，下次登录或进入核心功能前必须重新确认。

## 7. 验收标准

- 可查看当前注销申请状态。
- 可记录审核、dry-run、执行和完成日志。
- 执行失败可诊断并可重试。
- 注销完成后用户无法继续访问原账号数据。
- 协议新版本可触发重新确认。

## 8. 测试建议

- 单元测试：状态机、SLA 计算、幂等执行。
- 集成测试：dry-run、删除/匿名化、用户隔离。
- 人工验收：法务文案、处理流程、日志权限。
