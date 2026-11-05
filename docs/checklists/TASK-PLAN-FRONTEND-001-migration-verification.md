# TASK-PLAN-FRONTEND-001 Move Migration Verification

- migration：`0009_plan_item_move.up.sql` / `.down.sql`
- 自动检查：版本配对、owner 过滤、只更新 `meal_plan_id/sort_order`、不改快照、PUBLIC 权限撤销。
- 已通过：TypeScript build、migration contract、plan action tests。
- 未运行：独立 PostgreSQL 的 migrate/rollback/integration；原因是未配置 `TEST_DATABASE_URL`。
- 剩余风险：同餐段并发重排及 sort order 间隙需真实数据库复核；读取顺序有稳定的创建时间/ID 兜底。
