# TASK-DISH-LIBRARY-FRONTEND-001

## 任务 ID

`TASK-DISH-LIBRARY-FRONTEND-001`

## 背景

Full PRD 图库后端已提供菜名标准化、图库命中和未命中运营待补能力。菜谱编辑页已有图片匹配提示和手动封面选择，需要在不改既有设计的前提下接入更完整的图库状态。

## 目标

让菜谱编辑页在输入菜名时自动匹配标准图库图，未命中时进入运营待补提示，并确保用户手动封面始终最高优先级。

## 范围

### 包含

- 在 `services/dish-image-api.js` 中补充图库占位/待补接口调用。
- 复用菜谱编辑页现有图片提示区域展示匹配、待补、失败状态。
- 保持手动选择封面不被图库匹配或待补结果覆盖。
- 增加客户端 service 验证脚本。

### 不包含

- 新增运营后台或普通用户图库页面。
- 改造菜谱编辑页布局、样式、半屏弹窗或自定义 Tab。
- 接入真实 AI 生图、图片识别或模型密钥。
- 自动把用户手动封面写入全局图库。

## 相关上下文

- 模块 spec：`docs/specs/ai-dish-library-full.md`
- API：`docs/api/full-prd-api-contract.md`
- 页面：`pages/recipe-create/index`
- 数据模型：`dish_assets`、`canonical_dishes`、`dish_aliases`，前端只读匹配结果或创建 rules 占位

## 实现要求

- 输入菜名后仍走防抖匹配，命中 `READY` 图才自动设置 `form.coverUrl`。
- 未命中时调用 `POST /api/dish-images/generate`，仅使用 `provider=rules`，展示运营待补/生成中状态。
- 匹配或待补失败不得阻塞用户保存菜谱。
- `coverSource === 'manual'` 时不得覆盖 `form.coverUrl`。
- 不新增 WXML/WXSS，优先复用现有 `imageSearchHint` 和 `imageSearchState`。

## Full PRD 限制

- Provider 策略：首版只使用 provider=`rules`；仅预留 provider=`ai`，不调用真实 AI，不提交模型密钥。
- 前端样式保护：不改 WXML/WXSS、布局结构、交互手势、自定义 Tab、半屏弹窗或安全区适配。
- 数据事实来源：图库匹配结果来自后端 `/api/dish-images/search`；未命中待补来自 `/api/dish-images/generate` 的 rules 占位。
- 快照规则：不写计划、菜篮、模板或复刻数据；保存菜谱时仍由菜谱服务决定封面模式，计划/菜篮继续使用菜谱快照。
- 用户隔离：前端不传用户 ID；普通用户不访问 admin API；待补接口不接收管理员 token。
- 不可做事项：不接 AI provider、不覆盖手动封面、不把生成结果直接保存为正式菜谱图、不新增运营入口。

## 前端设计保护

- 是否改 WXML：否
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：菜谱创建/编辑页
  - 弹窗：图片选择 action sheet 不变
  - 手势：不涉及
  - 空态/加载态/失败态：图片匹配等待、加载、命中、待补、失败提示

## API/数据变更

- 小程序 service 新增 `requestDishImageGenerationPlaceholder(dishName)`。
- 不新增后端接口，不新增数据库迁移。

## 验收标准

- [x] 输入菜名命中图库时，自动设置图库封面并展示匹配提示。
- [x] 输入菜名未命中时，调用 rules 占位接口并展示待补/生成中提示。
- [x] 手动选择封面后，再次匹配或待补不覆盖手动封面。
- [x] 图库接口失败时提示可继续无图保存。
- [x] 不修改菜谱编辑页 WXML/WXSS 和组件结构。

## 测试要求

- [x] 单元/脚本测试：图库客户端 service 搜索、占位、绝对 URL、错误态。
- [x] 接口测试：复用后端 `dishImages.generate`/search 单测结果。
- [x] 页面冒烟：代码级检查覆盖图片提示状态；真机/开发者工具不在本地环境执行。
- [x] 回归范围：客户端验证脚本和 server 单测。

## 风险

- 首版待补状态不会自动产出图片；用户需要继续手动图或无图保存。
- 本地无法完成微信开发者工具视觉冒烟，需后续真实环境补测。

## 完成汇报模板

```text
完成：
- ...

验证：
- ...

风险/后续：
- ...
```
