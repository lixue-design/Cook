# TASK-FULL-PRD-HARNESS-001 全量 PRD 范围、spec 与队列

## 任务 ID

`TASK-FULL-PRD-HARNESS-001`

## 背景

MVP 功能实现已基本收口，用户要求继续实现原始《菜谱小程序产品需求文档》中的剩余能力，并继续采用 Harness Engineering 的方式先规划、再执行。剩余能力包含 AI 菜谱生成、AI 菜品图库、月计划、日计划历史复刻、注销自动化等，不能直接混入 MVP 队列。

## 目标

建立 Full PRD 阶段的范围规划、专项 spec、任务队列和上下文映射，让后续实现可以按任务卡顺序推进。

## 范围

### 包含

- 梳理原始 PRD 剩余能力和当前 MVP 差距。
- 新增 Full PRD 范围与实现规划。
- 新增 AI 菜谱生成 spec。
- 新增 AI 菜品图库全量 spec。
- 新增计划增强与月计划 spec。
- 新增账号注销自动化 spec。
- 新增 Full PRD 任务队列。
- 更新 Context Map 和 MVP 任务索引入口。

### 不包含

- 不实现具体业务代码。
- 不接入真实 AI 模型或外部平台。
- 不修改小程序页面。
- 不改变当前 MVP 任务状态。

## 相关上下文

- 原始 PRD：豆包 AI 文档《菜谱小程序产品需求文档》，document id `VvA5dgzbCoPh47xUkphctz7vnbe`，revision `2054`。
- MVP 范围：`docs/mvp-scope-and-implementation-breakdown.md`
- 当前任务队列：`docs/tasks/README.md`
- Context Map：`docs/harness/context-map.md`

## 实现要求

- Full PRD 和 MVP 队列分离。
- 对 PRD 中和当前快照模型冲突的条款提出决策项。
- 任务队列必须有明确顺序、状态和阶段。
- 每类复杂能力必须有专项 spec。
- 后续任务开工前必须创建或读取详细任务卡。

## 前端设计保护

本任务不涉及页面代码改动。

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

不涉及代码层 API 或数据库变更，仅提出后续契约建议。

## 验收标准

- [x] 新增 Full PRD 范围规划。
- [x] 新增 AI 菜谱生成 spec。
- [x] 新增 AI 菜品图库全量 spec。
- [x] 新增计划增强与月计划 spec。
- [x] 新增账号注销自动化 spec。
- [x] 新增 Full PRD 任务队列。
- [x] Context Map 可路由新任务类型。
- [x] MVP 任务索引能指向 Full PRD 队列。

## 测试要求

- [x] 文档检查：新文档路径存在。
- [x] 文档检查：MVP 队列未被改为 Full PRD 队列。
- [x] 回归范围：不涉及业务代码运行。

## 风险

- 原始 PRD 中部分能力有删除线或与现有快照模型冲突，后续实现前需要产品确认。
- AI 能力依赖模型 provider、内容安全和成本预算，可能成为外部阻塞。
- 月计划和注销自动化涉及数据模型扩展，必须先做契约和迁移验证。

## 完成汇报模板

```text
完成：
- 建立 Full PRD 规划、专项 spec 和任务队列

验证：
- 检查新文档和任务索引

风险/后续：
- 从 TASK-FULL-PRD-CONTRACT-001 开始补 API 契约
```
