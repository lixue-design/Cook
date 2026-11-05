# TASK-RECIPE-GENERATION-JOBS-001 菜谱生成任务模型

## 任务 ID

`TASK-RECIPE-GENERATION-JOBS-001`

## 背景

规则生成引擎基座已完成，但小程序前端后续需要一个可查询、可诊断、owner 隔离的任务模型来承载链接、图片、文字三类生成入口。现有 `generation_jobs` 表属于菜品图库生图任务，字段绑定 `canonical_dish_id` 和 `asset_id`，不能复用为菜谱草稿生成任务。

## 目标

建立 `recipe_generation_jobs` 任务表、状态机和 `generation.recipeJobs.*` action，首版只执行 `provider=rules`，生成结果只保存为任务结果草稿。

## 范围

### 包含

- 新增 `recipe_generation_jobs` 表、索引、up/down migration。
- 新增 owner-scoped RPC：创建、完成、查询、取消。
- 新增 `generation.recipeJobs.create/get/cancel` Cloud Function action。
- 创建任务时运行 `rules` provider，并落库为 `succeeded` 或 `failed`。
- 查询任务返回状态、结果草稿、warnings、explanations、错误和 requestId。
- 取消任务只允许 `pending/running`，已完成任务返回冲突。
- 单元测试覆盖成功、失败、AI provider 拒绝、查询、取消和用户隔离。

### 不包含

- 不新增小程序入口页面或修改现有 WXML/WXSS。
- 不把生成结果保存为正式菜谱。
- 不实现草稿回填到编辑页。
- 不接真实 AI provider 或模型服务。
- 不实现后台异步 worker、重试队列或成本扣费。
- 不写入全局菜品图库。

## 相关上下文

- Full PRD 队列：`docs/tasks/full-prd-README.md`
- Full PRD 范围：`docs/full-prd-scope-and-implementation-plan.md`
- 规则生成 spec：`docs/specs/rule-generation-engine.md`
- 菜谱生成 spec：`docs/specs/ai-recipe-generation.md`
- API 契约：`docs/api/full-prd-api-contract.md`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 当前代码库 Harness：`docs/harness/current-codebase-harness.md`

## 实现要求

- 任务必须属于当前可信身份解析出的 owner，不接受客户端 `userId`。
- `provider=rules` 是首版唯一可执行 provider。
- `provider=ai` 只能返回 `GENERATION_PROVIDER_UNAVAILABLE`，不得调用外部服务。
- 创建任务必须校验 `sourceType/provider/input`，非法入参不进入 job 表。
- provider 输出必须经过既有 schema 校验后才能写入 `result_draft`。
- 任务失败必须写入稳定 `error.code/message` 和 `requestId`。
- 取消接口只能取消 `pending/running`，已完成任务不能回退状态。

## Full PRD 限制

- Provider 策略：首版只启用 `provider=rules`；保留 `provider=ai` 字段和不可用错误，不接真实 AI，不提交模型密钥。
- 前端样式保护：纯后端/API 任务，不修改既有页面、组件、WXML、WXSS、布局、手势、自定义 Tab、半屏弹窗或安全区适配。
- 数据事实来源：生成任务事实来源为 `recipe_generation_jobs`；正式菜谱仍只能由现有菜谱保存接口创建。
- 快照规则：本任务不写计划、菜篮、模板或复刻数据；生成结果后续回填编辑草稿，用户确认保存后才进入正式菜谱和后续快照链路。
- 用户隔离：`recipe_generation_jobs.owner_id` 关联 `app_users.id`，所有 action 通过可信身份和 owner-scoped RPC 执行。
- 不可做事项：不得复用图库 `generation_jobs`；不得直接创建正式菜谱；不得调用真实 AI；不得改动小程序视觉；不得把生成结果写入全局图库。

## 前端设计保护

纯后端/API 任务，不涉及页面改动。

- 是否改 WXML：不涉及
- 是否改 WXSS：不涉及
- 是否改组件结构：不涉及
- 是否保持现有字段契约：是，结果草稿沿用现有菜谱编辑字段
- 是否优先通过 `services/` 或数据映射接入：不涉及
- 视觉回归范围：
  - 页面：不涉及
  - 弹窗：不涉及
  - 手势：不涉及
  - 空态/加载态/失败态：不涉及

## API/数据变更

- 新增表：`recipe_generation_jobs`
- 新增 RPC：
  - `cook_recipe_generation_job_create`
  - `cook_recipe_generation_job_complete`
  - `cook_recipe_generation_job_get`
  - `cook_recipe_generation_job_cancel`
- 新增 action：
  - `generation.recipeJobs.create`
  - `generation.recipeJobs.get`
  - `generation.recipeJobs.cancel`

## 验收标准

- [x] `provider=rules` 可创建任务，并落库为成功或失败。
- [x] `provider=ai` 首版不可执行，且不创建 job。
- [x] 查询接口只能读取当前 owner 的任务。
- [x] 取消接口只能取消未完成任务，已完成任务返回 `CONFLICT`。
- [x] 生成结果只保存在任务 `resultDraft`，不创建正式菜谱。
- [x] 错误包含稳定 code/message 和 requestId。
- [x] 未修改既有小程序 WXML/WXSS 和页面交互。

## 测试要求

- [x] 单元测试：创建成功、provider 失败、AI 拒绝、查询、取消、非法入参。
- [x] 接口测试：Cloud Function action 单测覆盖 `generation.recipeJobs.*`。
- [x] 页面冒烟：不涉及新增页面。
- [x] 回归范围：服务端 TypeScript build、相关 unit test、迁移契约。

## 风险

- 首版 create action 同步执行 rules provider，不包含后台 worker 和轮询中的长耗时任务；后续如接 AI provider，需要异步执行、重试和成本控制。
- 任务结果尚未回填小程序编辑页，后续 `TASK-RECIPE-GENERATION-DRAFT-001` 继续完成前端草稿衔接。

## 完成汇报模板

```text
完成：
- 建立菜谱生成任务模型和 generation.recipeJobs.* action
- 补充任务卡、迁移契约和单元测试

验证：
- npm --prefix server run build
- npm --prefix server run test:unit

风险/后续：
- 后续实现生成结果草稿回填，不直接保存正式菜谱
```
