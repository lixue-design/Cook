# TASK-GENERATION-RULES-001 规则生成引擎基座

## 任务 ID

`TASK-GENERATION-RULES-001`

## 背景

Full PRD 阶段将恢复原 PRD 中的链接、图片和文字生成菜谱等能力，但首版不能接真实 AI。继续实现具体入口和任务模型前，需要先建立可解释、可测试、可复用的 provider 抽象和 `rules` provider 基座。

## 目标

建立服务端规则生成引擎基座，支持 `provider=rules`，预留 `provider=ai`，并统一超时、`requestId`、输出 schema 校验和稳定错误 code。

## 范围

### 包含

- 新增服务端生成 provider 类型和执行器。
- 首版只允许执行 `rules` provider。
- 预留 `ai` provider 枚举和不可用错误。
- 支持链接、图片、文字三种 `sourceType` 的输入校验基座。
- 对 provider 输出做统一 schema、长度和结构校验。
- 输出稳定 warnings / error code，便于后续任务模型和前端展示。
- 单元测试覆盖 rules 执行、ai 拒绝、超时和非法输出拦截。

### 不包含

- 不新增数据库 job 表。
- 不实现 `generation.recipeJobs.*` action。
- 不接真实 AI 或模型服务。
- 不提交模型密钥、生产地址或隐私配置。
- 不修改小程序页面、组件、WXML 或 WXSS。
- 不直接创建正式菜谱。

## 相关上下文

- Full PRD 范围：`docs/full-prd-scope-and-implementation-plan.md`
- Full PRD 队列：`docs/tasks/full-prd-README.md`
- 规则引擎 spec：`docs/specs/rule-generation-engine.md`
- 菜谱生成 spec：`docs/specs/ai-recipe-generation.md`
- Full PRD API 契约：`docs/api/full-prd-api-contract.md`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 当前代码库 Harness：`docs/harness/current-codebase-harness.md`

## 实现要求

- provider 执行入口必须显式接收 `provider`，首版只有 `rules` 可以成功执行。
- `provider=ai` 必须返回或抛出可诊断的 `GENERATION_PROVIDER_UNAVAILABLE`，不能尝试调用外部服务。
- 每次执行必须有 `requestId`，供后续 action 或 job 记录使用。
- 执行器必须支持超时，并将超时映射为 `GENERATION_TIMEOUT`。
- provider 输出必须经过统一 schema 校验，非法输出映射为 `GENERATION_OUTPUT_INVALID`。
- `rules` provider 生成的草稿必须适配现有菜谱编辑页字段，不直接保存为正式菜谱。
- 图片规则生成不得伪装视觉识别；信息不足时返回 `IMAGE_RULES_INPUT_INSUFFICIENT`。

## Full PRD 限制

- Provider 策略：首版仅实现并允许 `provider=rules`；只预留 `provider=ai` 类型和不可用错误，不接真实 AI。
- 前端样式保护：纯服务端基座任务，不改既有小程序页面、组件、WXML、WXSS、布局、手势、自定义 Tab、半屏弹窗或安全区适配。
- 数据事实来源：本任务不写业务数据；后续 job 和草稿任务必须以服务端可信身份和生成结果校验为准。
- 快照规则：本任务不写计划、菜篮、模板或复刻数据；后续生成草稿保存为正式菜谱、计划和菜篮同步时必须按对应模块写快照。
- 用户隔离：本任务只提供纯执行器；后续 action/job 写入时必须从 CloudBase 可信身份解析 owner，不接受客户端 userId。
- 不可做事项：不得新增数据库 job 表；不得实现具体前端入口；不得直接创建正式菜谱；不得调用真实 AI；不得提交模型密钥。

## 前端设计保护

纯后端任务，不涉及页面改动。

- 是否改 WXML：不涉及
- 是否改 WXSS：不涉及
- 是否改组件结构：不涉及
- 是否保持现有字段契约：是，生成草稿字段按现有编辑页契约设计
- 是否优先通过 `services/` 或数据映射接入：不涉及
- 视觉回归范围：
  - 页面：不涉及
  - 弹窗：不涉及
  - 手势：不涉及
  - 空态/加载态/失败态：不涉及

## API/数据变更

- 不新增对外 action。
- 不新增数据库 migration。
- 新增服务端内部模块，供后续 `TASK-RECIPE-GENERATION-JOBS-001` 和三类入口任务调用。

## 验收标准

- [x] `provider=rules` 可生成结构化菜谱草稿或稳定失败。
- [x] `provider=ai` 首版不可执行，并返回稳定 provider 不可用错误。
- [x] 执行超时会返回 `GENERATION_TIMEOUT`。
- [x] 非法 provider 输出会被 schema 校验拦截。
- [x] 链接、图片、文字三类输入均有最小校验和错误 code。
- [x] 小程序端无模型密钥或前端样式改动。

## 测试要求

- [x] 单元测试：rules 执行、ai 拒绝、超时、schema 校验、三类输入校验。
- [x] 接口测试：本任务不新增 action，不涉及。
- [x] 页面冒烟：不涉及。
- [x] 回归范围：服务端 TypeScript build、相关 unit test。

## 风险

- 本任务只建立基座，不提供可被小程序直接调用的生成入口。
- 规则生成质量只保证可解释和可校验，具体链接/图片/文字解析能力会在后续纵向任务增强。

## 完成汇报模板

```text
完成：
- 建立规则生成 provider 基座
- 补充任务卡和单元测试

验证：
- npm --prefix server run build
- 相关 unit test

风险/后续：
- 后续任务继续实现 job 表、action 和前端入口
```
