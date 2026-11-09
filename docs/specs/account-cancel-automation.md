# 账号自助注销 Spec

## 1. 模块目标

让用户无需联系客服或运营者处理，即可在小程序内发起、撤回并完成账号注销。确认后有 7 天可撤回期；期满后由受保护的服务端定时任务自动删除其业务数据。

## 2. 范围

### 2.1 必做

- 用户可创建、查看和撤回当前注销申请。
- 创建申请后展示预计删除时间和注销状态。
- 7 天可撤回期结束后，服务端定时任务自动执行删除。
- 删除失败自动退避重试；未实际完成前不展示“已注销”。
- 删除范围覆盖账号资料、菜谱、分类、计划、菜篮、生成草稿及已上传菜谱封面。
- 仅保留不含 OpenID、UnionID、菜谱、计划、菜篮、图片路径和注销原因的最小完成记录。
- 协议与隐私政策须明确该自动化规则，并以新版本要求用户再次确认。

### 2.2 不做

- 不允许客户端直接触发最终删除。
- 不由人工逐条审核或处理普通注销申请。
- 不恢复已完成注销的原账号数据。
- 不删除法律法规明确要求保留的、已脱敏的记录。

## 3. 状态机

```text
cooling_off --用户撤回--> cancelled_by_user
cooling_off --到期--> processing --成功--> completed（随后删除申请和账号）
                              --失败--> retrying --到期重试--> processing
```

## 4. API 契约建议

| REST 语义 | Action | 说明 |
| --- | --- | --- |
| `GET /api/account/cancel-request` | `account.cancelRequest.get` | 查看当前申请。 |
| `POST /api/account/cancel-request` | `account.cancelRequest.create` | 提交申请。 |
| `POST /api/account/cancel-request/cancel` | `account.cancelRequest.cancel` | 用户撤销未处理申请。 |
| 定时器内部调用 | `system.accountCancellation.runDue` | 仅云开发定时器触发：领取到期任务、删除封面、提交数据库删除。 |
| `POST /api/agreements/confirm` | `agreements.confirm` | 确认新协议版本。 |

## 5. 数据模型建议

- `account_cancel_requests`
- `account_cancel_audit_logs`
- `account_cancel_tombstones`
- `agreement_versions`
- `user_agreement_confirmations`

## 6. 业务规则

- 用户可提交注销申请，但最终删除只能由服务端定时任务执行。
- 任务领取使用行锁和 `SKIP LOCKED`，避免两个定时器重复处理同一账号。
- 先移除用户上传的封面原图和缩略图，再在单个数据库事务中删除业务行与账号；处理任务必须幂等。
- 删除失败记录有限错误码和下一次重试时间，不存储用户输入或底层错误详情。
- 普通业务请求不会自动创建已删除账号；用户需要再次明确登录并同意协议，才会建立新的空账号。
- 定时器令牌仅存云函数运行时环境变量及定时器的受保护自定义参数，不写入小程序、数据库迁移、日志或仓库；定时器通过 `Message` 传递 `system.accountCancellation.runDue` 与同一令牌。

## 7. 验收标准

- 可查看当前注销申请状态。
- 创建申请后返回 `cooling_off` 和预计删除时间，用户可在 7 天内自行撤回。
- 客户端不能传用户 ID 越权执行到期删除。
- 成功任务会删除规定范围的数据和封面原图/缩略图；再次运行同一任务不产生副作用。
- 执行失败自动重试；完成后用户无法继续访问原账号数据。
- 协议新版本可触发重新确认。

## 8. 测试建议

- 单元测试：封面路径扩展、任务失败重试、未确认完成不得误报成功。
- 迁移检查：状态约束、到期索引、最小完成记录、回滚 SQL。
- 人工验收：体验环境创建、撤回、模拟到期任务、完成后重新登录为新空账号；使用专用测试账号和测试封面。
