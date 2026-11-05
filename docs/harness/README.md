# Harness Engineering 总览

Harness 的目标不是替代研发判断，而是给研发和 Agent 提供稳定的工作轨道：清晰上下文、明确边界、可验证任务、自动/人工验收和审查反馈。

## 1. Harness 分层

```text
Product Spec Harness
  定义 MVP 范围、模块目标、非目标、验收标准

Agent Harness
  定义 Agent 读哪些上下文、如何改代码、哪些边界不能越过

Task Harness
  把需求拆成可执行、可验证、可审查的任务卡

Verification Harness
  用测试、checklist、冒烟流程约束交付质量

Review Harness
  用 PR 检查清单防止范围膨胀和关键规则破坏
```

## 2. 文档地图

| 文档 | 用途 |
| --- | --- |
| `AGENTS.md` | 仓库级 Agent/研发规则。 |
| `docs/harness/current-codebase-harness.md` | 基于当前代码读取后的最新执行轨道和缺口清单。 |
| `docs/harness/local-development-and-verification.md` | 本地启动、迁移、测试和已知环境差异说明。 |
| `docs/harness/frontend-design-preservation.md` | 保留现有小程序前端设计和交互的专门约束。 |
| `docs/harness/full-prd-team-and-harness-plan.md` | Full PRD 阶段人员分工、任务限制、RACI 和前端样式硬门禁。 |
| `docs/harness/agent-operating-guide.md` | Agent 接任务、实现、验证、汇报的操作流程。 |
| `docs/harness/context-map.md` | 不同任务应读取的最小上下文集合。 |
| `docs/full-prd-scope-and-implementation-plan.md` | MVP 后实现原始 PRD 剩余能力的范围、阶段和决策项。 |
| `docs/api/status-matrix.md` | 当前 API action、service、server 和 mock/missing 状态矩阵。 |
| `docs/api/full-prd-api-contract.md` | MVP 后 Full PRD 能力的 API 契约。 |
| `docs/harness/team-and-harness-plan.md` | 结合产品设计确认人员分工、RACI、Harness 落地节奏。 |
| `docs/specs/spec-template.md` | 模块 spec 模板。 |
| `docs/specs/recipe.md` | 菜谱模块 MVP spec。 |
| `docs/specs/plan.md` | 计划模块 MVP spec。 |
| `docs/specs/basket.md` | 菜篮模块 MVP spec。 |
| `docs/specs/ai-recipe-generation.md` | 链接/图片/文字生成菜谱专项 spec。 |
| `docs/specs/rule-generation-engine.md` | 规则生成 provider、用户习惯、三餐和营养均衡专项 spec。 |
| `docs/specs/ai-dish-library-full.md` | AI 菜品图库、同义词和运营专项 spec。 |
| `docs/specs/plan-advanced.md` | 日计划增强、月计划、复盘和模板专项 spec。 |
| `docs/specs/account-cancel-automation.md` | 账号注销自动化和协议版本专项 spec。 |
| `docs/tasks/task-template.md` | 研发任务卡模板。 |
| `docs/tasks/full-prd-README.md` | MVP 后 Full PRD 任务队列。 |
| `docs/checklists/mvp-acceptance.md` | MVP 验收清单。 |
| `docs/checklists/full-prd-acceptance.md` | Full PRD 全量能力验收清单。 |
| `docs/checklists/migration-verification-template.md` | 数据库 migration up/down 或等价 SQL 验证记录模板。 |
| `docs/checklists/miniprogram-smoke-record-template.md` | 小程序页面、入口和关键状态手动冒烟记录模板。 |
| `docs/reviews/pr-review-checklist.md` | PR 审查清单。 |
| `docs/reviews/defect-report-template.md` | 缺陷复现、期望、实际、影响、证据和阻塞状态记录模板。 |

## 3. 推荐工作流

```text
PM/Tech Lead 写任务卡
  -> Agent/研发读取任务卡和模块 spec
  -> 实现最小闭环
  -> 跑测试和 checklist
  -> 提交 PR
  -> Review Harness 检查
  -> 合并或回退
```

## 4. 纵向切片顺序

1. 登录与用户。
2. 菜谱 CRUD。
3. 分类管理。
4. 日计划。
5. 周计划生成。
6. 菜篮同步。
7. 我的页与合规。

每个切片都应包含：

- 页面或调用入口。
- 接口或数据读写。
- 错误态。
- 最小测试。
- 手动验收步骤。

## 5. Verification Harness 模板使用

后续任务按改动类型选择验证模板：

| 改动类型 | 必用模板 | 使用时机 |
| --- | --- | --- |
| 数据库 migration | `docs/checklists/migration-verification-template.md` | 新增或修改 migration 时，记录 up、down 或等价 SQL 检查；无法运行也要记录替代检查和剩余风险。 |
| 小程序页面或 service 数据接入 | `docs/checklists/miniprogram-smoke-record-template.md` | 改 WXML/WXSS/页面 JS、组件、`services/` 数据映射、登录态、空态、失败态或关键手势时记录。 |
| 验证、冒烟、review 发现问题 | `docs/reviews/defect-report-template.md` | 发现缺陷时记录复现步骤、期望、实际、影响范围、环境、证据、优先级和阻塞状态。 |

这些模板是每个任务的验证记录入口，不替代 `TASK-QA-MVP-001` 的最终全链路验收。Codex 沙箱、微信开发者工具、Docker、Cloud Function 或测试数据库不可用时，必须在对应模板的“无法运行时的替代记录”中说明未运行原因、替代检查和剩余风险。

## 6. 变更治理

任何超过 MVP 范围的需求都不能直接进入实现，必须先做其中之一：

- 更新 MVP 范围文档。
- 新增专项 spec。
- 明确替换掉同等工作量的已有范围。

默认不接受“顺手加一下”的功能扩张。
