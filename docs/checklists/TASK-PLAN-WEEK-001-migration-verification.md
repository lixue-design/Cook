# TASK-PLAN-WEEK-001 Migration Verification

## 基本信息

| 字段 | 内容 |
| --- | --- |
| 任务 ID | `TASK-PLAN-WEEK-001` |
| 模块 | 计划 |
| migration | `0008_week_plan_generation.up.sql` / `.down.sql` |
| 验证日期 | 2026-07-31 |
| 环境 | Codex sandbox；无独立测试数据库 |

## 已验证

- [x] up/down 配对，schema 版本更新为 8。
- [x] 生成候选只读取当前 owner 未删除菜谱。
- [x] 事务内使用 owner + week advisory lock，覆盖检查和重写在同一事务。
- [x] 真实菜谱快照在数据库端重新读取生成；内置补位必须带 `builtin:true`。
- [x] RPC 权限从 PUBLIC 撤销，只向存在的 service role 授权。
- [x] 规则单测覆盖七天三餐、早餐重复/间隔、早餐与主食兜底、菜谱不足 warnings、周末耗时菜限制。
- [x] action 测试覆盖可信用户、覆盖冲突、warnings 和七日返回。

## 无法运行时的替代记录

```text
未运行：
- 0008 migrate / verify / rollback
- PostgreSQL database integration

原因：
- 当前环境没有独立 TEST_DATABASE_URL；不得复用应用数据库。

替代检查：
- migration contract 检查事务锁、覆盖分支、数据库端快照、owner 过滤、权限和 down。
- TypeScript 构建与规则/action 单元测试。
- database-integration.test.ts 已升级到 1-8 的 up/down/reapply 预期。

剩余风险：
- 真实 PostgreSQL 中 0008 函数的 JSON 遍历、覆盖并发和回滚需在隔离测试库复核。
```

## 结论

自动化门禁通过；真实 migration 验证列入提测前人工/CI 检查，不阻塞后续前端联调任务。
