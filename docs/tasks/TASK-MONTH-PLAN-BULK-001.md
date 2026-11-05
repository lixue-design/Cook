# TASK-MONTH-PLAN-BULK-001

## 任务 ID

`TASK-MONTH-PLAN-BULK-001`

## 背景

Full PRD 要求月计划支持批量填充、清空、复用和全局替换。现有系统已经有日级计划事实表、日计划复刻 RPC 和月聚合 API，本任务需要在不创建月计划事实表的前提下补齐最小批量写能力。

## 目标

提供月度批量操作后端 action 和 service 方法，所有写入最终落到日级计划快照。

## 范围

### 包含

- `plans.month.clear`：清空整月或指定日期范围的日计划。
- `plans.month.fillFromWeek`：将源周按周循环填充到目标月份空白日期。
- `plans.month.replaceRecipe`：在目标月范围内把指定原菜谱替换为另一菜谱当前快照。
- 所有写操作要求 `confirmToken`。
- 补充 remote/mock service 方法和测试。

### 不包含

- 月计划页面批量操作 UI。
- 月度统计。
- 月计划模板。
- 创建月计划独立事实表。

## 相关上下文

- 模块 spec：`docs/specs/plan-advanced.md`、`docs/specs/plan.md`、`docs/specs/rule-generation-engine.md`
- API：`docs/api/full-prd-api-contract.md`
- 页面：不涉及
- 数据模型：`meal_plans`、`meal_plan_recipes`

## 实现要求

- 所有批量写操作必须使用服务端可信 owner。
- `confirmToken` 必须等于 `CONFIRM`。
- `fillFromWeek` 只填充目标月内空白日期；复制源周对应星期的日计划快照。
- `clear` 只删除目标月或指定范围内当前 owner 的日级计划。
- `replaceRecipe` 只影响目标月内 `recipe_id = fromRecipeId` 的计划项，替换为 `toRecipeId` 的当前菜谱快照。
- 返回操作摘要，并可重新读取月聚合结果。

## Full PRD 限制

- Provider 策略：不涉及 AI；不触发生成 provider。
- 前端样式保护：不修改 WXML/WXSS、页面布局、手势、自定义 Tab 或半屏弹窗。
- 数据事实来源：日级 `meal_plans` / `meal_plan_recipes` 是唯一事实源；月计划只聚合。
- 快照规则：填充复制源日计划快照；替换写入目标菜谱当前快照；不修改原菜谱。
- 用户隔离：所有 RPC 调用通过可信 owner，客户端 userId 无效。
- 不可做事项：不创建月计划事实表、不写菜篮、不接 AI、不做页面 UI。

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

- 新增 action：`plans.month.clear`
- 新增 action：`plans.month.fillFromWeek`
- 新增 action：`plans.month.replaceRecipe`
- 新增 remote service：`clearMonthPlan`、`fillMonthPlanFromWeek`、`replaceMonthPlanRecipe`
- 复用现有 RPC，不新增 migration。

## 验收标准

- [x] 批量操作缺少确认标记时拒绝写入。
- [x] 清空只删除目标月份或指定范围内的日级计划。
- [x] 周复用只填充目标月空白日期，并复制快照。
- [x] 全局替换只影响目标月份内指定菜谱计划项。
- [x] 所有写操作 owner-scoped。
- [x] 不修改小程序页面 WXML/WXSS。

## 测试要求

- [x] 单元测试：confirmToken、清空、周填充、替换、owner 隔离。
- [x] 客户端脚本：remote service payload 和响应映射。
- [x] 页面冒烟：不涉及。
- [x] 回归范围：`npm --prefix server run build`、`npm --prefix server run test:unit`、`npm run test:meal-plan-api-remote`。

## 风险

- 首版为了避免新增迁移，批量能力由 action 编排现有 owner-scoped RPC；大数据量月份后续可优化为事务型批量 RPC。
- 替换使用目标菜谱当前快照，符合“全局替换”语义；历史复用仍复制源快照。

## 完成汇报模板

```text
完成：
- ...

验证：
- ...

风险/后续：
- ...
```
