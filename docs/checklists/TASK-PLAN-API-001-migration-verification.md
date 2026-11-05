# TASK-PLAN-API-001 Migration Verification

## 基本信息

| 字段 | 内容 |
| --- | --- |
| 任务 ID | `TASK-PLAN-API-001` |
| 模块 | 计划 |
| migration | `0007_day_plans.up.sql` / `0007_day_plans.down.sql` |
| 验证日期 | 2026-07-31 |
| 环境 | Codex sandbox；无已授权测试数据库 |
| 数据库 | PostgreSQL |

## 前置检查

- [x] up/down 文件配对且版本唯一。
- [x] 未包含密钥、token、生产地址或用户隐私。
- [x] `meal_plans.owner_id` 强制关联用户，读取/删除 RPC 同时按 owner、日期和餐段过滤。
- [x] 计划项保存独立 `recipe_snapshot`，菜谱软删除不会修改或级联删除计划项。
- [x] source、meal type、sort order 和 JSON 快照均有数据库约束。

## 已执行验证

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| TypeScript 构建 | Pass | `npm --prefix server run build` |
| migration 配对、版本、关键 DDL/RPC 静态契约 | Pass | `migration-contract.test` |
| action 日期、餐段、UUID、可信身份和错误态 | Pass | `plan-api.test` |
| 服务端快照映射与原菜谱删除后展示 | Pass | `plan-api.test` |
| 菜谱接口回归 | Pass | `recipe-api.test` |

## 无法运行时的替代记录

```text
未运行：
- npm --prefix server run migrate
- npm --prefix server run verify
- npm --prefix server run rollback
- npm --prefix server run test:integration

未运行原因：
- 当前进程未提供 TEST_DATABASE_URL；不允许复用应用 DATABASE_URL，也不对未知数据库执行迁移。

替代检查：
- migration contract 验证 0007 up/down 配对、表、约束、快照字段、owner 过滤、RPC 和权限收敛。
- database-integration.test.ts 已加入真实 SQL 场景：写入快照、跨用户不可见/不可删除、软删除原菜谱后快照可读、owner 可移除。
- build 与不依赖数据库的 plan API 测试通过。

剩余风险：
- 0007 的 up/down、函数 search_path 和 RPC JSON 形态仍需在隔离 PostgreSQL 测试库执行集成测试后确认。
```

## 结论

| 项 | 结果 |
| --- | --- |
| 自动化静态/单元门禁 | Pass |
| 真实 migration up/down | Skipped |
| 安全与隐私检查 | Pass |
| 是否阻塞后续无数据库任务 | 否 |
| 提测前动作 | 在独立 TEST_DATABASE_URL 下执行 `npm --prefix server run test:integration` |
