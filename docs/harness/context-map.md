# Context Map

本文定义不同任务所需的最小上下文集合，避免每次实现都读取无关文档。

## 1. 通用入口

所有实现任务默认读取：

- `AGENTS.md`
- `docs/harness/current-codebase-harness.md`
- 对应任务卡
- 对应模块 spec

跨模块或范围不清时，再读取：

- `docs/mvp-scope-and-implementation-breakdown.md`
- `docs/engineering-framework-and-team-plan.md`

## 2. 模块上下文

| 任务类型 | 必读 | 选读 |
| --- | --- | --- |
| 菜谱列表/详情/编辑 | `docs/specs/recipe.md`、`docs/harness/frontend-design-preservation.md` | MVP 文档第 4/5/6 节 |
| 分类管理 | `docs/specs/recipe.md` | MVP 文档问题 Q9/Q17 |
| 日计划 | `docs/specs/plan.md`、`docs/harness/frontend-design-preservation.md` | `docs/specs/recipe.md` |
| 周计划生成 | `docs/specs/plan.md` | `docs/specs/basket.md`、`docs/harness/frontend-design-preservation.md` |
| 菜篮同步 | `docs/specs/basket.md`、`docs/harness/frontend-design-preservation.md` | `docs/specs/plan.md` |
| 登录/我的/协议 | MVP 文档合规章节 | 工程方案第 7/8 节 |
| AI 菜品图库 | 若 `docs/ai-dish-library/README.md` 已建立则读取；否则先执行 `docs/tasks/TASK-AI-DISH-001.md` 建立专项边界 | `server/src/dish-image-library.ts`、`server/src/ark-dish-image-generator.ts` |
| 规则优先的菜谱生成 | `docs/specs/rule-generation-engine.md`、`docs/specs/ai-recipe-generation.md`、`docs/full-prd-scope-and-implementation-plan.md`、对应 Full PRD 任务卡 | `docs/specs/recipe.md`、`docs/harness/frontend-design-preservation.md` |
| Full PRD 菜品图库 | `docs/specs/ai-dish-library-full.md`、`docs/full-prd-scope-and-implementation-plan.md`、对应 Full PRD 任务卡 | `docs/ai-dish-library/README.md`、`server/src/dish-image-library.ts`、`server/src/ark-dish-image-generator.ts` |
| 月计划/计划增强 | `docs/specs/rule-generation-engine.md`、`docs/specs/plan-advanced.md`、`docs/specs/plan.md`、对应 Full PRD 任务卡 | `docs/specs/basket.md`、`docs/harness/frontend-design-preservation.md` |
| 注销自动化/协议版本 | `docs/specs/account-cancel-automation.md`、对应 Full PRD 任务卡 | `docs/specs/recipe.md`、`docs/specs/plan.md`、`docs/specs/basket.md` |
| 数据库迁移 | 对应模块 spec | 工程方案第 6 节 |
| 测试补齐 | 对应模块 spec | `docs/checklists/mvp-acceptance.md` |

## 3. 不需要读取代码的场景

以下任务可以先只产出文档或计划：

- MVP 范围调整。
- 人员分工。
- 任务拆解。
- Harness 文档。
- 验收清单。
- Review checklist。

## 4. 需要读取代码的场景

以下任务必须读取现有实现：

- 修改页面、组件、接口、迁移。
- 判断功能完成度。
- 修 bug。
- 重构。
- 添加测试。
- 接入真实服务端。
- 任何会影响现有 WXML/WXSS、组件结构、手势、动效、Tab、弹窗的改动。
