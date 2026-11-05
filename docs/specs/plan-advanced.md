# 计划增强与月计划 Spec

## 1. 模块目标

在现有日/周计划基础上，实现历史复刻、选择性同步菜篮和月计划能力，让用户可以跨周、跨月复用餐单并查看月度饮食概览。

计划增强必须和 `docs/specs/rule-generation-engine.md` 协同：首版不使用 AI 自动月计划，所有生成和批量填充都走可解释规则 provider，并综合用户习惯、三餐差异和轻量营养均衡。

## 2. 范围

### 2.1 必做

- 历史日计划查看和一键复刻。
- 日计划选择指定菜品同步菜篮。
- 月历视图聚合当月日/周计划。
- 一键将某周计划复用到月内空白周次。
- 月度批量清空、批量复用、全局替换指定菜品。
- 月度统计：菜品数、不重复菜品数、高频食材、空缺日期。
- 月度餐单模板保存和次月复用。
- 用户饮食习惯设置。
- 规则生成时考虑是否吃早餐、三餐偏好、忌口、常用主食、耗时和用餐人数。

### 2.2 不做

- 不引入 AI 自动月计划。
- 不做复杂营养分析。
- 不做多人共享计划。

## 3. 核心流程

### 3.1 历史日计划复刻

```text
日计划 -> 历史入口 -> 选择历史日期 -> 预览三餐 -> 复刻到目标日期 -> 保存快照
```

### 3.2 选择性同步菜篮

```text
日计划 -> 勾选部分菜品 -> 同步到周菜篮 -> 保留手动项 -> 更新计划来源项
```

### 3.3 月计划

```text
月计划页 -> 查看月历聚合 -> 批量填充/清空/复用/替换 -> 查看统计 -> 保存模板
```

### 3.4 用户习惯驱动生成

```text
用户设置习惯 -> 生成周/月计划 -> 规则引擎按三餐和营养均衡选择菜谱 -> 写入日级计划事实 -> 周/月视图同步
```

## 4. API 契约建议

| REST 语义 | Action | 说明 |
| --- | --- | --- |
| `POST /api/day-plans/{date}/clone` | `plans.day.clone` | 从历史日期复刻到目标日期。 |
| `POST /api/baskets/{weekStartDate}/sync-selected` | `baskets.week.syncSelected` | 只同步指定计划项食材。 |
| `GET /api/month-plans/{month}` | `plans.month.get` | 聚合当月计划。 |
| `POST /api/month-plans/{month}/fill-from-week` | `plans.month.fillFromWeek` | 复制周计划到月内空白周。 |
| `POST /api/month-plans/{month}/clear` | `plans.month.clear` | 清空整月或指定周次。 |
| `POST /api/month-plans/{month}/replace-recipe` | `plans.month.replaceRecipe` | 月度范围全局替换菜品。 |
| `GET /api/month-plans/{month}/stats` | `plans.month.stats` | 月度统计。 |
| `POST /api/month-plan-templates` | `plans.monthTemplates.create` | 保存月度模板。 |
| `POST /api/month-plan-templates/{id}/apply` | `plans.monthTemplates.apply` | 应用模板到目标月份。 |
| `GET /api/plan-preferences` | `plans.preferences.get` | 获取用户饮食习惯。 |
| `PUT /api/plan-preferences` | `plans.preferences.update` | 更新用户饮食习惯。 |

## 5. 数据模型建议

- 现有 `meal_plans` 和 `meal_plan_recipes` 仍是单日/餐段事实表。
- 月计划默认是聚合视图，不重复存储每日餐单。
- 模板单独存储快照：`month_plan_templates`、`month_plan_template_days`。
- 批量操作记录审计：`plan_bulk_operation_logs`。
- 用户习惯单独存储：`plan_preferences`。

## 6. 业务规则

- 所有复制/替换都写入菜谱快照。
- 日级计划是唯一事实表，周/月视图只聚合或批量写入日级事实。
- 生成规则优先满足用户是否吃早餐、三餐偏好、忌口和常用主食。
- 正餐优先保证主食、蛋白质、蔬菜的轻量均衡。
- 同一主要食材尽量不连续，菜谱不足时返回 warning 并放宽规则。
- 批量清空必须二次确认。
- 全局替换只影响目标月份范围内的计划项，不改原菜谱。
- 历史复刻默认复制快照；若原菜谱仍存在，可选择刷新为当前菜谱版本，但必须明确提示。
- 选择性同步菜篮保留手动项。

## 7. 错误态

| 场景 | 处理 |
| --- | --- |
| 目标日期已有计划 | 提示覆盖或合并。 |
| 月内无空白周 | 批量填充不可执行并说明原因。 |
| 替换菜品不存在 | 阻止操作。 |
| 批量操作部分失败 | 返回成功/失败明细，并提供重试。 |

## 8. 验收标准

- 可回溯历史日计划并复刻到任意日期。
- 可只同步选中菜品食材到周菜篮。
- 月历可展示当月每日三餐概览。
- 可批量填充、清空、复用和替换。
- 月度统计与当前计划数据一致。
- 模板可保存并应用到另一个月份。
- 用户习惯会影响新生成的周/月计划。
- 日计划手动修改后，周/月计划聚合结果同步变化。

## 9. 测试建议

- 单元测试：月份边界、自然周归属、统计计算。
- 接口测试：复刻、批量操作、模板应用、用户隔离。
- 页面冒烟：月历、确认弹窗、批量操作、统计空态。
