# TASK-DISH-LIBRARY-STANDARDIZE-001 菜名标准化与同义词

## 任务 ID

`TASK-DISH-LIBRARY-STANDARDIZE-001`

## 背景

Full PRD 菜品图库需要把用户输入菜名归一到标准菜品，支持番茄炒蛋/西红柿炒鸡蛋等同义词命中同一标准图。当前数据库已有 `canonical_dishes` 和 `dish_aliases`，但服务端缺少可复用、可审计的标准化函数。

## 目标

建立菜名清洗、同义词表命中、标准菜名命中和内置规则兜底的标准化基座。

## 范围

### 包含

- 新增 `normalizeDishName`。
- 新增 `standardizeDishName`。
- 命中顺序：`dish_aliases` -> `canonical_dishes` -> 内置同义词规则 -> normalized miss。
- 返回 `matchType`、`canonicalDishId`、`matchedAlias` 和 `evidence`，便于审计。
- 单元测试覆盖清洗、同义词命中、标准名命中、规则兜底和未命中。

### 不包含

- 不新增数据库表。
- 不实现运营后台或同义词维护接口。
- 不创建未命中待补记录。
- 不调用 AI 生图 provider。
- 不改变用户手动封面优先级。

## 相关上下文

- Full PRD 图库 spec：`docs/specs/ai-dish-library-full.md`
- 当前图库代码：`server/src/dish-image-library.ts`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 当前代码库 Harness：`docs/harness/current-codebase-harness.md`

## 实现要求

- 标准化必须是可解释规则，不依赖模型。
- 同义词表命中优先于内置规则。
- 返回 evidence，说明命中来源。
- 未命中不得阻塞菜谱保存或图片匹配流程。
- 不改变现有 `searchDishImages` 输出契约。

## Full PRD 限制

- Provider 策略：本任务不涉及生成 provider；不得调用 AI 生图。
- 前端样式保护：纯服务端规则函数，不改小程序页面、组件、WXML 或 WXSS。
- 数据事实来源：标准菜品和同义词事实来源为 `canonical_dishes` / `dish_aliases`；内置规则仅作首版兜底 evidence。
- 快照规则：本任务不写计划、菜篮、模板或复刻数据。
- 用户隔离：标准图库为全局数据；不读取或写入用户私有菜谱数据。
- 不可做事项：不得新增运营后台；不得自动覆盖用户手动图；不得调用真实 AI；不得让未命中阻塞保存。

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

- 不新增 action。
- 不新增 migration。
- 新增服务端内部函数：
  - `normalizeDishName(value)`
  - `standardizeDishName(executor, rawName)`

## 验收标准

- [x] 菜名清洗能去除空格和常见标点。
- [x] `dish_aliases` 命中可返回标准菜名和 canonical id。
- [x] 标准菜名可直接命中。
- [x] 内置同义词可作为首版兜底。
- [x] 未命中返回 normalized evidence，不阻塞流程。

## 测试要求

- [x] 单元测试：清洗、同义词命中、标准名命中、内置规则、未命中。
- [x] 接口测试：不新增 action，不涉及。
- [x] 页面冒烟：不涉及。
- [x] 回归范围：server build/unit。

## 风险

- 内置同义词覆盖面有限，后续 `TASK-DISH-LIBRARY-OPS-001` 需要提供运营维护能力。
- 本任务没有创建未命中待补记录，留给 `TASK-DISH-LIBRARY-GENERATE-001`。

## 完成汇报模板

```text
完成：
- 建立菜名标准化和同义词命中规则
- 补充 evidence 和单元测试

验证：
- npm --prefix server run build
- npm --prefix server run test:unit

风险/后续：
- 后续补未命中待补和运营维护
```
