# TASK-HARNESS-002 API 契约索引与真实化状态矩阵

## 任务 ID

`TASK-HARNESS-002`

## 背景

当前小程序已经存在 `services/` 适配层，后端也已有 Cloud Function action 和数据库 RPC，但缺少统一 API 契约索引。计划和菜篮仍是 mock/globalData，菜谱 remote adapter 已存在但默认未启用。需要建立一张真实化状态矩阵，帮助后续任务明确哪些接口已真实、哪些仍是 mock、哪些缺服务端能力。

## 目标

形成一份可维护的 API 契约索引和真实化状态矩阵，作为后续前后端联调和 Agent 实现的基准。

## 范围

### 包含

- 新增 `docs/api/` 下的接口索引文档，或在 Harness 下新增 API 状态矩阵。
- 列出当前 Cloud Function action：
  - `recipes.*`
  - `categories.*`
  - `covers.upload`
  - `health.ready`
- 列出尚未实现的 MVP API：
  - 登录/用户态。
  - 日计划/周计划。
  - 菜篮。
  - 协议/注销。
- 对每个接口标记：mock、remote adapter、server implemented、missing。
- 标记对应前端 service 文件和后端文件。

### 不包含

- 不实现新接口。
- 不改页面。
- 不强制迁移到 REST 或 OpenAPI，除非团队确认。

## 相关上下文

- 当前代码库：`docs/harness/current-codebase-harness.md`
- MVP API 拆解：`docs/mvp-scope-and-implementation-breakdown.md`
- 工程方案：`docs/engineering-framework-and-team-plan.md`
- 菜谱 spec：`docs/specs/recipe.md`
- 计划 spec：`docs/specs/plan.md`
- 菜篮 spec：`docs/specs/basket.md`
- 前端 service：`services/`
- 后端入口：`server/src/recipe-api.ts`、`server/src/cloud-function.ts`

## 实现要求

- 明确当前后端实际采用 Cloud Function action 模式，而不是已完成 REST API。
- 对 MVP 文档中的 REST 路径和当前 action 模式之间的差异做说明。
- 对每个 missing 接口给出推荐任务卡 ID。
- 标注所有写接口必须鉴权、所有用户数据必须隔离。

## 前端设计保护

纯文档任务，不涉及。

- 是否改 WXML：不涉及
- 是否改 WXSS：不涉及
- 是否改组件结构：不涉及
- 是否保持现有字段契约：不涉及
- 是否优先通过 `services/` 或数据映射接入：不涉及
- 视觉回归范围：
  - 页面：不涉及
  - 弹窗：不涉及
  - 手势：不涉及
  - 空态/加载态/失败态：不涉及

## API/数据变更

无代码变更；新增文档化 API 状态。

## 验收标准

- [ ] API 状态矩阵覆盖菜谱、分类、计划、菜篮、登录、合规。
- [ ] 每个接口标记当前实现状态和对应代码位置。
- [ ] 说明当前 action 模式与 MVP REST 建议的关系。
- [ ] missing 接口能对应到后续任务卡。
- [ ] 明确鉴权和用户隔离要求。

## 测试要求

- [ ] 单元测试：不涉及。
- [ ] 接口测试：不涉及。
- [ ] 页面冒烟：不涉及。
- [ ] 回归范围：检查文档中引用的文件路径存在。

## 风险

- 如果后续决定切换 REST/OpenAPI，本文档需要升级为正式 OpenAPI 契约。

## 完成汇报模板

```text
完成：
- 建立 API 状态矩阵
- 标记 mock/remote/server/missing 状态

验证：
- 检查引用路径和任务卡映射

风险/后续：
- 说明是否还需要正式 OpenAPI
```
