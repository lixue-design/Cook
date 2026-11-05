# TASK-API-CONTRACT-001 MVP API 契约初版

## 任务 ID

`TASK-API-CONTRACT-001`

## 背景

当前 `docs/api/status-matrix.md` 已记录 mock、remote、server implemented 和 missing 状态，但还不是可直接联调和审查的正式契约。MVP 需要统一 action/REST 语义、入参、出参、错误态和鉴权说明，避免前后端真实化时反复猜字段。

## 目标

产出 MVP API 契约初版，覆盖菜谱、分类、上传、计划、菜篮、登录、协议和注销申请。

## 范围

### 包含

- 为当前 Cloud Function action 模式建立契约文档，必要时映射到 MVP REST 语义。
- 每个接口写清楚入参、出参、错误态和鉴权要求。
- 标明用户隔离字段或服务端可信身份来源。
- 更新 `docs/api/status-matrix.md` 或新增正式契约文档。
- 标出尚未实现但后续任务需要实现的接口。

### 不包含

- 不强制把现有 action 模式迁移为 REST。
- 不生成正式 SDK，除非团队另行确认。
- 不实现接口代码。

## 相关上下文

- API 状态矩阵：`docs/api/status-matrix.md`
- MVP 范围：`docs/mvp-scope-and-implementation-breakdown.md`
- 工程方案：`docs/engineering-framework-and-team-plan.md`
- 菜谱 spec：`docs/specs/recipe.md`
- 计划 spec：`docs/specs/plan.md`
- 菜篮 spec：`docs/specs/basket.md`
- 后端：`server/src/`

## 实现要求

- 契约必须覆盖：
  - 菜谱分类。
  - 菜谱 CRUD。
  - 图片上传。
  - 日计划和周计划。
  - 菜篮同步和菜篮项维护。
  - 登录、当前用户、退出登录。
  - 协议、隐私、注销申请。
- 写接口必须明确鉴权和错误返回。
- 对于当前仍缺失的接口，必须标明依赖任务 ID。
- 契约中的字段名要说明服务端字段和小程序页面字段的映射关系。

## 前端设计保护

不涉及页面改动。

- 是否改 WXML：不涉及
- 是否改 WXSS：不涉及
- 是否改组件结构：不涉及
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：不涉及
  - 弹窗：不涉及
  - 手势：不涉及
  - 空态/加载态/失败态：不涉及

## API/数据变更

- 文档层面新增或完善 API 契约。
- 若发现 spec 与现有 action 不一致，只记录差异，不直接改代码。

## 验收标准

- [x] 契约覆盖 MVP 所有 API 语义。
- [x] 每个写接口都有鉴权和错误态说明。
- [x] 每个用户数据接口都有用户隔离说明。
- [x] 缺失接口标注后续任务 ID。
- [x] 小程序页面字段契约与服务端字段映射被记录。

## 测试要求

- [x] 文档检查：契约与 `docs/api/status-matrix.md` 不矛盾。
- [x] 文档检查：契约覆盖 `docs/checklists/mvp-acceptance.md` 的数据能力。
- [x] 回归范围：不涉及代码运行。

## 风险

- 如果后续决定从 Cloud Function action 切到 REST/OpenAPI，需要再开迁移任务。

## 完成汇报模板

```text
完成：
- 建立 MVP API 契约初版
- 标注缺失接口和依赖任务

验证：
- 对照状态矩阵、spec 和 MVP 验收清单检查覆盖

风险/后续：
- 说明是否需要正式 OpenAPI 或 SDK 生成
```
