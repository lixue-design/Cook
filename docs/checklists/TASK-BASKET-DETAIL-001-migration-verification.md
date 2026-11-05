# TASK-BASKET-DETAIL-001 Migration 验证

- migration：`0013_basket_recipe_detail.up.sql` / `.down.sql`
- schema version：13
- 前置版本：12
- up：新增 owner-scoped、事务锁保护、按来源引用幂等的菜谱食材写入 RPC。
- down：仅删除新增 RPC。
- 静态契约测试：通过。
- 真实测试库：未配置 `TEST_DATABASE_URL`，待提测执行完整迁移回滚验证。
