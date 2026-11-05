# TASK-RECIPE-REMOTE-002 Mini Program Smoke Record

## 基本信息

| 字段 | 内容 |
| --- | --- |
| 任务 ID | `TASK-RECIPE-REMOTE-002` |
| 模块 | 菜谱 |
| 页面 | `pages/recipe-list/index`、`pages/recipe-detail/index`、`pages/recipe-create/index` |
| 入口 | 菜谱 Tab、菜谱卡片、手动填写入口、详情编辑/删除 |
| 负责人 | Codex |
| 验证日期 | 2026-07-31 |
| 小程序环境 | Codex 静态检查 + service stub 验证 |
| API 模式 | remote adapter stub；真实 Cloud Function 未连接 |
| 测试账号 | 未使用真实账号 |

## 前置数据

| 数据 | 要求 | 实际 |
| --- | --- | --- |
| 登录态 | 已登录 CloudBase 身份 | 未连接真实 CloudBase，后端单测使用可信身份 stub |
| 菜谱 | 至少 1 个分类和 1 道菜谱 | remote adapter stub 返回 `家常菜 / 番茄炒蛋` |
| 计划 | 不适用 | 未覆盖 |
| 菜篮 | 不适用 | 未覆盖 |
| 网络状态 | remote 成功和失败 | service stub 覆盖成功响应与 `DATABASE_UNAVAILABLE` 错误响应 |

## 操作步骤

| 步骤 | 操作 | 期望 | 实际 | 结果 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 1 | 菜谱列表调用 `fetchRecipeGroups()` | 返回 `groups[].recipes[]`，兼容契约字段 | 已验证数组/对象分组映射、封面、耗时、热量字段 | Pass | `npm run test:recipe-api-remote` |
| 2 | 菜谱详情调用 `fetchRecipeDetail(id)` | 返回 `recipe.heroImage`、`ingredients[]`、`steps[]` | 已验证详情字段契约 | Pass | `npm run test:recipe-api-remote` |
| 3 | 新建菜谱并上传临时封面 | 先 `covers.upload`，再 `recipes.create`；临时步骤图不持久化 | 已验证 action 顺序、`customCoverStorageKey` 和步骤图片清理 | Pass | `npm run test:recipe-api-remote` |
| 4 | 编辑、删除菜谱 | 调用 `recipes.update`、`recipes.delete`，页面调用签名不变 | 已验证 service 调用和返回值 | Pass | `npm run test:recipe-api-remote` |
| 5 | remote 返回错误 | 错误 message/code 可被页面 catch 后展示 | 已验证错误抛出包含 `DATABASE_UNAVAILABLE` 和可读 message | Pass | `npm run test:recipe-api-remote` |

## 状态覆盖

- [x] 加载态符合现有设计。
- [x] 空态明确且不遮挡主要操作。
- [x] 失败态有可理解提示或重试入口。
- [ ] 未登录态能引导登录或阻止写操作。
- [x] 删除、覆盖、退出等危险操作有确认。
- [x] 保存失败不丢关键输入。
- [x] 视觉和交互保留现有小程序设计基线。
- [x] 自定义 Tab、半屏弹窗、安全区适配未回归。
- [x] 关键手势未回归：滑动删除、长按拖拽、周切换、弹窗开合。

未登录态属于 `TASK-AUTH-001`；本任务保持服务端可信身份校验，不新增前端登录入口。

## MVP 验收关联

| MVP 清单项 | 是否覆盖 | 备注 |
| --- | --- | --- |
| 菜谱列表可加载 | 部分 | remote adapter 已验证；微信开发者工具待人工冒烟 |
| 可新建菜谱 | 部分 | service + 后端单测已验证；真实 Cloud Function 待人工冒烟 |
| 可上传或选择封面图 | 部分 | 封面上传 action 和失败分支已验证；真机选择图片待人工冒烟 |
| 可填写主料、辅料、调料 | 部分 | 后端与 service 字段保持；页面输入未在开发者工具运行 |
| 可编辑已有菜谱 | 部分 | service + 后端单测已验证 |
| 可删除菜谱 | 部分 | service + 后端单测已验证 |
| 保存失败不丢表单内容 | 部分 | 页面 catch 分支静态检查通过；真实失败 UI 待人工冒烟 |
| 图片上传失败可重试或无图保存 | 部分 | 上传失败 message 可展示；步骤临时图按无图保存 |

## 无法运行时的替代记录

```text
未运行：
- 微信开发者工具页面主路径：菜谱列表 -> 新建 -> 详情 -> 编辑 -> 删除
- 真实 Cloud Function 联通性检查

未运行原因：
- Codex 当前环境没有微信开发者工具、真实 CloudBase 云函数名称、测试账号和测试数据库。

替代检查：
- 检查 pages/recipe-list、pages/recipe-detail、pages/recipe-create 未改 WXML/WXSS。
- 检查 services/recipe-api-remote.js 数据映射和错误态分支。
- 执行 npm run test:recipe-api-mode。
- 执行 npm run test:recipe-api-remote。
- 执行 npm --prefix server run build。
- 执行 node --test server/dist/test/recipe-api.test.js。

剩余风险：
- 未在微信开发者工具或真机验证远端登录态、Cloud Function 权限、图片选择器和页面渲染。
- 根目录 npm run build 仍受 rolldown optional native binding 缺失影响，需在正常依赖环境复核。
```

## 结论

| 项 | 结果 |
| --- | --- |
| 主路径冒烟 | Skipped |
| 状态覆盖 | Partial |
| 视觉交互回归 | Pass by static scope |
| 是否阻塞合并 | 否 |
| 关联缺陷 | 无 |
