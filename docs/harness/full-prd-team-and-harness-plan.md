# Full PRD 人员分工与 Harness 落地规划

本文用于 MVP 之后的 Full PRD 阶段。执行方式必须和 MVP 开发一致：

```text
读取任务卡 -> 读取相关 spec -> 确认验收标准 -> 实现 -> 补测试/检查 -> 自测 -> 汇报结果
```

Full PRD 阶段新增能力更多、风险更高，但不能牺牲现有小程序体验。**前端样式是硬保护对象：不得修改既有页面和组件的视觉样式、布局结构、交互手势、自定义 Tab、半屏弹窗和安全区适配。**

## 1. 角色与职责

| 角色 | 职责 |
| --- | --- |
| PM/产品负责人 | 确认原 PRD 剩余能力优先级、冲突决策、验收标准、合规口径。 |
| UI/UX | 仅在新增页面需要时提供增量设计；不得重设既有页面视觉。 |
| 小程序前端 | 在不改既有样式的前提下接入新增入口、状态和数据映射；新增页面复用现有组件和设计基线。 |
| 后端研发 | 负责规则 provider、任务模型、数据模型、鉴权、计划/月计划、注销自动化和接口测试。 |
| QA | 负责 Full PRD 验收清单、页面冒烟、规则样例、真实环境验收和缺陷记录。 |
| Tech Lead | 负责架构边界、Harness 维护、任务拆解、PR review 和跨模块一致性。 |
| 运营/内容负责人 | 负责菜品图库、同义词、图片质量和运营动作验收。 |
| 法务/合规负责人 | 负责协议版本、注销 SLA、数据删除/匿名化范围和提审合规确认。 |
| Agent/Codex | 按任务卡受控执行代码、测试、文档同步和局部审查；不能擅自扩大范围或改前端样式。 |

## 2. 前端样式硬门禁

Full PRD 任意任务都必须遵守：

- 不修改既有 `pages/**/index.wxss`、`components/**/index.wxss` 的视觉样式，除非任务卡明确写明是修复阻断级显示 bug，且 PM、设计、Tech Lead 三方确认。
- 不重写既有 WXML 结构来接功能；优先通过 `services/`、页面 JS 数据映射和已有组件状态完成。
- 不改变现有自定义 Tab、半屏弹窗、浮动加号、日期切换、拖拽、滑动删除、安全区适配。
- 不引入新的 UI 组件库风格。
- 新增页面或新增组件必须复用现有设计语言、尺寸体系、组件基座和交互方式；新增样式只能写在新增文件中，不反向影响既有页面。
- 任何前端任务的完成汇报必须说明“前端样式是否改动”。默认答案应为“未改既有样式”。

## 3. RACI

说明：R=执行负责，A=最终负责，C=咨询参与，I=知会。

| 工作项 | PM | 设计 | 前端 | 后端 | QA | Tech Lead | 运营 | 法务 | Agent |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Full PRD 范围冻结 | A/R | C | C | C | C | R | C | C | I |
| 任务卡拆解 | A | I | C | C | C | R | C | C | R |
| 规则生成 provider | C | I | C | R | C | A | I | I | R |
| 用户习惯模型 | A | C | C | R | C | R | I | I | R |
| 菜谱生成入口 | A | C | R | R | C | C | I | I | R |
| 菜品图库规则 | C | I | C | R | C | A | R | I | R |
| 图库运营能力 | C | C | R | R | C | A | A/R | I | R |
| 日/周/月计划联动 | A | C | R | R | C | A | I | I | R |
| 注销自动化 | C | I | C | R | C | A | I | A/R | R |
| API 契约 | C | I | C | R | C | A | C | C | R |
| 数据库 migration | I | I | C | A/R | C | C | I | C | R |
| 页面冒烟 | C | C | R | C | A/R | C | C | C | R |
| PR Review | I | C | C | C | C | A/R | C | C | C |
| 发布验收 | A/R | C | C | C | A/R | A | C | A/R | I |

## 4. Full PRD 任务责任与限制矩阵

| 任务 ID | 主负责人 | 评审人 | QA/验收 | 核心限制 |
| --- | --- | --- | --- | --- |
| `TASK-GENERATION-RULES-001` | 后端 | Tech Lead | QA | 只实现 `provider=rules`；不得接真实 AI；不得改前端样式。 |
| `TASK-PLAN-PREFERENCES-001` | 后端 + 前端 | PM + Tech Lead | QA | 习惯字段必须可解释；新增入口复用现有样式；不得改既有 WXSS。 |
| `TASK-RECIPE-GENERATION-JOBS-001` | 后端 | Tech Lead | QA | 任务必须 owner 隔离；首版只启用 rules；不得让任务直接创建正式菜谱。 |
| `TASK-RECIPE-GENERATION-DRAFT-001` | 前端 + 后端 | Tech Lead | QA | 只回填现有编辑页草稿契约；不改编辑页视觉结构。 |
| `TASK-RECIPE-GENERATION-LINK-001` | 后端 + 前端 | PM + Tech Lead | QA | 不抓取不可控敏感内容；失败保留输入；入口样式不改。 |
| `TASK-RECIPE-GENERATION-IMAGE-001` | 前端 + 后端 | Tech Lead | QA | 不伪装 AI 视觉识别；信息不足时提示补充；图片入口样式不改。 |
| `TASK-RECIPE-GENERATION-TEXT-001` | 后端 + 前端 | PM + Tech Lead | QA | 规则拆分必须可解释；空输入拦截；不接模型。 |
| `TASK-RECIPE-GENERATION-FRONTEND-001` | 前端 | 设计 + Tech Lead | QA | 只能启用现有入口/状态；不得改既有 WXML/WXSS 视觉；必须覆盖失败态。 |
| `TASK-DISH-LIBRARY-STANDARDIZE-001` | 后端 | Tech Lead + 运营 | QA | 同义词规则可审计；不做黑盒语义归一。 |
| `TASK-DISH-LIBRARY-GENERATE-001` | 后端 | Tech Lead + 运营 | QA | 首版返回占位/待补；只预留 AI provider；不得调用真实 AI 生图。 |
| `TASK-DISH-LIBRARY-OPS-001` | 后端 + 前端 | 运营 + Tech Lead | QA | 管理员鉴权；运营页面若新增，必须独立且不影响小程序既有样式。 |
| `TASK-DISH-LIBRARY-FRONTEND-001` | 前端 | 设计 + Tech Lead | QA | 编辑页只新增状态/数据，不改变封面区域视觉基线。 |
| `TASK-PLAN-DAY-HISTORY-001` | 后端 + 前端 | PM + Tech Lead | QA | 复刻写快照；历史数据 owner 隔离；页面复用现有日计划样式。 |
| `TASK-BASKET-SELECTIVE-SYNC-001` | 后端 + 前端 | Tech Lead | QA | 保留手动菜篮项；不改菜篮分组和勾选样式。 |
| `TASK-PLAN-RULE-BALANCE-001` | 后端 | PM + Tech Lead | QA | 规则必须覆盖用户习惯、三餐差异、营养均衡；不接 AI。 |
| `TASK-MONTH-PLAN-API-001` | 后端 | Tech Lead | QA | 日级计划为唯一事实；月计划只聚合或批量写日级事实。 |
| `TASK-MONTH-PLAN-FRONTEND-001` | 前端 | 设计 + Tech Lead | QA | 新增月历页可加新样式，但不得修改既有页面/组件样式；复用现有设计基线。 |
| `TASK-MONTH-PLAN-BULK-001` | 后端 + 前端 | PM + Tech Lead | QA | 批量清空/替换必须二次确认；最终写日级快照。 |
| `TASK-MONTH-PLAN-STATS-001` | 后端 + 前端 | PM + Tech Lead | QA | 统计只基于当前用户日级事实；不做复杂营养素精算。 |
| `TASK-MONTH-PLAN-TEMPLATE-001` | 后端 + 前端 | PM + Tech Lead | QA | 模板保存快照；应用模板必须有覆盖确认。 |
| `TASK-ACCOUNT-CANCEL-STATE-001` | 后端 | 法务 + Tech Lead | QA | 只做状态机和审计；不执行真实删除。 |
| `TASK-ACCOUNT-CANCEL-EXECUTE-001` | 后端 | 法务 + Tech Lead | QA | 必须 dry-run、备份、管理员二次确认；不可由客户端直接触发。 |
| `TASK-AGREEMENT-VERSION-001` | 后端 + 前端 | 法务 + PM | QA | 协议正文需法务确认；确认弹窗/页面不改变既有样式基线。 |
| `TASK-FULL-PRD-SMOKE-001` | QA | PM + Tech Lead | QA | 真实环境主链路；不得用 mock 冒充通过。 |
| `TASK-FULL-PRD-RELEASE-001` | Tech Lead + QA | PM + 法务 | QA | 发布前必须关闭真实环境、合规、回滚和样式保护门禁。 |

## 5. 每个任务卡必须补充的限制章节

Full PRD 任务卡除通用模板外，必须额外包含：

```text
## Full PRD 限制

- Provider 策略：
- 前端样式保护：
- 数据事实来源：
- 快照规则：
- 用户隔离：
- 不可做事项：
```

填写要求：

- `Provider 策略`：涉及生成能力时写明首版是否只允许 `rules`。
- `前端样式保护`：写明是否改既有 WXML/WXSS；默认不得改。
- `数据事实来源`：计划相关任务必须写明日级事实、周/月聚合关系。
- `快照规则`：计划、菜篮、模板、复刻必须写明快照策略。
- `用户隔离`：所有用户数据写入任务必须说明 owner 来源。
- `不可做事项`：列出本任务不能顺手实现的能力。

## 6. 执行流程

每个 Full PRD 任务按以下流程：

1. 读取 `AGENTS.md`。
2. 读取 `docs/harness/current-codebase-harness.md`。
3. 读取 `docs/harness/frontend-design-preservation.md`。
4. 读取 `docs/full-prd-scope-and-implementation-plan.md`。
5. 读取 `docs/tasks/full-prd-README.md` 和对应任务卡。
6. 读取 Context Map 指定 spec。
7. 确认验收标准和 Full PRD 限制。
8. 实现最小纵向切片。
9. 补测试和检查记录。
10. 自测并汇报。

## 7. 验收门禁

- 文档门禁：spec、API 契约、任务卡、验收清单同步。
- 规则门禁：首版生成能力只走 `provider=rules`。
- 样式门禁：既有前端样式未改；新增页面复用设计基线。
- 数据门禁：用户隔离、快照、日级事实源不破坏。
- 测试门禁：单元/接口/页面冒烟覆盖任务风险。
- 合规门禁：注销、协议、管理员能力必须有法务/权限确认。

## 8. Review 重点

Full PRD PR 除 MVP checklist 外，额外检查：

- 是否误接真实 AI 或模型密钥。
- 是否绕过 `provider=rules` 首版策略。
- 是否改动既有 WXSS/WXML 视觉结构。
- 是否把月计划做成和日计划冲突的第二事实源。
- 是否让模型或规则输出直接创建正式菜谱。
- 是否缺少用户习惯、三餐差异或营养均衡测试。
- 是否缺少注销 dry-run、审计或二次确认。
