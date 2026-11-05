# MVP 内测诊断指南

## 1. 用户侧收集

出现登录、菜谱保存、计划生成或菜篮同步失败时，记录：

- 发生时间（含时区）。
- 所在页面与刚执行的操作。
- 页面展示的错误文案。
- 错误码和 requestId（若测试工具可查看云函数响应）。
- 是否可稳定复现，以及网络环境。

不要收集或粘贴 AppSecret、token、数据库连接串、完整图片 base64、OpenID、菜谱正文
或其他用户隐私。

## 2. 小程序本地诊断

`services/diagnostics.js` 在本地存储键 `cook.diagnostics` 中保留最近 20 条脱敏记录：

- `time`
- `module`
- `action`
- `outcome`
- `code` / `requestId`
- `warningCodes`

记录不包含 payload、message、昵称、头像、菜谱内容或食材内容。诊断写入失败不会阻塞业务。

## 3. 服务端定位

Cloud Function 每个 action 输出一条 `[action]` 结构化日志，只包含：

- requestId
- action
- success / failure
- 稳定错误码
- warning codes
- durationMs

按 requestId 优先检索；没有 requestId 时使用时间窗口、action 和错误码组合检索。
服务端日志不得输出 payload、用户身份、内部错误 message、SQL 或堆栈。

## 4. warnings

计划生成和菜篮同步 warnings 属于成功响应，不按故障处理：

- 页面以提示弹窗展示用户可读 message。
- 诊断仅记录 warning code。
- warning 不触发回滚，也不改写为 `INTERNAL_ERROR`。

## 5. 能力边界

MVP 不接商业 APM。日志保留期、访问权限和检索能力依赖 CloudBase 环境配置，
提审前由发布清单确认。
