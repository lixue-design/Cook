# TASK-RECIPE-GENERATION-DRAFT-001 生成结果草稿回填

## 任务 ID

`TASK-RECIPE-GENERATION-DRAFT-001`

## 背景

菜谱生成任务模型已能产生 `resultDraft`，但生成结果不能直接保存为正式菜谱。需要把任务结果稳定映射到现有菜谱编辑页表单，由用户确认、修改后再走既有 `recipes.create/update` 保存链路。

## 目标

把 provider 输出映射到现有菜谱编辑草稿，并在已有文本模式中支持生成后切回手动编辑表单。

## 范围

### 包含

- 新增小程序 `services/recipe-generation-api-*`。
- 支持 `generation.recipeJobs.create/get/cancel` remote 调用。
- 新增 `resultDraft -> recipe-create form` 映射。
- 文本模式点击确定后创建 `provider=rules` 生成任务，成功则切回现有手动编辑表单。
- 生成失败保留原始文本输入，不清空用户内容。
- Mock service 支持本地规则草稿回填。
- 客户端验证脚本覆盖 action、映射和失败态。

### 不包含

- 不恢复菜谱列表新增弹窗的链接/图片/文字入口。
- 不新增页面、组件、WXML 或 WXSS。
- 不直接保存正式菜谱。
- 不接真实 AI provider。
- 不实现图片/链接入口的完整前端流程。

## 相关上下文

- Full PRD 队列：`docs/tasks/full-prd-README.md`
- 菜谱生成 spec：`docs/specs/ai-recipe-generation.md`
- 规则生成 spec：`docs/specs/rule-generation-engine.md`
- API 契约：`docs/api/full-prd-api-contract.md`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 当前代码库 Harness：`docs/harness/current-codebase-harness.md`

## 实现要求

- `resultDraft` 必须映射到现有编辑页字段：`name/category/duration/calories/coverUrl/mainIngredients/sideIngredients/seasonings/steps`。
- 生成成功后只填充编辑表单并标记未保存，不调用 `createRecipe`。
- 失败时保留文本输入，展示可读错误。
- 入口仍使用 `provider=rules`；`provider=ai` 不可用。
- 不修改既有小程序布局、半屏弹窗、自定义 Tab 或手势。

## Full PRD 限制

- Provider 策略：首版只通过 `provider=rules` 创建生成任务；不接真实 AI，不提交模型密钥。
- 前端样式保护：不修改 WXML/WXSS 和组件结构；只改 service 与页面 JS 行为。
- 数据事实来源：生成任务结果来源为 `recipe_generation_jobs.result_draft`；正式菜谱事实来源仍是用户确认后的菜谱保存接口。
- 快照规则：本任务不写计划、菜篮、模板或复刻快照；后续正式菜谱加入计划/菜篮时仍走快照规则。
- 用户隔离：生成任务由服务端可信 owner 隔离；小程序只消费当前用户可访问的 job 结果。
- 不可做事项：不得直接保存正式菜谱；不得启用 AI；不得改动既有视觉结构；不得把生成结果写入全局图库。

## 前端设计保护

- 是否改 WXML：否
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是，复用现有编辑页 form 契约
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：菜谱创建页文本模式到手动模式切换
  - 弹窗：不涉及新增弹窗
  - 手势：不涉及
  - 空态/加载态/失败态：文本为空、生成中、生成失败、生成成功后表单态

## API/数据变更

- 不新增数据库 migration。
- 新增小程序 service：
  - `services/recipe-generation-api.js`
  - `services/recipe-generation-api-remote.js`
  - `services/recipe-generation-api-mock.js`
- 复用已有 action：
  - `generation.recipeJobs.create`
  - `generation.recipeJobs.get`
  - `generation.recipeJobs.cancel`

## 验收标准

- [x] 生成任务成功结果可映射为现有菜谱编辑表单。
- [x] 文本模式生成成功后切回手动表单，用户可继续编辑再保存。
- [x] 生成失败保留用户输入并展示错误。
- [x] 不调用正式菜谱保存接口。
- [x] 未修改 WXML/WXSS 或既有页面布局结构。

## 测试要求

- [x] 单元/脚本验证：remote action、草稿映射、失败 requestId、文本生成封装。
- [x] 接口测试：复用 server `generation.recipeJobs.*` 单测。
- [ ] 页面冒烟：需微信开发者工具或真机验证文本模式生成后表单回填。
- [x] 回归范围：`npm run test:recipe-generation-client`、`npm run test:recipe-draft`、server build/unit。

## 风险

- 菜谱列表的新增弹窗入口仍显示待上线，完整入口启用留给 `TASK-RECIPE-GENERATION-FRONTEND-001`。
- 页面冒烟需要微信开发者工具或真机，本地脚本只能覆盖 service 和数据映射。

## 完成汇报模板

```text
完成：
- 新增生成 service 和 resultDraft 到编辑表单映射
- 文本模式生成后回填现有手动编辑表单

验证：
- npm run test:recipe-generation-client
- npm run test:recipe-draft
- npm --prefix server run build
- npm --prefix server run test:unit

风险/后续：
- 后续启用新增弹窗三类入口，并做微信开发者工具冒烟
```
