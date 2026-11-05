# TASK-RECIPE-REMOTE-001 菜谱 Remote 开关与环境配置

## 任务 ID

`TASK-RECIPE-REMOTE-001`

## 背景

当前 `services/recipe-api.js` 默认导出 `recipe-api-mock`，而 `recipe-api-remote.js` 已经实现 Cloud Function 调用。为了从 mock 走向真实数据，需要先明确 remote mode 开关、环境配置、Cloud Function 名称和失败回退策略。

## 目标

在不改页面设计的前提下，让菜谱 service 可以通过清晰配置在 mock 和 remote 之间切换，并能在 remote 配置缺失时给出明确错误。

## 范围

### 包含

- 梳理并实现 `config/recipe-api.js` 中的 mode 语义。
- 让 `services/recipe-api.js` 根据 mode 导出 mock 或 remote。
- 校验 `cloudFunctionName` 等必要配置。
- 增加开发说明，解释如何启用 remote。
- 保留 mock 模式用于本地页面开发。

### 不包含

- 不重写菜谱列表/详情/编辑页面。
- 不新增菜谱业务接口。
- 不接计划或菜篮。
- 不提交真实 CloudBase 密钥。

## 相关上下文

- 当前代码库：`docs/harness/current-codebase-harness.md`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 菜谱 spec：`docs/specs/recipe.md`
- 前端 service：`services/recipe-api.js`、`services/recipe-api-mock.js`、`services/recipe-api-remote.js`
- 配置：`config/recipe-api.js`
- 后端 action：`server/src/recipe-api.ts`

## 实现要求

- mode 至少支持 `mock` 和 `remote`。
- remote 缺少必要配置时，应抛出可读错误，不静默回退到 mock。
- 不改变页面现有 `fetchRecipeGroups`、`fetchRecipeDetail`、`createRecipe` 等调用签名。
- 文档中写明小程序端需要的云函数名称配置。

## 前端设计保护

- 是否改 WXML：否
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：菜谱列表、菜谱详情、菜谱创建
  - 弹窗：新增菜谱、分类管理、加入计划
  - 手势：分类拖拽
  - 空态/加载态/失败态：菜谱加载失败、remote 未配置

## API/数据变更

无后端 API 变更；只明确前端 service 配置。

## 验收标准

- [ ] `mode: 'mock'` 时现有页面仍使用本地 mock 数据。
- [ ] `mode: 'remote'` 时调用 `recipe-api-remote.js`。
- [ ] remote 必要配置缺失时有明确错误提示或开发期错误。
- [ ] 页面调用签名不变。
- [ ] 文档说明如何切换 mode。

## 测试要求

- [ ] 单元测试：如有条件，补 service mode 选择测试。
- [ ] 接口测试：remote 模式至少调用 `health.ready` 或 `recipes.list` 做联通性验证。
- [ ] 页面冒烟：菜谱列表加载。
- [ ] 回归范围：菜谱列表、详情、创建入口。

## 风险

- 真实 CloudBase 环境配置可能依赖外部权限，无法在所有开发机验证。
- 若远程返回字段与页面契约不一致，需要在后续任务中补映射。

## 完成汇报模板

```text
完成：
- 明确 recipe API mock/remote 开关
- 补充 remote 配置说明

验证：
- mock 模式页面冒烟
- remote 模式联通性检查或说明无法验证原因

风险/后续：
- 记录环境依赖和字段映射缺口
```
