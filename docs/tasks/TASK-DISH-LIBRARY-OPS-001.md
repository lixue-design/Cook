# TASK-DISH-LIBRARY-OPS-001

## 任务 ID

`TASK-DISH-LIBRARY-OPS-001`

## 背景

Full PRD 阶段 3 已有菜名标准化和未命中占位能力，但运营还不能查看、替换、下线图片或维护同义词。图库命中质量依赖可审计的运营闭环。

## 目标

提供最小后端运营 API，让管理员可以查看图库资产、替换或下线图片、把图片重新置为待补，并维护标准菜品同义词。

## 范围

### 包含

- 图库资产运营列表接口。
- 图片资产状态和存储元数据更新接口。
- 图片资产重新生成占位接口，首版只进入 `PENDING`/待补，不调用 AI。
- 标准菜品同义词创建接口。
- 管理员 token 鉴权和审计日志。

### 不包含

- 独立运营后台前端。
- 普通用户小程序页面入口。
- 真实 AI 生图、模型调用、内容安全自动审核。
- 菜谱、计划或菜篮数据写入。

## 相关上下文

- 模块 spec：`docs/specs/ai-dish-library-full.md`
- API：`docs/api/full-prd-api-contract.md`
- 页面：不涉及普通小程序页面
- 数据模型：`canonical_dishes`、`dish_aliases`、`dish_assets`、`admin_audit_logs`

## 实现要求

- 管理员接口必须要求服务端 `ADMIN_API_TOKEN`；未配置时接口不可用。
- 支持 `Authorization: Bearer <token>` 或 `x-admin-token`。
- 所有运营写操作必须记录 `admin_audit_logs`，包含 actor、action、entity、before/after、reason/requestId。
- 图片置为 `READY` 时必须具备 `storageKey`、`mimeType`、`width`、`height`。
- `isCurrent=true` 只能用于 `READY` 图片，并且同一标准菜品只能有一张当前图。
- 同义词创建必须使用规则标准化，不允许空菜名。

## Full PRD 限制

- Provider 策略：首版只允许 provider=`rules`；`regenerate` 仅置为运营待补，不接真实 AI，不生成模型任务，不提交密钥。
- 前端样式保护：本任务为后端接口，不修改小程序 WXML/WXSS、布局、交互手势、自定义 Tab、半屏弹窗或安全区适配。
- 数据事实来源：图库运营事实来自 `canonical_dishes`、`dish_aliases`、`dish_assets`、`admin_audit_logs`。
- 快照规则：不写入计划、菜篮、模板或复刻数据；不影响已有计划/菜篮中的菜谱快照。
- 用户隔离：普通用户不可访问运营 API；写接口必须通过管理员 token 鉴权并记录 actor。
- 不可做事项：不接 AI provider、不做运营前端、不让图库图覆盖用户手动图、不把运营能力混入普通小程序页面。

## 前端设计保护

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

- 新增 `ADMIN_API_TOKEN` 配置。
- 新增 `GET /api/admin/dish-images`。
- 新增 `PATCH /api/admin/dish-images/{id}`。
- 新增 `POST /api/admin/dish-images/{id}/regenerate`。
- 新增 `POST /api/admin/dish-aliases`。
- 复用已有数据库表，无新增迁移。

## 验收标准

- [x] 未配置或未携带管理员 token 时，运营 API 不可访问。
- [x] 管理员可查看图库资产列表并按状态或菜名筛选。
- [x] 管理员可替换图片元数据、更新状态、下线图片。
- [x] 管理员可将图片重新置为 `PENDING`，且不调用 AI provider。
- [x] 管理员可为标准菜品创建同义词，且写入审计日志。
- [x] 普通小程序页面样式、布局和交互未变更。

## 测试要求

- [x] 单元测试：图库运营服务函数校验、更新、审计。
- [x] 接口测试：admin token、列表、更新、重新待补、同义词。
- [x] 页面冒烟：不涉及。
- [x] 回归范围：`server` build 和 unit test。

## 风险

- 首版没有运营前端，只提供后端能力，实际运营仍需通过脚本或 API 调用。
- 未接真实 AI，`regenerate` 只代表待补/待运营，不会自动产出图片。

## 完成汇报模板

```text
完成：
- ...

验证：
- ...

风险/后续：
- ...
```
