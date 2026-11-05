# TASK-COMPLIANCE-001 Migration 验证

- migration：`0012_account_cancel_requests.up.sql` / `.down.sql`
- schema version：12
- 前置版本：11
- up：创建 owner-scoped 注销申请表、active 申请唯一索引和幂等创建 RPC。
- down：删除创建 RPC 和申请表，不触碰用户业务内容。
- 静态契约测试：通过。
- 真实测试库：未配置 `TEST_DATABASE_URL`，待提测环境执行 apply / verify / rollback / re-apply。
