# TASK-FULL-PRD-CONTRACT-001 Full PRD API 契约扩展

## 任务 ID

`TASK-FULL-PRD-CONTRACT-001`

## 背景

Full PRD 阶段将新增 AI 菜谱生成、AI 菜品图库、月计划、选择性同步菜篮和注销自动化等能力。现有 `docs/api/mvp-api-contract.md` 只覆盖 MVP 主线，继续实现前需要建立新的 API 契约。

## 目标

建立 Full PRD API 契约，明确 REST 语义、Cloud Function action、入参、出参、错误态和鉴权要求。

## 范围

### 包含

- 规则优先的菜谱生成任务 API。
- AI 菜品图库和运营 API。
- 日计划历史复刻、选择性同步菜篮 API。
- 月计划、月度统计、月度模板 API。
- 注销自动化和协议版本 API。
- 通用响应、错误 code 和鉴权约束。

### 不包含

- 不实现接口代码。
- 不修改数据库。
- 不替代 MVP API 契约。

## 相关上下文

- `docs/full-prd-scope-and-implementation-plan.md`
- `docs/specs/ai-recipe-generation.md`
- `docs/specs/ai-dish-library-full.md`
- `docs/specs/plan-advanced.md`
- `docs/specs/account-cancel-automation.md`
- `docs/api/mvp-api-contract.md`

## 实现要求

- 契约必须兼容当前 Cloud Function `action + payload` 模式。
- 所有写接口必须说明鉴权和用户隔离。
- 生成接口必须说明 provider=`rules` 首版策略、内容安全、超时和错误 code。
- 注销执行接口必须区分用户侧和管理员侧。

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

新增文档契约：`docs/api/full-prd-api-contract.md`。

## 验收标准

- [x] 契约覆盖 AI 菜谱生成。
- [x] 契约覆盖 AI 菜品图库和运营。
- [x] 契约覆盖日计划增强和月计划。
- [x] 契约覆盖注销自动化和协议版本。
- [x] 契约包含通用错误 code 和鉴权说明。

## 测试要求

- [x] 文档检查：契约文件存在。
- [x] 文档检查：Full PRD 队列可指向本任务。

## 风险

- 真实模型 provider、管理后台鉴权和注销执行权限仍需后续任务细化。

## 完成汇报模板

```text
完成：
- 建立 Full PRD API 契约

验证：
- 检查契约覆盖 AI、月计划、注销自动化

风险/后续：
- 后续实现时按模块拆分接口和 migration
```
