# TASK-AI-DISH-001 AI 图片库边界隔离与专项文档

## 任务 ID

`TASK-AI-DISH-001`

## 背景

当前代码库已有 AI 菜品图片库、图片搜索和生成兜底相关实现，但 MVP 默认不做 AI 链接生成、图片识别生成、文字生成、AI 菜品图库运营等增强能力。`context-map.md` 引用了 `docs/ai-dish-library/`，但当前该目录不存在。需要明确 AI 图片库在 MVP 中的边界，避免增强能力混入主链路。

## 目标

建立 AI 图片库专项边界文档，并把现有 AI 相关能力隔离为非 MVP 主线或明确的图片匹配扩展点。

## 范围

### 包含

- 新增 `docs/ai-dish-library/README.md` 或等价专项文档。
- 梳理当前 AI 图片库相关代码：
  - `server/src/dish-image-library.ts`
  - `server/src/ark-dish-image-generator.ts`
  - `services/dish-image-api.js`
  - `storage/dish-images/`
  - 相关 migrations/tests。
- 明确 MVP 中允许保留的能力：菜名图片匹配提示或封面辅助。
- 明确 MVP 中不进入主链路的能力：AI 生成菜谱、图片识别菜谱、文字生成菜谱、运营后台。
- 标记页面中 AI 文案入口的处理策略：置灰、提示即将上线或隐藏。

### 不包含

- 不新增 AI 调用能力。
- 不接生产模型密钥。
- 不实现运营后台。
- 不修改 MVP 主链路业务规则。

## 相关上下文

- AGENTS：`AGENTS.md`
- 当前代码库：`docs/harness/current-codebase-harness.md`
- Context Map：`docs/harness/context-map.md`
- MVP 范围：`docs/mvp-scope-and-implementation-breakdown.md`
- 前端页面：`pages/recipe-create/index`、`components/plan-action-sheet/index`
- 后端：`server/src/dish-image-library.ts`、`server/src/ark-dish-image-generator.ts`

## 实现要求

- 文档必须说明 AI 图片库不是 MVP 必需闭环。
- 若保留图片匹配体验，需说明失败时可无图保存。
- 所有模型密钥仅允许服务端环境变量，不得提交。
- 任务卡和 review checklist 中能识别 AI 相关改动是否越界。

## 前端设计保护

主要是文档和边界任务；如调整 AI 入口文案，需保留既有设计。

- 是否改 WXML：可选，限 AI 入口文案/显隐
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：不涉及
- 视觉回归范围：
  - 页面：菜谱创建、计划新增方式弹窗
  - 弹窗：新增菜谱、计划新增方式
  - 手势：不涉及
  - 空态/加载态/失败态：图片匹配失败、AI 未上线提示

## API/数据变更

无必需 API 变更；如新增专项文档后需要更新 `context-map.md` 链接，需同步修改。

## 验收标准

- [ ] `docs/ai-dish-library/README.md` 或等价文档存在。
- [ ] 文档列出现有 AI 图片库代码和当前状态。
- [ ] 文档明确 MVP 允许和禁止的 AI 能力。
- [ ] 页面 AI 入口不会误导用户以为 MVP 已支持 AI 生成菜谱。
- [ ] 文档不包含真实模型密钥。

## 测试要求

- [ ] 单元测试：不涉及，除非调整 AI 图片库代码。
- [ ] 接口测试：不涉及，除非调整图片搜索接口。
- [ ] 页面冒烟：如改文案/显隐，检查菜谱创建和计划新增弹窗。
- [ ] 回归范围：AI 入口不影响手动创建菜谱主流程。

## 风险

- 现有代码命名中有 AI 图库历史痕迹，容易让任务范围误判。
- 若产品决定图片匹配也不进 MVP，需要另起任务隐藏入口。

## 完成汇报模板

```text
完成：
- 建立 AI 图片库专项边界文档
- 明确 MVP 允许/禁止能力

验证：
- 检查文档路径和引用
- 如改页面，完成入口冒烟

风险/后续：
- 说明仍需产品确认的 AI 入口策略
```
