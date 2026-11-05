# TASK-RECIPE-GENERATION-FRONTEND-001 前端入口启用

## 任务 ID

`TASK-RECIPE-GENERATION-FRONTEND-001`

## 背景

链接、图片、文字三类 rules 生成入口已具备 service、任务模型和草稿回填能力。需要把新增菜谱弹窗中仍显示“待上线”的入口文案收口为可用状态，同时保持既有小程序设计基线。

## 目标

三类生成入口在现有新增弹窗中呈现为可用能力，并复用已有 loading、失败提示和成功回填流程。

## 范围

### 包含

- 更新菜谱列表新增弹窗文案：链接导入、图片生成、文字生成。
- 更新文本输入页 placeholder，说明生成后可继续编辑。
- 保留既有半屏弹窗、按钮结构、class、样式和手势。
- 复用已完成的链接/图片/文字 JS 行为。
- 记录页面冒烟范围。

### 不包含

- 不新增页面或组件。
- 不修改 WXSS。
- 不改动半屏弹窗结构、动效、自定义 Tab 或安全区适配。
- 不接真实 AI provider。
- 不直接保存正式菜谱。

## 相关上下文

- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 当前代码库 Harness：`docs/harness/current-codebase-harness.md`
- 菜谱生成 spec：`docs/specs/ai-recipe-generation.md`
- 规则生成 spec：`docs/specs/rule-generation-engine.md`

## 实现要求

- 文案启用不得改变现有布局节点和 class。
- 三类入口必须仍走 `provider=rules`。
- 成功只回填编辑草稿，用户确认后才保存正式菜谱。
- 页面失败态使用现有 toast/loading 机制，不新增弹窗样式。

## Full PRD 限制

- Provider 策略：首版只使用 `provider=rules`；不接 AI，不提交模型密钥。
- 前端样式保护：只改文案，不改 WXSS、class、节点层级、手势、半屏弹窗、自定义 Tab 或安全区适配。
- 数据事实来源：生成任务事实来源为 `recipe_generation_jobs`；正式菜谱仍由用户确认保存后产生。
- 快照规则：本任务不写计划/菜篮/模板/复刻快照。
- 用户隔离：生成任务由服务端可信 owner 隔离。
- 不可做事项：不得直接保存正式菜谱；不得启用 AI；不得重写新增弹窗。

## 前端设计保护

- 是否改 WXML：是，仅文案
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：菜谱列表新增弹窗、菜谱创建页文本模式、菜谱创建页手动表单
  - 弹窗：新增菜谱半屏弹窗、系统图片补充说明弹窗
  - 手势：不涉及
  - 空态/加载态/失败态：链接空值、图片说明为空、文本为空、生成中、失败 toast、成功跳转

## API/数据变更

不新增 API 或数据结构；复用 `generation.recipeJobs.*`。

## 验收标准

- [x] 链接、图片、文字入口文案显示为可用能力。
- [x] 三类入口仍走 rules 生成任务和草稿回填。
- [x] 未修改 WXSS、节点结构或手势。
- [x] 不直接保存正式菜谱。

## 测试要求

- [x] 客户端验证：三类 action payload 和草稿映射。
- [x] 服务端测试：generation job 和 provider 单测。
- [ ] 页面冒烟：需微信开发者工具或真机验证三入口视觉与交互。
- [x] 回归范围：`npm run test:recipe-generation-client`、`npm run test:recipe-draft`、server build/unit。

## 风险

- 未在微信开发者工具/真机执行视觉冒烟；需后续在真实小程序环境确认系统可编辑弹窗和键盘适配。

## 完成汇报模板

```text
完成：
- 三类生成入口文案启用
- 保留现有新增弹窗结构和样式

验证：
- npm run test:recipe-generation-client
- npm run test:recipe-draft
- npm --prefix server run build
- npm --prefix server run test:unit

风险/后续：
- 需开发者工具或真机页面冒烟
```
