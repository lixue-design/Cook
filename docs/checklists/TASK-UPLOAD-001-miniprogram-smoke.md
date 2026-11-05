# TASK-UPLOAD-001 Mini Program Smoke Record

## 基本信息

| 字段 | 内容 |
| --- | --- |
| 任务 ID | `TASK-UPLOAD-001` |
| 模块 | 菜谱 |
| 页面 | `pages/recipe-create/index`、`pages/recipe-detail/index` |
| 入口 | 菜谱新建/编辑页图片选择、步骤图片选择、保存 |
| 负责人 | Codex |
| 验证日期 | 2026-07-31 |
| 小程序环境 | Codex 静态检查 + client/service/server stub 验证 |
| API 模式 | remote adapter stub；真实 Cloud Function 未连接 |
| 测试账号 | 未使用真实账号 |

## 前置数据

| 数据 | 要求 | 实际 |
| --- | --- | --- |
| 登录态 | 已登录 CloudBase 身份 | 后端单测使用可信身份 stub |
| 菜谱 | 新建或编辑菜谱表单 | 页面 JS 静态检查，未运行微信开发者工具 |
| 计划 | 不适用 | 未覆盖 |
| 菜篮 | 不适用 | 未覆盖 |
| 网络状态 | 上传成功、超限、格式错误、上传失败 | stub 和后端单测覆盖 |

## 操作步骤

| 步骤 | 操作 | 期望 | 实际 | 结果 | 证据 |
| --- | --- | --- | --- | --- | --- |
| 1 | 选择超 1280px 或超 5MB 图片 | 前端尝试压缩，仍不合规时给出可读提示 | 已用 wx stub 验证压缩参数、5MB 和格式错误 | Pass | `npm run test:recipe-image-client` |
| 2 | 保存带临时封面的菜谱 | 调用 `covers.upload`，成功后保存 `customCoverStorageKey` | 已验证 remote action 顺序和 payload | Pass | `npm run test:recipe-api-remote` |
| 3 | 封面上传失败 | 保留表单，可选择无图保存 | 页面 catch + modal 分支静态检查；错误码透传已验证 | Partial | `npm run test:recipe-api-remote` |
| 4 | 选择步骤图后保存 | 明确提示步骤图暂不上传，可无图保存步骤文字 | 页面保存前确认分支已实现 | Partial | 静态检查 |
| 5 | 后端上传校验 | JPEG/PNG/WebP、5MB 限制、用户隔离路径 | 后端测试覆盖格式、大小、用户 hash 前缀 | Pass | `node --test server/dist/test/recipe-api.test.js` |

## 状态覆盖

- [x] 加载态符合现有设计。
- [x] 空态明确且不遮挡主要操作。
- [x] 失败态有可理解提示或重试入口。
- [ ] 未登录态能引导登录或阻止写操作。
- [x] 删除、覆盖、退出等危险操作有确认。
- [x] 保存失败不丢关键输入。
- [x] 视觉和交互保留现有小程序设计基线。
- [x] 自定义 Tab、半屏弹窗、安全区适配未回归。
- [x] 关键手势未回归：不涉及。

未登录态属于 `TASK-AUTH-001`；本任务保持服务端可信身份校验。

## MVP 验收关联

| MVP 清单项 | 是否覆盖 | 备注 |
| --- | --- | --- |
| 可上传或选择封面图 | 部分 | service/后端已验证，真机选择待人工冒烟 |
| 图片上传失败可重试或无图保存 | 部分 | 无图保存分支已实现，UI 待人工冒烟 |
| 保存失败不丢表单内容 | 部分 | 页面分支静态检查，真机待验 |
| 数据库不保存明文密钥 | 是 | 未新增密钥或生产配置 |
| 小程序端不包含 AppSecret | 是 | 未新增密钥 |

## 无法运行时的替代记录

```text
未运行：
- 微信开发者工具图片选择、压缩、保存、失败弹窗主路径
- 真实 Cloud Function storage 上传

未运行原因：
- Codex 当前环境没有微信开发者工具、真实 CloudBase 云函数名称、测试账号和 storage 环境。

替代检查：
- 检查 pages/recipe-create/index.js 图片选择、保存失败、无图保存和步骤图降级分支。
- 检查 WXML/WXSS 未改动。
- 执行 npm run test:recipe-image-client。
- 执行 npm run test:recipe-api-remote。
- 执行 npm --prefix server run build。
- 执行 node --test server/dist/test/recipe-api.test.js。

剩余风险：
- wx.compressImage 的尺寸参数需在微信开发者工具或真机确认；若基础库不支持尺寸压缩，会以可读错误阻止超 1280px 图片保存。
- 步骤图当前为明确降级策略，未实现远端长期存储。
```

## 结论

| 项 | 结果 |
| --- | --- |
| 主路径冒烟 | Skipped |
| 状态覆盖 | Partial |
| 视觉交互回归 | Pass by static scope |
| 是否阻塞合并 | 否 |
| 关联缺陷 | 无 |
