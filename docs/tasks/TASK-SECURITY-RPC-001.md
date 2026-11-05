# TASK-SECURITY-RPC-001 后续 RPC search_path 加固

## 背景

QA PR 门禁发现迁移 `0004` 仅加固当时存在的 `ai_dish_library_*` 函数。
`0007`–`0013` 后续新增的 `cook_*` SECURITY DEFINER RPC 使用
`SET search_path FROM CURRENT`，不在早期迁移覆盖范围内。

## 目标

增量固定当前 schema 内所有 SECURITY DEFINER 函数的对象解析路径，避免调用期
search_path 污染；提供回滚和静态契约测试。

## 范围

- 覆盖 `ai_dish_library_*` 与 `cook_*` SECURITY DEFINER 函数。
- 固定为 `pg_catalog, current_schema, extensions`。
- 不改变业务行为、函数签名和执行授权。
- 提供 down migration 恢复迁移前两类函数的路径策略。

## 验收

- [ ] 所有当前 SECURITY DEFINER RPC 被增量迁移覆盖。
- [ ] 固定路径不包含调用者 `$user`。
- [ ] migration 有 down 和契约测试。
- [ ] 服务端全量非环境阻塞测试通过。
