# TASK-DISH-LIBRARY-GENERATE-001 未命中生成接口预留

## 任务 ID

`TASK-DISH-LIBRARY-GENERATE-001`

## 背景

菜名标准化已具备可审计规则。Full PRD 要求图库未命中时保留后续生成能力，但首版不能接 AI 生图，必须返回占位和运营待补状态，不阻塞用户保存菜谱。

## 目标

提供 `POST /api/dish-images/generate` 预留接口：未命中菜名登记为 provisional 标准菜，返回 `pending_ops` 占位，不调用 AI。

## 范围

### 包含

- 新增 `createDishImageGenerationPlaceholder`。
- 新增本地 HTTP `POST /api/dish-images/generate`。
- `provider=rules` 时写入/复用 provisional 标准菜。
- 返回 `generationJobId=null`、`image.status=pending_ops`、`image.source=placeholder`。
- `provider=ai` 首版拒绝。
- 单元测试和 HTTP 测试覆盖。

### 不包含

- 不调用真实 AI 生图。
- 不创建 `dish_assets` 图片记录。
- 不实现运营后台。
- 不把占位图覆盖用户手动上传图。
- 不阻塞菜谱保存。

## 相关上下文

- 图库 spec：`docs/specs/ai-dish-library-full.md`
- 图库服务：`server/src/dish-image-library.ts`
- 本地 HTTP：`server/src/app.ts`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`

## 实现要求

- 未命中菜名必须先走标准化。
- 首版只允许 `provider=rules`。
- provisional 标准菜写入 `canonical_dishes`，并保留 evidence。
- 返回结构必须明确是运营待补，不伪装为已生成图片。
- 失败不能影响菜谱保存主链路。

## Full PRD 限制

- Provider 策略：首版只使用 `provider=rules`；`provider=ai` 返回不可用，不调用模型、不提交密钥。
- 前端样式保护：纯服务端/HTTP 任务，不改小程序页面、组件、WXML 或 WXSS。
- 数据事实来源：标准菜事实来源为 `canonical_dishes`；图片资产事实来源仍为 `dish_assets`，本任务不创建 ready 图片。
- 快照规则：本任务不写计划、菜篮、模板或复刻快照。
- 用户隔离：本任务写全局图库标准菜，不读取用户私有数据。
- 不可做事项：不得生成真实图片；不得覆盖手动图；不得新增运营后台；不得阻塞菜谱保存。

## 前端设计保护

纯服务端任务，不涉及页面改动。

- 是否改 WXML：不涉及
- 是否改 WXSS：不涉及
- 是否改组件结构：不涉及
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：不涉及
- 视觉回归范围：
  - 页面：不涉及
  - 弹窗：不涉及
  - 手势：不涉及
  - 空态/加载态/失败态：不涉及

## API/数据变更

- 新增 HTTP：`POST /api/dish-images/generate`
- 不新增 migration，复用 `canonical_dishes` 的 `PROVISIONAL` 状态。

## 验收标准

- [x] 未命中菜名可登记 provisional 标准菜。
- [x] 返回 `pending_ops` 占位状态。
- [x] `provider=ai` 首版拒绝且不查询数据库。
- [x] 不创建 ready 图片资产。
- [x] 不影响现有图片搜索接口。

## 测试要求

- [x] 单元测试：placeholder 写入、AI provider 拒绝。
- [x] HTTP 测试：`POST /api/dish-images/generate` 返回 pending_ops。
- [x] 页面冒烟：不涉及。
- [x] 回归范围：server build/unit。

## 风险

- 首版只登记运营待补，不会产生真实图片；后续 `TASK-DISH-LIBRARY-OPS-001` 需要提供处理入口。

## 完成汇报模板

```text
完成：
- 新增未命中占位生成接口
- provider=rules 返回运营待补，provider=ai 拒绝

验证：
- npm --prefix server run build
- npm --prefix server run test:unit

风险/后续：
- 后续补运营维护和图片替换能力
```
