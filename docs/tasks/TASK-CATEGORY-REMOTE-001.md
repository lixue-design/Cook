# TASK-CATEGORY-REMOTE-001 分类管理接真实 API

## 任务 ID

`TASK-CATEGORY-REMOTE-001`

## 背景

当前菜谱列表页已经有分类新增、编辑、删除、拖拽排序交互，mock 也支持这些行为。后端已有分类相关 action 和 RPC，需要把分类管理真实化，并保证删除分类时菜谱归入未分类。

## 目标

完成分类增删改排的真实服务接入，保留现有分类管理弹窗和拖拽体验。

## 范围

### 包含

- 分类列表读取真实数据。
- 新增分类。
- 重命名分类。
- 删除分类并把菜谱归入未分类。
- 拖拽排序后持久化。
- 分类操作失败时展示错误并保持当前页面可继续使用。

### 不包含

- 不重写分类管理 UI。
- 不做复杂多级分类。
- 不做跨用户共享分类。
- 不做运营后台分类管理。

## 相关上下文

- 菜谱 spec：`docs/specs/recipe.md`
- 当前代码库：`docs/harness/current-codebase-harness.md`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 页面：`pages/recipe-list/index`
- Service：`services/recipe-api.js`、`services/recipe-api-remote.js`
- 后端：`server/src/recipe-api.ts`

## 实现要求

- 保持现有页面调用：
  - `getRecipeCategories`
  - `reorderRecipeCategories`
  - `renameRecipeCategory`
  - `createRecipeCategory`
  - `deleteRecipeCategory`
- 删除分类时服务端负责将菜谱转入未分类。
- 分类名称校验前端可提示，服务端必须兜底。
- 失败时不破坏当前分类列表和滚动状态。

## 前端设计保护

- 是否改 WXML：否
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：菜谱列表
  - 弹窗：分类管理、新增/重命名/删除确认
  - 手势：分类长按拖拽排序
  - 空态/加载态/失败态：分类操作失败提示

## API/数据变更

- 使用现有 Cloud Function action：
  - `categories.list`
  - `categories.create`
  - `categories.rename`
  - `categories.delete`
  - `categories.reorder`

## 验收标准

- [ ] 可新增分类并立即展示。
- [ ] 可重命名分类并刷新列表。
- [ ] 可删除分类，分类下菜谱进入未分类。
- [ ] 可拖拽排序并持久化。
- [ ] 操作失败时有提示，不丢失现有页面状态。
- [ ] 分类管理弹窗和拖拽视觉未被破坏。

## 测试要求

- [ ] 单元测试：后端分类 action 或 RPC 覆盖增删改排。
- [ ] 接口测试：删除分类后菜谱未被删除。
- [ ] 页面冒烟：分类新增、重命名、删除、排序。
- [ ] 回归范围：菜谱列表分类栏、分类管理弹窗。

## 风险

- 默认分类和未分类策略需与 spec 保持一致。
- 如果真实数据中已有同名分类，需要明确错误展示。

## 完成汇报模板

```text
完成：
- 分类增删改排接真实 API
- 删除分类保留菜谱并转入未分类

验证：
- 后端测试或接口检查
- 小程序分类管理冒烟

风险/后续：
- 记录默认分类/同名分类处理风险
```
