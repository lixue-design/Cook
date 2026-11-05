# TASK-RECIPE-GENERATION-IMAGE-001 图片规则生成菜谱

## 任务 ID

`TASK-RECIPE-GENERATION-IMAGE-001`

## 背景

Full PRD 要求图片生成菜谱，但首版不能接真实 AI 视觉识别。已有 rules provider 对图片入口的约束是：必须由用户补充菜名或文字说明，按补充文本生成草稿，并明确不伪装成视觉识别。

## 目标

图片入口可选择图片并补充说明，通过 `provider=rules` 生成可编辑菜谱草稿。

## 范围

### 包含

- 扩展小程序生成 service，支持 `generateRecipeDraftFromImage(imageFileId, text)`。
- 菜谱列表已有图片入口点击后选择图片。
- 使用系统可编辑弹窗收集用户补充说明。
- 说明为空时阻止生成并提示。
- 成功后复用 `pendingRecognizedRecipe` 进入现有菜谱编辑页。
- 客户端验证脚本覆盖 image action payload 和草稿映射。

### 不包含

- 不做真实视觉识别或 OCR。
- 不新增图片上传存储桶流程；首版 rules 仅把临时图片标识作为任务输入审计字段。
- 不新增或重写 WXML/WXSS。
- 不直接保存正式菜谱。
- 不接真实 AI provider。

## 相关上下文

- 菜谱生成 spec：`docs/specs/ai-recipe-generation.md`
- 规则生成 spec：`docs/specs/rule-generation-engine.md`
- API 契约：`docs/api/full-prd-api-contract.md`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 当前代码库 Harness：`docs/harness/current-codebase-harness.md`

## 实现要求

- 图片入口必须要求用户补充菜名或说明。
- 服务端仍最终校验 `imageFileId` 和补充文本。
- 生成成功后只回填编辑草稿，不调用正式菜谱保存接口。
- 生成失败时给出明确提示，不声称已识别图片内容。
- 保持已有新增弹窗、Tab 和安全区结构。

## Full PRD 限制

- Provider 策略：首版只使用 `provider=rules`；不接 AI，不提交模型密钥，不做视觉识别。
- 前端样式保护：不改 WXML/WXSS/组件结构，仅改页面 JS 和 service。
- 数据事实来源：生成任务事实来源为 `recipe_generation_jobs`；正式菜谱仍由用户确认保存后产生。
- 快照规则：本任务不写计划/菜篮/模板/复刻快照。
- 用户隔离：生成任务由服务端可信 owner 隔离。
- 不可做事项：不得伪装图片识别；不得直接保存正式菜谱；不得启用 AI；不得重写新增弹窗。

## 前端设计保护

- 是否改 WXML：否
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：菜谱列表新增图片入口、菜谱创建页草稿回填
  - 弹窗：系统补充说明弹窗、原新增半屏弹窗
  - 手势：不涉及
  - 空态/加载态/失败态：取消选择、说明为空、生成中、失败、成功跳转

## API/数据变更

- 不新增数据库 migration。
- 复用 action：`generation.recipeJobs.create`
- 扩展 service：`generateRecipeDraftFromImage(imageFileId, text)`

## 验收标准

- [x] 图片入口选择图片后要求补充说明。
- [x] 补充说明为空不创建生成任务。
- [x] 有说明时创建 `provider=rules` 图片生成任务。
- [x] 成功后进入现有编辑页并填充草稿。
- [x] 失败时明确提示且不伪装视觉识别。
- [x] 未修改 WXML/WXSS 或半屏弹窗结构。

## 测试要求

- [x] 客户端验证：image action payload、草稿映射、失败 requestId。
- [x] 服务端测试：复用 image rules provider 信息不足和补充文本单测。
- [ ] 页面冒烟：需微信开发者工具或真机验证选择图片、补充说明、跳转编辑页。
- [x] 回归范围：`npm run test:recipe-generation-client`、server build/unit。

## 风险

- 首版不上传图片到云存储，仅保存临时图片标识作为 rules job 输入；真实图片识别/上传策略需后续 AI 或存储专项任务确认。
- 系统可编辑弹窗在低版本基础库上的表现需真机/开发者工具验证。

## 完成汇报模板

```text
完成：
- 图片入口选择图片并补充说明后生成草稿
- 成功回填编辑页，失败明确提示

验证：
- npm run test:recipe-generation-client
- npm --prefix server run build
- npm --prefix server run test:unit

风险/后续：
- 后续做真实上传/AI 识别前需补存储与内容安全策略
```
