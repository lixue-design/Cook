# TASK-CATEGORY-REMOTE-001 Mini Program Smoke Record

## 基本信息

| 字段 | 内容 |
| --- | --- |
| 任务 ID | `TASK-CATEGORY-REMOTE-001` |
| 模块 | 分类 |
| 页面 | `pages/recipe-list/index` |
| 入口 | 菜谱 Tab -> 管理 -> 分类管理弹窗 |
| 负责人 | Codex |
| 验证日期 | 2026-07-31 |
| 小程序环境 | Codex 静态检查 + service stub 验证 |
| API 模式 | remote adapter stub；真实 Cloud Function 未连接 |
| 测试账号 | 未使用真实账号 |

## 前置数据

| 数据 | 要求 | 实际 |
| --- | --- | --- |
| 登录态 | 已登录 CloudBase 身份 | 未连接真实 CloudBase，后端单测使用可信身份 stub |
| 菜谱 | 分类下至少 1 道菜谱 | 后端单测 stub 返回 `家常菜 / 手撕包菜` |
| 计划 | 不适用 | 未覆盖 |
| 菜篮 | 不适用 | 未覆盖 |
| 网络状态 | remote 成功和失败 | service stub 覆盖成功；页面 catch 分支静态检查 |

## 操作步骤

| 步骤 | 操作 | 期望 | 实际 | 结果 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 1 | 调用 `getRecipeCategories()` | 返回 `{ id, name, recipeCount }[]` | 已验证 `{ categories: [...] }` 可归一为页面分类列表 | Pass | `npm run test:recipe-api-remote` |
| 2 | 新增分类 | 调用 `categories.create` 后返回最新 `groups[]` | 已验证 service 归一和后端 owner-scoped RPC | Pass | `npm run test:recipe-api-remote`、`node --test server/dist/test/recipe-api.test.js` |
| 3 | 重命名分类 | 调用 `categories.rename`，失败时保留页面状态 | 已验证 service 归一、后端校验和页面 catch 分支 | Pass | 同上 |
| 4 | 删除分类 | 服务端清空菜谱 `category_id`，菜谱不被删除 | 已验证 migration SQL 包含 `UPDATE recipes SET category_id = NULL` 和删除分类语句 | Pass | `node --test server/dist/test/migration-contract.test.js` |
| 5 | 拖拽排序 | 调用 `categories.reorder` 并返回最新 `groups[]` | 已验证 service 归一和后端 owner-scoped RPC | Pass | `npm run test:recipe-api-remote`、`node --test server/dist/test/recipe-api.test.js` |

## 状态覆盖

- [x] 加载态符合现有设计。
- [x] 空态明确且不遮挡主要操作。
- [x] 失败态有可理解提示或重试入口。
- [ ] 未登录态能引导登录或阻止写操作。
- [x] 删除、覆盖、退出等危险操作有确认。
- [x] 保存失败不丢关键输入。
- [x] 视觉和交互保留现有小程序设计基线。
- [x] 自定义 Tab、半屏弹窗、安全区适配未回归。
- [x] 关键手势未回归：分类长按拖拽、弹窗开合。

未登录态属于 `TASK-AUTH-001`；本任务不新增前端登录入口。

## MVP 验收关联

| MVP 清单项 | 是否覆盖 | 备注 |
| --- | --- | --- |
| 分类可新增 | 部分 | service + 后端单测已验证，开发者工具待人工冒烟 |
| 分类可编辑 | 部分 | service + 后端单测已验证 |
| 分类可删除，菜谱归入未分类 | 部分 | migration 契约验证，真实数据库待集成验证 |
| 分类可排序或至少有稳定排序 | 部分 | action 和 service 已验证 |
| 网络失败有提示 | 部分 | 页面 catch 分支静态检查，真实 UI 待人工冒烟 |

## 无法运行时的替代记录

```text
未运行：
- 微信开发者工具分类管理主路径：新增 -> 重命名 -> 删除 -> 拖拽排序
- 真实 Cloud Function + 数据库联通验证

未运行原因：
- Codex 当前环境没有微信开发者工具、真实 CloudBase 云函数名称、测试账号和测试数据库。

替代检查：
- 检查 pages/recipe-list/index.js 分类操作 catch 分支。
- 检查 pages/recipe-list/index.wxml 和 WXSS 未改动。
- 检查 services/recipe-api-remote.js 分类列表和 groups 归一化。
- 执行 npm run test:recipe-api-remote。
- 执行 npm --prefix server run build。
- 执行 node --test server/dist/test/recipe-api.test.js。
- 执行 node --test server/dist/test/migration-contract.test.js。

剩余风险：
- 未在微信开发者工具或真机验证分类弹窗键盘避让、长按拖拽手势和真实 Cloud Function 权限。
- 删除分类转入未分类已做 SQL 契约检查，但未在真实测试数据库执行迁移集成验证。
```

## 结论

| 项 | 结果 |
| --- | --- |
| 主路径冒烟 | Skipped |
| 状态覆盖 | Partial |
| 视觉交互回归 | Pass by static scope |
| 是否阻塞合并 | 否 |
| 关联缺陷 | 无 |
