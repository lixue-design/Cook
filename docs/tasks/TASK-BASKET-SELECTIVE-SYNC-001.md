# TASK-BASKET-SELECTIVE-SYNC-001

## 任务 ID

`TASK-BASKET-SELECTIVE-SYNC-001`

## 背景

Full PRD 要求用户能从日计划中选择部分菜品同步到周菜篮。现有同步接口只能整周重建所有计划来源项，缺少指定计划项同步能力。

## 目标

提供按 `planRecipeIds` 选择性同步周菜篮的后端和 service 能力。

## 范围

### 包含

- 新增 `baskets.week.syncSelected` action。
- 校验选中的计划项 ID。
- 只从选中计划项的菜谱快照提取食材并合并。
- 保留手动菜篮项。
- 补充 remote/mock service 方法和验证脚本。

### 不包含

- 新增页面勾选 UI。
- 复杂单位换算。
- 自动同步菜篮到计划。
- 对未选计划项做增量 sourceRefs 局部编辑。

## 相关上下文

- 模块 spec：`docs/specs/basket.md`、`docs/specs/plan-advanced.md`、`docs/specs/plan.md`
- API：`docs/api/full-prd-api-contract.md`
- 页面：本任务不修改页面
- 数据模型：`shopping_baskets`、`shopping_basket_items`、`meal_plans`、`meal_plan_recipes`

## 实现要求

- 使用服务端可信 owner，忽略客户端伪造 userId。
- 入参 `planRecipeIds` 必须是非空 UUID 数组。
- 找不到任何选中计划项时返回 `NOT_FOUND`，不得清空现有计划来源菜篮项。
- 找到部分选中项时可同步已找到项，并返回缺失 warning。
- 同步结果使用现有食材合并规则。
- 手动菜篮项必须保留。

## Full PRD 限制

- Provider 策略：不涉及 AI；只读取日计划快照并同步食材。
- 前端样式保护：不修改 WXML/WXSS、页面布局、手势、自定义 Tab、半屏弹窗或安全区适配。
- 数据事实来源：选中食材来源为 `meal_plan_recipes.recipe_snapshot`；菜篮事实为 `shopping_baskets` / `shopping_basket_items`。
- 快照规则：只从计划快照提取食材，不重新读取或刷新当前菜谱。
- 用户隔离：RPC/action 使用服务端可信 owner；写入菜篮时 owner-scoped。
- 不可做事项：不做单位换算、不写计划、不改手动项、不接 AI、不新增页面 UI。

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

- 新增 action：`baskets.week.syncSelected`。
- remote/mock service 新增 `syncSelectedShoppingList(weekStartDate, planRecipeIds)`。
- 不新增数据库迁移，复用 `cook_basket_plan_snapshots` 和 `cook_basket_replace_plan_items`。

## 验收标准

- [x] 传入选中计划项后，只同步这些计划项的食材。
- [x] 同名同单位数字用量继续合并。
- [x] 手动菜篮项同步后仍保留。
- [x] 找不到任何选中项时不调用替换 RPC。
- [x] 伪造 userId 不影响 owner 隔离。
- [x] 不修改小程序页面 WXML/WXSS。

## 测试要求

- [x] 单元测试：选择性同步、缺失项 warning、找不到时不替换。
- [x] 客户端脚本：remote service payload 和响应映射。
- [x] 页面冒烟：不涉及，本任务只提供后端/service 能力。
- [x] 回归范围：`npm --prefix server run build`、`npm --prefix server run test:unit`、`npm run test:shopping-list-api-remote`。

## 风险

- 首版选择性同步会重建计划来源菜篮项为“所选计划项集合”；未选计划项不会保留在 plan 来源项中。后续若需要精确增量保留，需要新增 sourceRefs 级别更新 RPC。

## 完成汇报模板

```text
完成：
- ...

验证：
- ...

风险/后续：
- ...
```
