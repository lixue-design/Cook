# TASK-SECURITY-RPC-001 Migration 验证

- migration：`0014_harden_all_rpc_search_paths.up.sql` / `.down.sql`
- schema version：14
- 前置版本：13
- up：将当前 schema 的 `ai_dish_library_*` 和 `cook_*` SECURITY DEFINER
  函数固定为 `pg_catalog, current_schema, extensions`，不包含调用者 `$user`。
- down：恢复 0014 之前两类函数的路径策略。
- 静态契约与全部核心 API 定向测试：53 项通过。
- 真实测试库：未配置 `TEST_DATABASE_URL`，待提测环境验证实际 `proconfig` 和回滚。
