# TASK-AUTH-001 Migration 验证

- migration：`0011_auth_profile.up.sql` / `.down.sql`
- schema version：11
- 前置版本：10
- up：为 `app_users` 增加公开资料、状态和协议版本字段；增加 owner-scoped get/update RPC。
- down：删除新增 RPC 和字段，不删除用户、菜谱、计划或菜篮数据。
- 静态契约测试：通过。
- 真实测试库：未配置 `TEST_DATABASE_URL`，待提测环境执行 apply / verify / rollback / re-apply。
