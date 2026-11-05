# TASK-MONTH-PLAN-STATS-001

## 任务 ID

`TASK-MONTH-PLAN-STATS-001`

## 背景

Full PRD 要求月计划支持月度复盘统计。现有系统已经具备日级计划事实、月聚合 API 和月度批量操作，本任务需要在不新增月计划事实表的前提下，从日级计划快照计算统计结果。

## 目标

提供月度统计后端 action 和 service 方法，统计总计划项、不重复菜谱、高频食材和空缺日期。

## 范围

### 包含

- `plans.month.stats`：按月份或月内日期范围统计日级计划。
- 统计 `totalMealItems`、`uniqueRecipeCount`、`topIngredients`、`emptyDates`。
- 从计划菜谱快照解析食材，不读取或污染原菜谱。
- 补充 remote/mock service 方法和测试。

### 不包含

- 月度统计页面 UI。
- 复杂营养素分析或单位换算。
- 月度模板。
- 创建月计划独立事实表。

## 相关上下文

- 模块 spec：`docs/specs/plan-advanced.md`、`docs/specs/plan.md`、`docs/specs/rule-generation-engine.md`
- API：`docs/api/full-prd-api-contract.md`
- 页面：不涉及
- 数据模型：`meal_plans`、`meal_plan_recipes.recipe_snapshot`

## 实现要求

- 所有读取必须使用服务端可信 owner。
- 日期范围必须限制在目标月份内。
- `totalMealItems` 统计月内所有计划菜谱项数量。
- `uniqueRecipeCount` 优先按 `recipeId`，其次按 `recipeSnapshot.originalRecipeId`，最后按快照菜名去重。
- `topIngredients` 从快照 `ingredients[].items[].name` 或 `ingredients[].display` 解析，按出现次数倒序返回。
- `emptyDates` 返回全天三餐都没有计划项的日期。

## Full PRD 限制

- Provider 策略：不涉及 AI；不触发生成 provider。
- 前端样式保护：不修改 WXML/WXSS、页面布局、手势、自定义 Tab 或半屏弹窗。
- 数据事实来源：日级 `meal_plans` / `meal_plan_recipes` 是唯一事实源；月度统计只聚合。
- 快照规则：统计只读取计划快照，不读取当前菜谱覆盖历史计划。
- 用户隔离：所有 RPC 调用通过可信 owner，客户端 userId 无效。
- 不可做事项：不创建月计划事实表、不写菜篮、不做复杂营养分析、不接 AI、不做页面 UI。

## 前端设计保护

- 是否改 WXML：否
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：不涉及
  - 弹窗：不涉及
  - 手势：不涉及
  - 空态/加载态/失败态：后续页面任务覆盖

## API/数据变更

- 新增 action：`plans.month.stats`
- 新增 remote service：`fetchMonthPlanStats`
- 新增 mock service：`fetchMonthPlanStats`
- 复用现有 RPC，不新增 migration。

## 验收标准

- [x] 统计只读取目标月份或指定范围内的日级计划。
- [x] 总计划项、不重复菜谱、空缺日期统计准确。
- [x] 高频食材从计划快照解析并按次数排序。
- [x] 所有读取 owner-scoped。
- [x] 不修改小程序页面 WXML/WXSS。

## 测试要求

- [x] 单元测试：月份边界、日期范围、快照食材解析、owner 隔离。
- [x] 客户端脚本：remote service payload 和响应映射。
- [x] 页面冒烟：不涉及。
- [x] 回归范围：`npm --prefix server run build`、`npm --prefix server run test:unit`、`npm run test:meal-plan-api-remote`。

## 风险

- 食材解析首版只做快照字段和展示文本的轻量解析，不做复杂单位换算或营养分析。

## 完成汇报模板

```text
完成：
- ...

验证：
- ...

风险/后续：
- ...
```
