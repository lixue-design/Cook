# TASK-RECIPE-GENERATION-TEXT-001 文字规则生成菜谱

## 任务 ID

`TASK-RECIPE-GENERATION-TEXT-001`

## 背景

文本 rules provider、生成任务模型和草稿回填已完成。需要把菜谱列表新增弹窗的文字入口接到现有菜谱创建页文本模式，让用户输入描述后生成可编辑草稿。

## 目标

用户可从新增弹窗进入文本生成页，输入文字描述后通过 `provider=rules` 生成菜谱编辑草稿。

## 范围

### 包含

- 菜谱列表文字入口跳转到 `pages/recipe-create/index?mode=text`。
- 复用已有文本模式输入页和 `onConfirmText` 生成逻辑。
- 生成成功后切回现有手动编辑表单。
- 生成失败保留原始文本输入。
- 客户端验证脚本覆盖文本生成 action 和草稿映射。

### 不包含

- 不新增 WXML/WXSS。
- 不重写新增弹窗或编辑页结构。
- 不直接保存正式菜谱。
- 不接真实 AI provider。

## 相关上下文

- 菜谱生成 spec：`docs/specs/ai-recipe-generation.md`
- 规则生成 spec：`docs/specs/rule-generation-engine.md`
- API 契约：`docs/api/full-prd-api-contract.md`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 当前代码库 Harness：`docs/harness/current-codebase-harness.md`

## 实现要求

- 文本入口只负责进入现有文本模式，不改变弹窗视觉结构。
- 文本为空时阻止生成。
- 服务端最终校验文本长度和 provider 输出。
- 生成结果只进入编辑草稿，不保存正式菜谱。

## Full PRD 限制

- Provider 策略：首版只使用 `provider=rules`；不接 AI，不提交模型密钥。
- 前端样式保护：不改 WXML/WXSS/组件结构，仅改页面 JS 跳转。
- 数据事实来源：生成任务事实来源为 `recipe_generation_jobs`；正式菜谱仍由用户确认保存后产生。
- 快照规则：本任务不写计划/菜篮/模板/复刻快照。
- 用户隔离：生成任务由服务端可信 owner 隔离。
- 不可做事项：不得直接保存正式菜谱；不得启用 AI；不得重写新增弹窗。

## 前端设计保护

- 是否改 WXML：否
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：菜谱列表新增弹窗、菜谱创建页文本模式和手动表单
  - 弹窗：原新增半屏弹窗
  - 手势：不涉及
  - 空态/加载态/失败态：文本为空、生成中、失败、成功回填

## API/数据变更

- 不新增数据库 migration。
- 复用 action：`generation.recipeJobs.create`
- 复用 service：`generateRecipeDraftFromText(text)`

## 验收标准

- [x] 新增弹窗文字入口可进入文本输入页。
- [x] 文本描述可创建 `provider=rules` 生成任务。
- [x] 成功后进入现有编辑表单并填充草稿。
- [x] 失败时保留文本输入。
- [x] 未修改 WXML/WXSS 或半屏弹窗结构。

## 测试要求

- [x] 客户端验证：text action payload、草稿映射、失败 requestId。
- [x] 服务端测试：rules text provider 和 generation job 单测。
- [ ] 页面冒烟：需微信开发者工具或真机验证新增弹窗到文本页再回填表单。
- [x] 回归范围：`npm run test:recipe-generation-client`、`npm run test:recipe-draft`、server build/unit。

## 风险

- 文本页和新增弹窗文案仍沿用既有“待上线/识别”基线，完整文案和三入口统一体验留给 `TASK-RECIPE-GENERATION-FRONTEND-001`。

## 完成汇报模板

```text
完成：
- 新增弹窗文字入口进入文本生成页
- 复用现有文本生成和草稿回填

验证：
- npm run test:recipe-generation-client
- npm run test:recipe-draft
- npm --prefix server run build
- npm --prefix server run test:unit

风险/后续：
- 后续统一三入口前端状态与文案
```
