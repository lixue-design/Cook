# TASK-QA-MVP-001 本地小程序冒烟记录

| 字段 | 内容 |
| --- | --- |
| 日期 | 2026-07-31 |
| 环境 | 微信开发者工具 2.01.2510290，macOS |
| 项目 | `/Users/bytedance/Code/cook` |
| API 模式 | mock（本轮用户明确仅要求本地测试） |
| 真实账号/CloudBase | 不适用，本轮不验证 |

## 启动证据

- 微信开发者工具已成功启动，进程参数显示 `--opened-file=/Users/bytedance/Code/cook`。
- IDE 日志确认已执行 `handleImportProject`；CLI 后续正确识别 AppID
  `wx5002d85969a1cdf6`，启动阶段的 `appid missing (41002)` 为初始化瞬时错误。
- 用户已明确允许开启 IDE 服务端口；CLI 成功启动本机 HTTP 服务并打开项目。
- `cli auto --auto-port 9420 --trust-project` 成功，`miniprogram-automator` 可连接并读取
  `currentPage=pages/login/index` 和模拟器型号 `iPhone 12/13 (Pro)`。
- 当前 IDE 2.01.2510290 的自动化事件层随后抛出
  `TypeError: Cannot set property 'handler' of undefined`；官方 npm 客户端 0.12.1 的
  `page.data`、DOM 查询和 screenshot 均无响应。IDE 日志显示基础库 3.16.2 已缓存、
  simulator launch success、用户代码加载完成，未发现项目编译错误。
- macOS 拒绝 `osascript` 辅助访问，系统窗口列表也无法读取该应用窗口，因此 Codex 无法改用
  UI 控制或限定窗口截图。

## 静态与自动化证据

- 12 个小程序 verifier 全部通过：菜谱 mode/remote/图片/草稿、计划 remote、菜篮
  mode/remote、登录、合规、全局状态、诊断和发布文档。
- `app.json` 注册的 11 个页面和 4 个自定义 Tab 图标资源均存在。
- `pages/`、`components/`、`custom-tab-bar/`、`services/`、`config/`、`utils/` 下 JSON
  均可解析，JavaScript 全部通过 `node --check`。

## 待执行路径

| 步骤 | 操作 | 状态 |
| --- | --- | --- |
| 1 | 本地协议勾选与 mock 登录 | Blocked：IDE automator 事件层异常 |
| 2 | 新建、查看、编辑、删除菜谱 | Blocked：同上 |
| 3 | 分类新增、编辑、删除、排序 | Blocked：同上 |
| 4 | 生成周计划并调整餐段 | Blocked：同上 |
| 5 | 同步菜篮、勾选、手动新增和删除 | Blocked：同上 |
| 6 | 检查 loading/empty/error/未登录态 | Blocked：同上 |
| 7 | 检查自定义 Tab、半屏弹窗、滑动和拖拽 | Blocked：同上 |
| 8 | 查看协议、隐私、注销入口并退出 | Blocked：同上 |

## 当前结论

主路径冒烟：Blocked。开发者工具、项目和服务端口已经就绪，但 IDE 自身 automator 事件层异常，
且 Codex 没有 macOS 辅助功能/屏幕录制权限，无法继续自动点击或获取限定窗口截图。
本地应用库已由用户确认使用 `127.0.0.1:54329/dish_library_test`，迁移和 ready health 均通过。
mock 冒烟只能证明本地页面与交互，不证明真实微信登录、CloudBase 或生产发布条件。

人工复核时在已打开的模拟器依次执行上表 1–8，并记录截图/结果；如希望继续由 Codex 操作，
需先在 macOS「隐私与安全性」为当前 Codex/终端进程开启辅助功能和屏幕录制，然后重启 IDE。
