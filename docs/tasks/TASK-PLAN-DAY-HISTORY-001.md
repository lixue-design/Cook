# TASK-PLAN-DAY-HISTORY-001

## 任务 ID

`TASK-PLAN-DAY-HISTORY-001`

## 背景

Full PRD 要求用户可以回溯历史日计划并一键复刻到目标日期。现有日/周计划已经以日级事实表和菜谱快照保存，但缺少跨日期复制接口。

## 目标

提供历史日计划读取与复刻后端能力，允许把源日期三餐快照复制到目标日期。

## 范围

### 包含

- 新增 owner-scoped 日计划复刻 RPC。
- 新增 `plans.day.clone` action。
- 支持 `replace` 和 `merge` 两种写入模式。
- 复刻结果继续返回页面可用的日计划结构。
- 补充 remote service 方法，便于后续页面接入。

### 不包含

- 新增历史选择页面或月历 UI。
- 刷新为当前菜谱版本。
- 复刻菜篮或自动同步菜篮。
- 月计划批量复用、模板和统计。

## 相关上下文

- 模块 spec：`docs/specs/plan-advanced.md`、`docs/specs/plan.md`、`docs/specs/rule-generation-engine.md`
- API：`docs/api/full-prd-api-contract.md`
- 页面：后端和 service 切片，不修改页面
- 数据模型：`meal_plans`、`meal_plan_recipes`

## 实现要求

- 复刻必须按服务端可信 owner 隔离。
- 源日期和目标日期必须是合法 `YYYY-MM-DD`，且不能相同。
- `replace` 模式先删除目标日期日级计划，再复制源日期快照。
- `merge` 模式保留目标日期已有计划，把源日期各餐段追加到对应餐段末尾。
- 复制 `recipe_snapshot`，不得读取当前菜谱覆盖历史快照。
- 返回结果必须复用现有日计划字段契约。

## Full PRD 限制

- Provider 策略：不涉及 AI；历史复刻只复制既有日级计划快照，不触发生成 provider。
- 前端样式保护：本任务不修改 WXML/WXSS、布局结构、交互手势、自定义 Tab 或半屏弹窗。
- 数据事实来源：`meal_plans` 和 `meal_plan_recipes` 是唯一事实源；周/月视图后续从日级事实聚合。
- 快照规则：复刻必须复制源计划项的 `recipe_snapshot`，后续菜谱编辑不污染复刻结果。
- 用户隔离：RPC 和 action 均使用服务端可信 owner；客户端传入 userId 无效。
- 不可做事项：不刷新菜谱快照、不写菜篮、不做月计划、不做 AI 自动规划。

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

- 新增 migration `0017_plan_day_clone`。
- 新增 RPC：`cook_plan_clone_day(p_owner_id, p_source_date, p_target_date, p_mode)`。
- 新增 action：`plans.day.clone`。
- remote service 新增 `cloneDayPlan(sourceDate, targetDate, mode)`。

## 验收标准

- [x] 可把历史日计划复制到目标日期并返回目标日三餐。
- [x] `replace` 模式清空目标日原有计划后写入源快照。
- [x] `merge` 模式保留目标日原有计划并追加源快照。
- [x] 复刻不读取当前菜谱覆盖历史快照。
- [x] 复刻使用可信 owner，伪造 userId 不生效。
- [x] 不修改小程序页面 WXML/WXSS。

## 测试要求

- [x] 单元测试：action 入参、owner 隔离、replace/merge RPC 参数和快照返回。
- [x] 迁移契约测试：新增 RPC、授权、rollback。
- [x] 页面冒烟：不涉及，本任务只提供后端/service 能力。
- [x] 回归范围：`npm --prefix server run build`、`npm --prefix server run test:unit`、相关客户端 service 脚本。

## 风险

- 本任务不提供历史选择 UI，真实用户入口需后续页面任务承接。
- merge 模式可能复制重复菜品，由后续交互层提示或二次确认。

## 完成汇报模板

```text
完成：
- ...

验证：
- ...

风险/后续：
- ...
```
