# TASK-PLAN-FRONTEND-001 计划页接真实 API

## 任务 ID

`TASK-PLAN-FRONTEND-001`

## 背景

`pages/meal-plan/index` 已有复杂的日/周计划交互，包括三餐分区、周计划网格、添加弹窗、滑动删除、长按拖拽和加菜篮入口。当前数据来自 mock 和内存态。需要在保留 WXML/WXSS 和手势体验的前提下接入真实计划 API。

## 目标

把计划页从 mock/内存态切换为真实服务端数据，保留现有视觉、字段契约和交互。

## 范围

### 包含

- 改造 `services/meal-plan-api.js` 或新增 remote adapter。
- 日计划读取真实 API。
- 添加菜谱到餐段走真实 API。
- 移除计划菜谱走真实 API。
- 周计划读取/生成走真实 API。
- warnings、覆盖确认、失败提示接入页面。
- 失败时保留用户可理解状态，不让页面崩溃。

### 不包含

- 不重写计划页布局。
- 不改周计划网格设计。
- 不实现菜篮服务端同步，留给菜篮任务。
- 不做 AI 自动菜单。

## 相关上下文

- 计划 spec：`docs/specs/plan.md`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 当前代码库：`docs/harness/current-codebase-harness.md`
- 页面：`pages/meal-plan/index`
- Service：`services/meal-plan-api.js`
- 依赖任务：`TASK-PLAN-API-001`、`TASK-PLAN-WEEK-001`

## 实现要求

- 优先保持页面字段契约：
  - `mealPlans[].recipes[]`
  - `weeklyPlanDays[].meals[].items[]`
  - `emptySlots`
- API 字段转换必须在 service 层或页面 JS 小范围映射中完成。
- 添加/移除失败要回滚乐观更新或重新拉取数据。
- 生成已有计划时必须展示覆盖确认。
- 菜谱不足 warnings 要可见。

## 前端设计保护

- 是否改 WXML：仅必要状态提示可小范围调整
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：计划页日视图、周视图
  - 弹窗：新增方式、日期选择、计划创建、食物操作、覆盖确认
  - 手势：日视图滑动删除/长按拖拽、周视图拖拽、周切换
  - 空态/加载态/失败态：无计划、生成中、添加失败、移除失败、warnings

## API/数据变更

不新增后端能力；消费 `TASK-PLAN-API-001` 和 `TASK-PLAN-WEEK-001` 的接口。

## 验收标准

- [ ] 日计划真实加载早餐、午餐、晚餐。
- [ ] 添加菜谱到指定餐段后刷新或乐观展示成功。
- [ ] 移除计划菜谱后服务端持久化。
- [ ] 周计划真实加载和生成。
- [ ] 已有计划生成时有覆盖确认。
- [ ] warnings 可展示。
- [ ] 现有手势和弹窗不被破坏。

## 测试要求

- [ ] 单元测试：service 数据映射函数。
- [ ] 接口测试：依赖后端任务。
- [ ] 页面冒烟：日计划添加/移除、周计划生成、周切换。
- [ ] 回归范围：计划页所有手势和弹窗。

## 风险

- 页面当前内存态较多，接真实 API 时需谨慎处理乐观更新和回滚。
- 如果后端未就绪，可先用 adapter contract test 固定字段契约。

## 完成汇报模板

```text
完成：
- 计划页接真实 API
- 保留日/周视图字段契约和交互

验证：
- service 映射测试
- 计划页手动冒烟

风险/后续：
- 记录任何未接真实接口的 fallback
```
