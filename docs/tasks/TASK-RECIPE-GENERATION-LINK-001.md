# TASK-RECIPE-GENERATION-LINK-001 链接规则生成菜谱

## 任务 ID

`TASK-RECIPE-GENERATION-LINK-001`

## 背景

菜谱生成任务模型和草稿回填已完成。Full PRD 第二阶段需要逐步启用三类生成入口，本任务先实现链接输入的 rules provider 纵向切片：用户粘贴链接后生成可编辑草稿，而不是直接保存正式菜谱。

## 目标

链接输入可通过 `provider=rules` 创建生成任务，并把结果回填到现有菜谱编辑表单。

## 范围

### 包含

- 扩展小程序生成 service，支持 `generateRecipeDraftFromLink(url, text?)`。
- 菜谱列表已有链接半屏弹窗点击确认时调用链接生成。
- 成功后复用 `pendingRecognizedRecipe` 进入现有菜谱编辑页。
- 失败时保留用户已粘贴链接，不清空输入。
- 客户端验证脚本覆盖 link action payload 和草稿映射。

### 不包含

- 不新增或重写链接弹窗 WXML/WXSS。
- 不实现外链真实抓取；首版规则 provider 只做可解释 URL 草稿。
- 不启用图片/文字入口的新增弹窗。
- 不直接保存正式菜谱。
- 不接真实 AI provider。

## 相关上下文

- 菜谱生成 spec：`docs/specs/ai-recipe-generation.md`
- 规则生成 spec：`docs/specs/rule-generation-engine.md`
- API 契约：`docs/api/full-prd-api-contract.md`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 当前代码库 Harness：`docs/harness/current-codebase-harness.md`

## 实现要求

- 链接为空时前端阻止提交。
- 链接格式和 provider 输出由服务端最终校验。
- 生成成功后只回填编辑草稿，不调用正式菜谱保存接口。
- 生成失败保留原链接输入，允许用户修改后重试。
- 保持半屏弹窗、键盘适配、自定义 Tab 和安全区行为不变。

## Full PRD 限制

- Provider 策略：首版只使用 `provider=rules`；不接 AI，不提交模型密钥。
- 前端样式保护：不改 WXML/WXSS/组件结构，仅改页面 JS 和 service。
- 数据事实来源：链接生成任务事实来源为 `recipe_generation_jobs`；正式菜谱仍由用户确认保存后产生。
- 快照规则：本任务不写计划/菜篮/模板/复刻快照。
- 用户隔离：生成任务由服务端可信 owner 隔离。
- 不可做事项：不得真实抓取外链并绕过内容安全；不得直接保存正式菜谱；不得启用 AI；不得重写新增弹窗。

## 前端设计保护

- 是否改 WXML：否
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：菜谱列表新增链接弹窗、菜谱创建页草稿回填
  - 弹窗：链接半屏弹窗保持原结构
  - 手势：不涉及
  - 空态/加载态/失败态：空链接、生成中、生成失败、成功跳转

## API/数据变更

- 不新增数据库 migration。
- 复用 action：`generation.recipeJobs.create`
- 扩展 service：`generateRecipeDraftFromLink(url, text?)`

## 验收标准

- [x] 链接输入可创建 `provider=rules` 生成任务。
- [x] 成功后进入现有编辑页并填充草稿。
- [x] 失败时保留链接输入。
- [x] 不直接保存正式菜谱。
- [x] 未修改 WXML/WXSS 或半屏弹窗结构。

## 测试要求

- [x] 客户端验证：link action payload、草稿映射、失败 requestId。
- [x] 服务端测试：复用 `generation.recipeJobs.create` 和 rules link provider 单测。
- [ ] 页面冒烟：需微信开发者工具或真机验证链接弹窗到编辑页跳转。
- [x] 回归范围：`npm run test:recipe-generation-client`、server build/unit。

## 风险

- 首版 rules provider 不抓取真实网页内容，只从 URL 和用户补充信息生成低置信草稿。
- 链接弹窗文案仍保留既有“即将上线”基线，完整视觉/文案启用留给 `TASK-RECIPE-GENERATION-FRONTEND-001`。

## 完成汇报模板

```text
完成：
- 链接生成 service 与菜谱列表链接确认接入
- 成功回填编辑草稿，失败保留输入

验证：
- npm run test:recipe-generation-client
- npm --prefix server run build
- npm --prefix server run test:unit

风险/后续：
- 后续继续图片/文字入口和统一前端入口启用
```
