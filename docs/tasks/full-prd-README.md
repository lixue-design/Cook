# Full PRD 任务队列

本文是 MVP 之后实现原始《菜谱小程序产品需求文档》剩余能力的任务队列。它不替代
`docs/tasks/README.md` 的 MVP 队列；MVP 验收仍按原队列和发布清单执行。

人员分工、RACI、每个任务的 owner/评审/QA 和限制见
[`docs/harness/full-prd-team-and-harness-plan.md`](../harness/full-prd-team-and-harness-plan.md)。
所有 Full PRD 任务必须遵守该文档中的前端样式硬门禁：**不得修改既有小程序页面和组件的样式基线。**

## 自动执行规则

当用户说「开始执行 Full PRD 下一个任务」或「继续剩余产品文档功能」时，Agent 按本文顺序选择第一个 `Todo` 任务。每个任务开工前必须：

```text
读取任务行 -> 建立或读取详细任务卡 -> 读取专项 spec -> 确认验收标准 -> 实现 -> 验证 -> 汇报
```

若任务只有本文队列行、尚无独立任务卡，开工第一步必须按 `docs/tasks/task-template.md` 生成对应任务卡。
任务卡必须补充 `Full PRD 限制` 章节，写明 provider 策略、前端样式保护、数据事实来源、快照规则、用户隔离和不可做事项。

## 状态定义

| 状态 | 含义 |
| --- | --- |
| `Done` | 已完成并有验证或替代证据。 |
| `Todo` | 可开始。 |
| `Blocked` | 依赖外部权限、产品/法务确认或环境。 |
| `Deferred` | 明确暂缓。 |

## 阶段 0：Full PRD Harness

| 顺序 | 状态 | 任务 ID | 标题 | 目标 |
| --- | --- | --- | --- | --- |
| 0.1 | Done | `TASK-FULL-PRD-HARNESS-001` | 全量 PRD 范围、spec 与队列 | 建立本文和专项 spec。 |
| 0.2 | Done | `TASK-FULL-PRD-CONTRACT-001` | Full PRD API 契约扩展 | 在 `docs/api/` 建立规则生成、月计划、注销自动化契约。 |
| 0.3 | Done | `TASK-FULL-PRD-QA-001` | Full PRD 验收清单 | 建立全量 PRD parity checklist 和冒烟模板。 |

## 阶段 1：规则生成引擎与 provider 抽象

| 顺序 | 状态 | 任务 ID | 标题 | 目标 |
| --- | --- | --- | --- | --- |
| 1.1 | Done | `TASK-GENERATION-RULES-001` | 规则生成引擎基座 | 建立 provider=`rules`，预留 provider=`ai`，统一超时、requestId、schema 校验。 |
| 1.2 | Done | `TASK-PLAN-PREFERENCES-001` | 用户饮食习惯模型 | 建立是否吃早餐、三餐偏好、忌口、主食、耗时和人数设置。 |
| 1.3 | Done | `TASK-RECIPE-GENERATION-JOBS-001` | 菜谱生成任务模型 | 建立 job 表、状态机、查询接口和用户隔离，首版只启用 rules。 |
| 1.4 | Done | `TASK-RECIPE-GENERATION-DRAFT-001` | 生成结果草稿回填 | 把 provider 输出映射到现有菜谱编辑草稿，不直接保存正式菜谱。 |

## 阶段 2：三种规则生成菜谱入口

| 顺序 | 状态 | 任务 ID | 标题 | 目标 |
| --- | --- | --- | --- | --- |
| 2.1 | Done | `TASK-RECIPE-GENERATION-LINK-001` | 链接规则生成菜谱 | URL 格式、来源提示、可解释解析、失败保留输入、回填草稿。 |
| 2.2 | Done | `TASK-RECIPE-GENERATION-IMAGE-001` | 图片规则生成菜谱 | 图片上传和用户补充信息，无法识别时明确提示，不伪装 AI 识别。 |
| 2.3 | Done | `TASK-RECIPE-GENERATION-TEXT-001` | 文字规则生成菜谱 | 文本描述按规则拆成结构化菜谱草稿。 |
| 2.4 | Done | `TASK-RECIPE-GENERATION-FRONTEND-001` | 前端入口启用 | 恢复新增弹窗三类入口，覆盖加载/失败/成功态。 |

## 阶段 3：规则菜品图库与运营

| 顺序 | 状态 | 任务 ID | 标题 | 目标 |
| --- | --- | --- | --- | --- |
| 3.1 | Done | `TASK-DISH-LIBRARY-STANDARDIZE-001` | 菜名标准化与同义词 | 建立可审计的标准菜名和同义词命中规则。 |
| 3.2 | Done | `TASK-DISH-LIBRARY-GENERATE-001` | 未命中生成接口预留 | 首版返回占位和运营待补状态，预留后续 AI 生图 provider。 |
| 3.3 | Done | `TASK-DISH-LIBRARY-OPS-001` | 图库运营能力 | 查看、替换、下线、重新生成图片和维护同义词。 |
| 3.4 | Done | `TASK-DISH-LIBRARY-FRONTEND-001` | 编辑页图库体验 | 自动匹配标签、生成中状态、手动图最高优先级。 |

## 阶段 4：日计划增强与月计划

| 顺序 | 状态 | 任务 ID | 标题 | 目标 |
| --- | --- | --- | --- | --- |
| 4.1 | Done | `TASK-PLAN-DAY-HISTORY-001` | 历史日计划与一键复刻 | 回溯历史餐单并复制到目标日期。 |
| 4.2 | Done | `TASK-BASKET-SELECTIVE-SYNC-001` | 指定菜品同步菜篮 | 日计划选择部分菜品食材同步到周菜篮。 |
| 4.3 | Done | `TASK-PLAN-RULE-BALANCE-001` | 三餐与营养均衡规则 | 将用户习惯、三餐差异、主食/蛋白质/蔬菜均衡接入计划生成。 |
| 4.4 | Done | `TASK-MONTH-PLAN-API-001` | 月计划聚合 API | 聚合当月计划、支持月份边界和用户隔离。 |
| 4.5 | Done | `TASK-MONTH-PLAN-FRONTEND-001` | 月历视图 | 月历展示每日三餐概览并进入日计划。 |
| 4.6 | Done | `TASK-MONTH-PLAN-BULK-001` | 月度批量操作 | 批量填充、清空、复用和全局替换，最终写入日级事实。 |
| 4.7 | Done | `TASK-MONTH-PLAN-STATS-001` | 月度复盘统计 | 菜品、食材和空缺日期统计。 |
| 4.8 | Done | `TASK-MONTH-PLAN-TEMPLATE-001` | 月度模板 | 保存优质月计划并应用到其他月份。 |

## 阶段 5：合规自动化

| 顺序 | 状态 | 任务 ID | 标题 | 目标 |
| --- | --- | --- | --- | --- |
| 5.1 | Done | `TASK-ACCOUNT-CANCEL-STATE-001` | 注销申请状态机 | submitted/reviewing/processing/completed 等状态和审计。 |
| 5.2 | Blocked | `TASK-ACCOUNT-CANCEL-EXECUTE-001` | 注销数据处理任务 | dry-run、删除/匿名化、幂等执行和失败重试。 |
| 5.3 | Done | `TASK-AGREEMENT-VERSION-001` | 协议版本强制确认 | 协议版本更新后下次登录或核心功能前重新确认。 |

## 阶段 6：全量 PRD 验收

| 顺序 | 状态 | 任务 ID | 标题 | 目标 |
| --- | --- | --- | --- | --- |
| 6.1 | Blocked | `TASK-FULL-PRD-SMOKE-001` | 全量主链路冒烟 | 覆盖规则生成、月计划、菜篮和注销。 |
| 6.2 | Done | `TASK-FULL-PRD-RELEASE-001` | 全量 PRD 发布清单 | 更新发布手册、回滚和成本/安全门禁。 |

## 决策阻塞项

- 是否恢复原 PRD 中带删除线的列表卡片「加计划」交互。
- 删除菜谱是否仍保留历史计划快照，还是按原 PRD 同步移出计划。默认保持快照。
- 首版不接 AI 模型；后续如切 AI provider，再确认模型 provider、内容安全服务、预算和调用配额。
- 是否需要独立运营后台工程，还是先在现有仓库内做最小运营页面。
