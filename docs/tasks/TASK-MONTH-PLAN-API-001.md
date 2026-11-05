# TASK-MONTH-PLAN-API-001

## 任务 ID

`TASK-MONTH-PLAN-API-001`

## 背景

Full PRD 月计划能力必须以日级计划为唯一事实源。当前已有日/周计划读取和生成，但缺少按月份聚合每日三餐的 API。

## 目标

提供 `plans.month.get` 聚合接口，返回指定月份每天的三餐概览。

## 范围

### 包含

- 校验 `YYYY-MM` 月份入参。
- 遍历月份自然日，读取每日 `cook_plan_get_day`。
- 返回每天三餐和周归属信息。
- 补充 remote service 方法。
- 补充单元测试和客户端验证。

### 不包含

- 月历页面。
- 月度批量填充/清空/替换。
- 月度统计和模板。
- 新增月计划事实表。

## 相关上下文

- 模块 spec：`docs/specs/plan-advanced.md`、`docs/specs/plan.md`、`docs/specs/rule-generation-engine.md`
- API：`plans.month.get`
- 页面：不涉及
- 数据模型：`meal_plans`、`meal_plan_recipes`

## 实现要求

- 月计划只从日级计划聚合。
- 不写入任何计划数据。
- 读取必须 owner-scoped。
- 返回结构需要适合后续月历页面直接消费。
- 覆盖闰年、大小月边界。

## Full PRD 限制

- Provider 策略：不涉及 AI，不触发生成 provider。
- 前端样式保护：不修改小程序页面、组件、WXML/WXSS、手势、自定义 Tab 或半屏弹窗。
- 数据事实来源：`meal_plans` 和 `meal_plan_recipes` 是唯一事实源。
- 快照规则：返回已有计划快照，不刷新菜谱。
- 用户隔离：通过服务端可信 owner 调用 owner-scoped RPC。
- 不可做事项：不创建月计划事实表、不写日计划、不做批量操作、不做统计/模板。

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

- 新增 action：`plans.month.get`。
- remote service 新增 `fetchMonthPlan(month)`。
- 不新增数据库迁移。

## 验收标准

- [x] 可读取指定月份每天三餐概览。
- [x] 月份天数和周归属正确。
- [x] 结果来自日级计划快照。
- [x] 读取使用可信 owner，伪造 userId 不生效。
- [x] 不写入月计划事实表。
- [x] 不修改小程序页面 WXML/WXSS。

## 测试要求

- [x] 单元测试：月份校验、边界、owner 隔离、映射。
- [x] 客户端脚本：remote service payload 和响应映射。
- [x] 页面冒烟：不涉及。
- [x] 回归范围：`npm --prefix server run build`、`npm --prefix server run test:unit`、`npm run test:meal-plan-api-remote`。

## 风险

- 首版逐日读取，后续真实数据量增大时可优化为批量 RPC。

## 完成汇报模板

```text
完成：
- ...

验证：
- ...

风险/后续：
- ...
```
