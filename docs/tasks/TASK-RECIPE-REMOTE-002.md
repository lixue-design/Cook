# TASK-RECIPE-REMOTE-002 菜谱主流程接真实 API

## 任务 ID

`TASK-RECIPE-REMOTE-002`

## 背景

当前菜谱列表、详情、创建、编辑、删除页面体验较完整，但默认仍走 mock。后端已有菜谱 Cloud Function action 和 RPC，需要在保留小程序设计基线的前提下，把主流程接到真实 API。

## 目标

完成菜谱列表、详情、新建、编辑、删除的真实数据闭环，并保持现有页面视觉和字段契约。

## 范围

### 包含

- 菜谱列表加载真实分类和菜谱数据。
- 菜谱详情读取真实数据。
- 新建菜谱保存到真实服务。
- 编辑菜谱更新真实服务。
- 删除菜谱走真实软删除。
- 封面上传接 `covers.upload` 或明确保留无图保存。
- 补保存失败不丢表单的验证。

### 不包含

- 不实现 AI 链接生成、图片识别、文字生成。
- 不重写页面 WXML/WXSS。
- 不实现计划快照或菜篮同步。
- 不改变后端身份来源为前端传 userId。

## 相关上下文

- 菜谱 spec：`docs/specs/recipe.md`
- 当前代码库：`docs/harness/current-codebase-harness.md`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 页面：`pages/recipe-list/index`、`pages/recipe-detail/index`、`pages/recipe-create/index`
- Service：`services/recipe-api.js`、`services/recipe-api-remote.js`
- 后端：`server/src/recipe-api.ts`
- 迁移：`database/migrations/0002_recipe_crud_identity.up.sql`、`database/migrations/0003_recipe_crud_api.up.sql`

## 实现要求

- 优先只改 service 层和必要的数据映射。
- 保持页面期望字段：
  - `groups[].recipes[]`
  - `recipe.heroImage`
  - `recipe.ingredients[]`
  - `recipe.steps[]`
- 服务端必须使用可信身份，不能接受前端伪造 userId。
- 错误态应可被页面展示，不出现未捕获异常。

## 前端设计保护

- 是否改 WXML：否，除非补必要错误态
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：菜谱列表、详情、创建/编辑
  - 弹窗：创建入口、分类管理、删除确认、加入计划
  - 手势：分类拖拽
  - 空态/加载态/失败态：列表空态、详情不存在、保存失败、上传失败

## API/数据变更

- 使用现有 Cloud Function action：
  - `recipes.list`
  - `recipes.detail`
  - `recipes.create`
  - `recipes.update`
  - `recipes.delete`
  - `covers.upload`
- 如发现 action 字段与 spec 不一致，需同步记录到 API 契约索引或任务卡。

## 验收标准

- [ ] 真实模式下可创建菜谱并在列表展示。
- [ ] 可进入真实菜谱详情。
- [ ] 可编辑真实菜谱并刷新详情。
- [ ] 可删除真实菜谱，列表不再展示。
- [ ] 保存失败不丢表单输入。
- [ ] 图片上传失败可重试或无图保存。
- [ ] 页面视觉和主要交互未被重写。

## 测试要求

- [ ] 单元测试：后端 recipe API 测试保持通过。
- [ ] 接口测试：创建、更新、删除、列表、详情至少覆盖成功和错误态。
- [ ] 页面冒烟：新建 -> 详情 -> 编辑 -> 删除。
- [ ] 回归范围：菜谱列表、详情、创建/编辑、分类入口。

## 风险

- 真实 CloudBase 环境可能不可用，需要说明替代验证方式。
- 现有后端字段模型带 AI 图库历史命名，需避免把 AI 能力带入 MVP 主链路。

## 完成汇报模板

```text
完成：
- 菜谱主流程接入真实 API
- 保留页面字段契约和设计

验证：
- 后端单测/接口检查
- 小程序主流程冒烟

风险/后续：
- 记录无法验证的环境依赖或字段差异
```
