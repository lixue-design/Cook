# MVP 全量任务卡索引

本文是 Codex/Agent 自动执行 MVP 的任务队列。每个开发任务开工前必须读取对应任务卡、`AGENTS.md`、`docs/harness/current-codebase-harness.md` 和 Context Map 中指定的模块 spec。

MVP 之后的原始 PRD 剩余能力不在本文队列中执行，统一进入
[`docs/tasks/full-prd-README.md`](full-prd-README.md)。Full PRD 任务必须先完成专项 spec、API
契约和验收门禁，再进入代码实现。

## 自动执行规则

当用户说「开始执行下一个 harness 任务」或「按规划继续」时，Agent 按本文顺序选择第一个未完成、未阻塞任务执行。

执行每个任务时必须遵守：

```text
读取任务卡 -> 读取相关 spec -> 确认验收标准 -> 实现 -> 补测试/检查 -> 自测 -> 汇报结果
```

如果任务卡、spec、验收清单和当前代码冲突，先指出冲突并选择最小安全修正；不要擅自扩展 MVP 范围。

## 状态标记

任务状态在本文维护：

| 状态 | 含义 |
| --- | --- |
| `Todo` | 尚未开始，可被自动选择。 |
| `Doing` | 正在进行，同一时间只应有一个。 |
| `Done` | 已完成并通过任务卡要求的验证或替代检查。 |
| `Blocked` | 连续确认无法推进，需要用户或外部环境处理。 |
| `Deferred` | 明确不进入 MVP 主链路，但需要边界文档或后续专项。 |

完成任务后，Agent 应把对应状态更新为 `Done`；如果无法更新状态，必须在完成汇报里说明。

## 全量 MVP 任务队列

| 顺序 | 状态 | 任务 ID | 标题 | 阶段 | 目标 |
| --- | --- | --- | --- | --- | --- |
| 0.1 | Done | `TASK-HARNESS-001` | 本地启动与验证说明 | Harness 对齐 | 让本地启动、测试和已知环境问题可复现。 |
| 0.2 | Done | `TASK-HARNESS-002` | API 契约索引与真实化状态矩阵 | Harness 对齐 | 标记 mock、remote、server implemented、missing 状态。 |
| 0.3 | Done | `TASK-HARNESS-003` | 全量任务队列与自动执行规则 | Harness 对齐 | 让 Codex 能持续选择下一个任务直到 MVP 闭环。 |
| 0.4 | Done | `TASK-VERIFICATION-HARNESS-001` | 验证资产与缺陷模板补齐 | Harness 对齐 | 补齐 migration 验证清单、冒烟记录模板和缺陷模板。 |
| 0.5 | Done | `TASK-API-CONTRACT-001` | MVP API 契约初版 | Harness 对齐 | 把 action/REST 语义、入参、出参、错误态和鉴权约束统一成可联调契约。 |
| 0.6 | Done | `TASK-AI-DISH-001` | AI 图片库边界隔离与专项文档 | 范围治理 | 防止 AI 能力混入 MVP 主线。 |
| 1.1 | Done | `TASK-RECIPE-REMOTE-001` | 菜谱 Remote 开关与环境配置 | 菜谱真实化 | 明确菜谱 mock/remote 切换。 |
| 1.2 | Done | `TASK-RECIPE-REMOTE-002` | 菜谱主流程接真实 API | 菜谱真实化 | 菜谱列表、详情、新建、编辑、删除真实化。 |
| 1.3 | Done | `TASK-CATEGORY-REMOTE-001` | 分类管理接真实 API | 菜谱真实化 | 分类增删改排真实化。 |
| 1.4 | Done | `TASK-UPLOAD-001` | 菜谱图片上传与压缩兜底 | 菜谱真实化 | 封面和步骤图上传、大小限制、失败兜底可验收。 |
| 1.5 | Done | `TASK-RECIPE-DRAFT-001` | 新建编辑草稿与表单校验硬化 | 菜谱体验硬化 | 保存失败或退出重进不丢关键输入。 |
| 2.1 | Done | `TASK-PLAN-API-001` | 日计划数据模型与接口 | 计划真实化 | 建立日计划和计划菜谱快照。 |
| 2.2 | Done | `TASK-PLAN-WEEK-001` | 周计划生成规则与 warnings | 计划真实化 | 服务端生成周计划并返回 warnings。 |
| 2.3 | Done | `TASK-PLAN-FRONTEND-001` | 计划页接真实 API | 计划真实化 | 保留现有计划页设计并替换数据层。 |
| 3.1 | Done | `TASK-BASKET-API-001` | 周菜篮数据模型与接口 | 菜篮真实化 | 建立周菜篮持久化接口。 |
| 3.2 | Done | `TASK-BASKET-MERGE-001` | 服务端食材合并规则 | 菜篮真实化 | 实现同名同单位数字用量合并规则。 |
| 3.3 | Done | `TASK-BASKET-FRONTEND-001` | 菜篮页接真实 API | 菜篮真实化 | 替换 globalData/local 状态，保留菜篮交互。 |
| 3.4 | Done | `TASK-BASKET-DETAIL-001` | 菜谱详情直加菜篮真实化 | 菜篮真实化 | 修复详情页仍写 globalData、真实菜篮不可见的闭环缺口。 |
| 4.1 | Done | `TASK-AUTH-001` | 微信登录与用户态接入 | 登录与合规 | 建立登录态、未登录引导和退出登录。 |
| 4.2 | Done | `TASK-COMPLIANCE-001` | 我的页、协议、隐私与注销入口 | 登录与合规 | 补齐提审基础合规能力。 |
| 5.1 | Done | `TASK-APP-HARDENING-001` | 全局空态错误态与未登录态回归 | 体验硬化 | 核心页面加载、空、失败、未登录状态一致可验收。 |
| 5.2 | Done | `TASK-OBSERVABILITY-001` | 基础日志与错误可诊断性 | 体验硬化 | 接口错误、关键操作和提测问题有最小诊断信息。 |
| 5.3 | Done | `TASK-SECURITY-RPC-001` | 后续 RPC search_path 加固 | 安全硬化 | 覆盖 0007–0013 新增 SECURITY DEFINER RPC。 |
| 6.1 | Blocked | `TASK-QA-MVP-001` | MVP 全链路验收与冒烟脚本 | 提测验收 | 本地数据库、服务和自动测试已通过；IDE automator 异常且无 macOS UI 权限，页面冒烟待人工。 |
| 6.2 | Done | `TASK-RELEASE-001` | 小程序提审前发布清单与运行手册 | 提审准备 | 发布门禁与运行手册已建立；真实发布保持 Blocked，外部检查项已列明。 |

## 自动执行优先级说明

- 默认严格按「全量 MVP 任务队列」顺序执行。
- 若某任务依赖外部环境阻塞，例如微信开发者工具、CloudBase、数据库或 PM/法务文案，可标记 `Blocked` 并继续下一个不依赖该阻塞条件的任务。
- `TASK-AI-DISH-001` 是范围治理任务，不代表 AI 进入 MVP 主线；它应尽早完成，避免后续实现误把 AI 生成能力当作必做。
- 任何新增任务必须先写任务卡，再插入本文队列，不允许只口头追加。

## MVP 完成定义

只有当以下条件全部满足，才认为「整体完整跑完」：

- 全量任务队列中 MVP 主链路任务均为 `Done`，非 MVP 专项为 `Done` 或 `Deferred` 且边界清晰。
- `docs/checklists/mvp-acceptance.md` 的登录、菜谱、计划、菜篮、错误态、安全项均完成或有明确风险说明。
- `docs/reviews/pr-review-checklist.md` 没有 P0/P1 阻断项。
- 小程序提审前冒烟路径完成：

```text
登录
-> 新建菜谱
-> 查看详情
-> 编辑菜谱
-> 生成周计划
-> 添加/移除某日餐段菜谱
-> 同步菜篮
-> 勾选采购项
-> 查看协议
-> 退出登录
```
