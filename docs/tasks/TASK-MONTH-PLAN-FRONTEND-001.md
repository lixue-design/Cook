# TASK-MONTH-PLAN-FRONTEND-001

## 任务 ID

`TASK-MONTH-PLAN-FRONTEND-001`

## 背景

Full PRD 要求提供月历视图展示每日三餐概览。现有计划页日/周交互复杂，包含拖拽、滑动删除、半屏弹窗和自定义 Tab，不能为了月视图改动既有交互基线。

## 目标

新增独立月计划页面，按月展示每日三餐概览并复用 `plans.month.get` 聚合 API。

## 范围

### 包含

- 新增 `pages/month-plan/index` 页面。
- 注册小程序页面路径。
- 使用 `fetchMonthPlan(month)` 加载月计划。
- 支持上/下月切换、加载态、失败态、空态和未登录拦截。
- 复用现有设计语言，不修改既有计划页。

### 不包含

- 月度批量操作。
- 月度统计和模板。
- 从现有计划 Tab 增加入口。
- 修改日/周计划拖拽、滑动、半屏弹窗。

## 相关上下文

- 模块 spec：`docs/specs/plan-advanced.md`、`docs/specs/plan.md`、`docs/specs/rule-generation-engine.md`
- API：`plans.month.get`
- 页面：新增 `pages/month-plan/index`
- 数据模型：只读日级计划聚合

## 实现要求

- 不修改 `pages/meal-plan` WXML/WXSS/JS。
- 新页面必须覆盖 loading、error、empty、success。
- 月历单元格展示日期和三餐简要标题。
- 数据来自 `services/meal-plan-api`。
- 不能写计划数据。

## Full PRD 限制

- Provider 策略：不涉及 AI，不触发生成 provider。
- 前端样式保护：新增独立页面；不改既有小程序页面和组件样式基线。
- 数据事实来源：月视图只读 `plans.month.get` 聚合结果，日级计划仍是唯一事实源。
- 快照规则：展示计划快照中的标题，不刷新菜谱。
- 用户隔离：通过 existing auth gate 和 remote service 调用服务端 owner-scoped action。
- 不可做事项：不做批量操作、不写日计划、不做月计划事实表、不接 AI。

## 前端设计保护

- 是否改 WXML：是，新增页面
- 是否改 WXSS：是，新增页面
- 是否改组件结构：否，不改既有组件
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：新增月计划页
  - 弹窗：不涉及
  - 手势：不涉及
  - 空态/加载态/失败态：月计划页 loading/error/empty/success

## API/数据变更

- 注册 `pages/month-plan/index`。
- 不新增后端接口或迁移。

## 验收标准

- [x] 月计划页可加载当前月数据。
- [x] 可切换上月/下月并重新加载。
- [x] 每日展示早餐、午餐、晚餐概览。
- [x] 空月展示空态，接口失败展示失败态。
- [x] 未登录时走现有登录拦截。
- [x] 不修改既有计划页 WXML/WXSS/JS。

## 测试要求

- [x] 语法检查：新增页面 JS、service JS。
- [x] 客户端脚本：`fetchMonthPlan` 已覆盖。
- [x] 页面冒烟：本地无微信开发者工具，记录为未执行。
- [x] 回归范围：`npm run test:meal-plan-api-remote`、`npm --prefix server run test:unit`。

## 风险

- 本任务只注册页面，不新增入口；后续入口设计需产品确认。
- 真机/微信开发者工具视觉冒烟仍需真实环境补测。

## 完成汇报模板

```text
完成：
- ...

验证：
- ...

风险/后续：
- ...
```
