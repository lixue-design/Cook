# TASK-RECIPE-DRAFT-001 小程序冒烟记录

## 基本信息

| 字段 | 内容 |
| --- | --- |
| 任务 ID | `TASK-RECIPE-DRAFT-001` |
| 模块 | 菜谱 |
| 页面 | `pages/recipe-create/index` |
| 验证日期 | 2026-07-31 |
| 环境 | Codex 静态检查、Node 验证脚本、服务端单测 |
| 微信开发者工具 | 当前环境不可用 |

## 验收步骤与证据

| 场景 | 期望 | 结果 | 证据 |
| --- | --- | --- | --- |
| 空菜名、非法耗时/热量 | 阻止保存并给出可理解提示 | Pass | `npm run test:recipe-draft`、服务端 recipe API 测试 |
| 新建草稿恢复 | 使用 `recipeDraft:new`，恢复关键文本字段 | Pass（逻辑验证） | `npm run test:recipe-draft` |
| 编辑草稿隔离 | 使用 `recipeDraft:{recipeId}`，不污染新建或其他菜谱 | Pass（逻辑验证） | `npm run test:recipe-draft` |
| 保存失败 | 当前页面数据不重置，并立即写入草稿 | Pass（静态检查） | `pages/recipe-create/index.js` catch/空响应分支 |
| 保存成功 | 清除对应草稿，再返回详情或上一页 | Pass（静态检查） | `pages/recipe-create/index.js` 成功分支 |
| 退出未保存 | 自定义返回按钮二次确认，系统返回启用离页提醒 | Pass（静态检查） | `showModal`、`enableAlertBeforeUnload` |
| 临时图片缓存 | 不把不可跨重启恢复的临时图片路径写入草稿 | Pass | `npm run test:recipe-draft` |

## 设计保护

- [x] 未修改 WXML。
- [x] 未修改 WXSS。
- [x] 未修改组件结构。
- [x] 保持现有表单、详情和列表字段契约。
- [x] 保存中、保存失败、草稿恢复和退出确认均复用微信原生反馈，不改变页面布局。

## 无法运行时的替代记录

```text
未运行：
- 微信开发者工具中的新建/编辑、强杀重启恢复、系统返回手势和保存失败真机冒烟。

未运行原因：
- 当前 Codex 环境没有微信开发者工具、测试账号和已连接的 Cloud Function。

替代检查：
- Node 验证脚本覆盖表单校验、草稿 key、隔离、清除和临时图片清理。
- 后端 recipe API 单测覆盖非法入参最终拒绝。
- 页面 JS 语法检查和离页/失败/成功分支静态检查。

剩余风险：
- `wx.enableAlertBeforeUnload` 在目标微信基础库及 Android/iOS 返回手势上的文案和触发时机仍需真机复核。
- 本地缓存容量不足时页面不会中断编辑，但强杀后可能无法恢复；该环境异常需在真机冒烟观察。
```

## 结论

自动化与静态门禁通过；真机页面冒烟列为提测前人工复核项，不阻塞后续无真实环境依赖的 MVP 任务。
