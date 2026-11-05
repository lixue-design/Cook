# TASK-MONTH-PLAN-TEMPLATE-001

## 任务 ID

`TASK-MONTH-PLAN-TEMPLATE-001`

## 背景

Full PRD 要求用户可以保存优质月计划为模板，并应用到其他月份。现有系统以日级计划为唯一事实源，月计划只做聚合，因此模板必须单独保存计划快照，应用时再写回日级计划。

## 目标

提供月度模板持久化和应用能力，支持创建、列表、删除和应用模板到目标月份。

## 范围

### 包含

- 新增月度模板表和 owner-scoped RPC。
- `plans.monthTemplates.create`：从目标月份日级计划快照保存模板。
- `plans.monthTemplates.list`：查询当前用户模板列表。
- `plans.monthTemplates.delete`：删除当前用户模板。
- `plans.monthTemplates.apply`：将模板按日期序号应用到目标月份，最终写入日级计划快照。
- remote/mock service 方法和测试。

### 不包含

- 月度模板页面 UI。
- 模板分享或多人共用。
- 模板智能推荐。
- 创建月计划独立事实表。

## 相关上下文

- 模块 spec：`docs/specs/plan-advanced.md`、`docs/specs/plan.md`、`docs/specs/rule-generation-engine.md`
- API：`docs/api/full-prd-api-contract.md`
- 页面：不涉及
- 数据模型：`month_plan_templates`、`month_plan_template_items`、`meal_plans`、`meal_plan_recipes`

## 实现要求

- 所有写入必须使用服务端可信 owner。
- 模板保存必须读取日级计划快照，不能读取当前菜谱覆盖历史计划。
- 模板应用必须写入日级计划事实和快照。
- 应用默认 `mode=replace`，可预留 `merge`；首版 service 使用 replace。
- `confirmToken` 必须等于 `CONFIRM`。
- 日期映射按月内日序号：模板第 1 天应用到目标月 1 日，超出目标月天数的模板项跳过。

## Full PRD 限制

- Provider 策略：不涉及 AI；不触发生成 provider。
- 前端样式保护：不修改 WXML/WXSS、页面布局、手势、自定义 Tab 或半屏弹窗。
- 数据事实来源：日级 `meal_plans` / `meal_plan_recipes` 是唯一餐单事实源；模板是独立快照来源。
- 快照规则：模板保存计划快照；应用模板复制模板快照，不读取当前菜谱。
- 用户隔离：所有 RPC 调用通过可信 owner，客户端 userId 无效。
- 不可做事项：不创建月计划事实表、不写菜篮、不接 AI、不做页面 UI、不做跨用户共享。

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

- 新增 migration：`0018_month_plan_templates`
- 新增 action：`plans.monthTemplates.create`
- 新增 action：`plans.monthTemplates.list`
- 新增 action：`plans.monthTemplates.apply`
- 新增 action：`plans.monthTemplates.delete`
- 新增 remote/mock service 方法。

## 验收标准

- [x] 模板保存只保存当前 owner 的目标月份计划快照。
- [x] 模板列表只返回当前 owner 模板。
- [x] 模板应用要求确认标记，并最终写入日级计划快照。
- [x] 模板删除只影响当前 owner 模板。
- [x] 不修改小程序页面 WXML/WXSS。

## 测试要求

- [x] 单元测试：创建、列表、应用、删除、confirmToken、owner 隔离。
- [x] 迁移测试：表、RPC、rollback、search_path。
- [x] 客户端脚本：remote service payload 和响应映射。
- [x] 页面冒烟：不涉及。
- [x] 回归范围：`npm --prefix server run build`、`npm --prefix server run test:unit`、`npm run test:meal-plan-api-remote`。

## 风险

- 首版模板应用按日序号映射，不处理“按星期对齐”的高级复用；后续页面若需要周对齐，可新增明确模式。

## 完成汇报模板

```text
完成：
- ...

验证：
- ...

风险/后续：
- ...
```
