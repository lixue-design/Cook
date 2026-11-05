# TASK-PLAN-PREFERENCES-001 用户饮食习惯模型

## 任务 ID

`TASK-PLAN-PREFERENCES-001`

## 背景

Full PRD 后续计划生成需要综合是否吃早餐、三餐偏好、忌口、主食、耗时和人数设置。在接入更复杂的规则均衡前，需要先建立 owner 隔离的用户习惯模型、读写 action 和服务适配层。

## 目标

建立可被后续规则生成读取的用户饮食习惯模型，并提供 `plans.preferences.get/update` 最小闭环。

## 范围

### 包含

- 新增 `plan_preferences` 数据表和 owner-scoped RPC。
- 新增 `plans.preferences.get` 和 `plans.preferences.update` action。
- 字段覆盖是否吃早餐、早餐/午餐/晚餐偏好、常用主食、忌口食材、用餐人数、工作日/周末可接受耗时。
- 用户未设置时返回安全默认值。
- 周计划生成读取已保存偏好，首版只联动“不吃早餐”和忌口过滤。
- 小程序 `meal-plan-api` remote/mock 暴露偏好读写方法。
- 单元测试、迁移契约测试和 remote service 验证。

### 不包含

- 不新增偏好设置页面或修改现有页面 WXML/WXSS。
- 不实现完整营养均衡评分和三餐权重。
- 不实现月计划、月度批量操作或模板。
- 不接真实 AI provider。
- 不按人数自动换算食材用量。

## 相关上下文

- Full PRD 队列：`docs/tasks/full-prd-README.md`
- Full PRD 范围：`docs/full-prd-scope-and-implementation-plan.md`
- 规则生成 spec：`docs/specs/rule-generation-engine.md`
- 计划增强 spec：`docs/specs/plan-advanced.md`
- 计划 spec：`docs/specs/plan.md`
- API 契约：`docs/api/full-prd-api-contract.md`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 当前代码库 Harness：`docs/harness/current-codebase-harness.md`

## 实现要求

- 所有偏好数据必须以服务端可信身份解析出的 owner 为准，不接受客户端 `userId`。
- 更新接口必须服务端校验字段类型、长度、数组项数、人数和耗时范围。
- 获取接口在无记录时返回默认值，不要求用户先保存。
- 数据库需要 up/down migration，RPC 需撤销 PUBLIC 执行权限并授权 `service_role`。
- 周计划生成读取偏好，但本任务只做最小联动：不吃早餐时不生成早餐项，忌口关键词过滤候选菜谱。
- `servings`、`stapleFoods`、三餐偏好和耗时字段先进入模型，完整规则权重由后续 `TASK-PLAN-RULE-BALANCE-001` 接入。

## Full PRD 限制

- Provider 策略：首版仍只使用 `provider=rules`；本任务不接 AI，不提交模型密钥，只为后续 rules 计划生成提供偏好输入。
- 前端样式保护：不修改既有页面、组件、WXML、WXSS、布局、手势、自定义 Tab、半屏弹窗或安全区适配；仅新增 service 方法。
- 数据事实来源：偏好事实来源为 `plan_preferences`；日计划仍是唯一餐单事实源，周/月计划只能聚合或批量写入日级计划。
- 快照规则：本任务不写计划项、菜篮、模板或复刻数据；后续生成计划和菜篮同步仍必须使用菜谱快照。
- 用户隔离：`plan_preferences.owner_id` 关联 `app_users.id`，所有读写 action 通过可信身份和 owner-scoped RPC 执行。
- 不可做事项：不得接真实 AI；不得新增月计划事实表；不得做复杂单位换算；不得改动既有小程序视觉结构；不得把偏好作为客户端可信字段直接写入计划。

## 前端设计保护

- 是否改 WXML：否
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是，不改变计划页现有日/周计划字段
- 是否优先通过 `services/` 或数据映射接入：是，仅扩展 `services/meal-plan-api-*`
- 视觉回归范围：
  - 页面：不涉及页面渲染变更
  - 弹窗：不涉及
  - 手势：不涉及
  - 空态/加载态/失败态：不涉及

## API/数据变更

- 新增表：`plan_preferences`
- 新增 RPC：
  - `cook_plan_preferences_get(p_owner_id text)`
  - `cook_plan_preferences_upsert(...)`
- 新增 action：
  - `plans.preferences.get`
  - `plans.preferences.update`
- 新增 service 方法：
  - `fetchPlanPreferences()`
  - `updatePlanPreferences(preferences)`

## 验收标准

- [x] 用户未设置时可获取默认饮食习惯。
- [x] 可更新是否吃早餐、三餐偏好、主食、忌口、人数和耗时。
- [x] 偏好读写不接受客户端伪造 `userId`，使用可信 owner。
- [x] 非法偏好入参会在服务端返回 `INVALID_ARGUMENT`。
- [x] 周计划生成会读取偏好；不吃早餐时不生成早餐项，忌口会过滤候选菜谱并返回稳定 warning。
- [x] 未修改既有小程序 WXML/WXSS 和页面交互。

## 测试要求

- [x] 单元测试：偏好解析、owner-scoped get/update、生成读取偏好。
- [x] 接口测试：Cloud Function action 单测覆盖 `plans.preferences.*`。
- [x] 页面冒烟：不涉及新增页面；remote service 验证覆盖 action/payload。
- [x] 回归范围：服务端 TypeScript build、相关 unit test、迁移契约、计划 remote service 验证。

## 风险

- 本任务不提供用户设置页，偏好入口需由后续前端任务接入。
- 人数、主食和耗时暂未完整影响生成权重，后续 `TASK-PLAN-RULE-BALANCE-001` 继续接入。
- 忌口首版为关键词过滤，不做同义词和复杂过敏源识别。

## 完成汇报模板

```text
完成：
- 建立 plan_preferences 模型和 plans.preferences.* action
- 补充 service 适配、任务卡和 API 契约

验证：
- npm --prefix server run build
- npm --prefix server run test:unit
- npm run test:meal-plan-api-remote

风险/后续：
- 后续补偏好设置页面和完整计划均衡规则
```
