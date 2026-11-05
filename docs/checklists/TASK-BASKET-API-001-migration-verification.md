# TASK-BASKET-API-001 Migration Verification

- migration：`0010_shopping_baskets.up.sql` / `.down.sql`
- schema version：10
- 已验证：owner + week 唯一、source/checked/sourceRefs 约束、owner-scoped RPC、同步事务只替换 plan 项并保留 manual 项。
- 单测覆盖：获取、同步、新增、勾选更新、删除、批量勾选、非法参数、同步前置失败不调用替换。
- database integration 已加入重复同步保留 manual 项与跨用户隔离场景。
- 未运行：真实 PostgreSQL migrate/verify/rollback/integration，因为未配置独立 `TEST_DATABASE_URL`。
- 后续：`TASK-BASKET-MERGE-001` 将把逐条提取替换为同名同单位数字精确合并。
