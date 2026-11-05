# TASK-VERIFICATION-HARNESS-001 验证资产与缺陷模板补齐

## 任务 ID

`TASK-VERIFICATION-HARNESS-001`

## 背景

`docs/harness/team-and-harness-plan.md` 的 P1 Harness 资产要求补齐数据库 migration 验证清单、小程序手动冒烟脚本和缺陷模板。现有任务队列已经覆盖最终 MVP 验收和发布清单，但还需要把这些验证资产模板化，方便每个后续任务按统一格式记录结果。

## 目标

补齐 Verification Harness 的基础模板，让 migration、页面冒烟和缺陷记录有统一入口。

## 范围

### 包含

- 建立或更新数据库 migration 验证清单。
- 建立或更新小程序手动冒烟记录模板。
- 建立缺陷记录模板，至少包含复现步骤、期望、实际、影响范围、环境、证据和优先级。
- 在相关 harness 文档或任务索引中说明这些模板的使用时机。
- 明确无法在 Codex 沙箱中执行的验证如何记录替代检查。

### 不包含

- 不直接执行全量 MVP 验收。
- 不修复具体缺陷。
- 不操作生产数据库或真实用户数据。
- 不替代 `TASK-QA-MVP-001` 的最终验收。

## 相关上下文

- Harness 落地规划：`docs/harness/team-and-harness-plan.md`
- 本地验证：`docs/harness/local-development-and-verification.md`
- Agent 指南：`docs/harness/agent-operating-guide.md`
- MVP 验收：`docs/checklists/mvp-acceptance.md`
- PR checklist：`docs/reviews/pr-review-checklist.md`

## 实现要求

- 模板必须能被 Agent 和人类研发直接复制使用。
- migration 验证清单必须覆盖 up、down 或等价 SQL 检查，以及无法运行时的替代说明。
- 冒烟记录模板必须覆盖页面、入口、前置数据、操作步骤、期望、实际和证据。
- 缺陷模板必须能关联任务 ID、模块、严重级别和阻塞状态。
- 不在模板中要求填写密钥、真实用户隐私或生产连接串。

## 前端设计保护

不涉及页面改动。

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

不涉及。

## 验收标准

- [x] 有 migration 验证清单或模板。
- [x] 有小程序手动冒烟记录模板。
- [x] 有缺陷记录模板。
- [x] 模板说明了无法运行测试时的替代检查写法。
- [x] 相关 harness 文档或任务索引能指向这些模板。

## 测试要求

- [x] 文档检查：模板字段覆盖 P1 Harness 资产要求。
- [x] 文档检查：模板不要求记录密钥、token、真实用户隐私或生产连接串。
- [x] 回归范围：不涉及代码运行。

## 风险

- 模板本身不能保证质量，后续每个任务仍必须真实执行或诚实记录无法执行的验证。

## 完成汇报模板

```text
完成：
- 补齐 migration、冒烟和缺陷记录模板

验证：
- 对照 Harness P1 资产要求检查字段

风险/后续：
- 说明模板使用中仍需人工确认的部分
```
