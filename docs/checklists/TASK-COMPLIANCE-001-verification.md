# TASK-COMPLIANCE-001 验证记录

日期：2026-07-31

## 完成

- 我的页包含用户信息、用户服务协议、隐私政策、账号注销和退出登录入口。
- 用户服务协议和隐私政策具有明确版本 `2026-07-31`，登录前也可访问。
- 新增注销说明页、危险操作确认、选填原因、提交中/失败/成功记录状态。
- 新增 `account_cancel_requests` 和 owner-scoped 幂等申请 RPC；重复提交返回现有 active 申请。
- 新增公共 `agreements.latest` / `agreements.get` 和需可信身份的 `account.cancelRequest.create`。
- 不自动删除用户数据，不增加运营后台或远程配置，保持 MVP 边界。

## 自动验证

- `npm run test:compliance-client`
- `node --check pages/account-cancel/index.js`
- app manifest 确认登录、协议和注销页均已注册。
- 服务端构建通过。
- compliance、auth、migration 定向测试：20 项通过，0 项失败。

## 人工冒烟待办

- [ ] 我的页 -> 用户协议 -> 返回。
- [ ] 我的页 -> 隐私政策 -> 返回。
- [ ] 我的页 -> 账号注销 -> 取消确认，不产生记录。
- [ ] 提交注销申请，页面展示申请编号、状态和提交时间。
- [ ] 重复提交返回原 active 申请。
- [ ] 未登录访问注销页时跳转登录。
- [ ] 自定义 Tab、安全区和退出确认无视觉回归。

## 风险与后续

- 当前协议/隐私正文为 MVP 静态版本，提审前必须由 PM/法务确认；不得将“技术可访问”视为法务批准。
- 真实申请的人工处理责任人、SLA 和状态更新方式需在发布运行手册明确。
- 未配置 `TEST_DATABASE_URL`，真实 PostgreSQL apply/rollback/re-apply 待提测环境执行。
