# Cook Project Agent Guide

本文件定义本仓库中人类研发、Codex/Agent、代码审查者共同遵守的工程约束。任何实现任务都应优先遵循这里的规则，再参考具体模块 spec。

## 1. 项目目标

当前阶段目标是完成菜谱小程序 MVP：

- 菜谱分类、菜谱列表、菜谱详情、新建/编辑/删除。
- 日计划、周计划生成、计划手动调整。
- 周菜篮同步、食材合并、勾选采购、手动维护。
- 微信登录、我的页、协议页、注销申请入口。

MVP 以真实用户闭环为优先，不追求一次性完成 AI、运营后台、月计划等增强能力。

## 2. 权威上下文

实现前按任务读取最小必要文档：

- MVP 范围：[docs/mvp-scope-and-implementation-breakdown.md](docs/mvp-scope-and-implementation-breakdown.md)
- 工程方案：[docs/engineering-framework-and-team-plan.md](docs/engineering-framework-and-team-plan.md)
- Harness 总览：[docs/harness/README.md](docs/harness/README.md)
- 当前代码库 Harness：[docs/harness/current-codebase-harness.md](docs/harness/current-codebase-harness.md)
- 前端设计保护 Harness：[docs/harness/frontend-design-preservation.md](docs/harness/frontend-design-preservation.md)
- Agent 操作指南：[docs/harness/agent-operating-guide.md](docs/harness/agent-operating-guide.md)
- 菜谱模块 spec：[docs/specs/recipe.md](docs/specs/recipe.md)
- 计划模块 spec：[docs/specs/plan.md](docs/specs/plan.md)
- 菜篮模块 spec：[docs/specs/basket.md](docs/specs/basket.md)

如果实现 AI 菜品图库相关能力，再读取 `docs/ai-dish-library/` 下的专项文档。

## 3. MVP 边界

### 必须守住

- 计划和菜篮必须使用菜谱快照，不能让菜谱编辑污染历史计划和已生成菜篮。
- 食材合并只合并同名同单位且数字用量可解析的项。
- 前端可以做体验校验，但服务端必须做最终校验。
- 微信登录、协议、隐私政策、注销入口属于提审必备能力。
- 所有用户数据必须带用户隔离字段或等价鉴权逻辑。
- 前端实现必须和现有小程序设计一致；接真实 API 时优先改 `services/` 和数据映射，不重写页面。

### 默认不做

- AI 链接生成菜谱。
- AI 图片识别生成菜谱。
- 文字生成菜谱。
- 月计划、月度统计、月度复盘。
- 运营后台。
- 复杂单位换算，如斤到克、ml 到杯。
- 社交分享、跨平台导入。

新增上述能力必须先更新 MVP 范围或新增专项 spec。

## 4. 开发规则

- 优先纵向切片完成闭环，不堆横向半成品。
- 修改业务规则时，必须同步更新对应 spec 和测试。
- 新接口必须有入参、出参、错误态和鉴权说明。
- 新页面必须覆盖加载态、空态、失败态和未登录态。
- 不把复杂计划生成、食材合并等业务规则只写在小程序端。
- 不引入无法解释或无法验证的黑盒逻辑。
- 不在业务代码里硬编码真实密钥、AppSecret、生产地址。
- 不为了接入后端而大改现有 WXML/WXSS、半屏弹窗、自定义 Tab、拖拽/滑动交互。
- 涉及页面视觉或交互的改动，必须参考 `docs/harness/frontend-design-preservation.md` 并说明回归范围。

## 5. 任务执行流程

每个任务按以下顺序推进：

```text
读取任务卡 -> 读取相关 spec -> 确认验收标准 -> 实现 -> 补测试/检查 -> 自测 -> 汇报结果
```

实现前需要明确：

- 这个任务属于哪个模块。
- 是否在 MVP 范围内。
- 需要改哪些页面、接口、数据结构。
- 需要哪些测试或手动验收。

## 6. 验收门禁

完成任务前至少执行：

- 相关单元测试。
- 相关接口或页面冒烟。
- MVP 验收清单中的对应项。
- PR 检查清单中的范围、快照、鉴权、错误态检查。

如果测试无法运行，必须说明原因、风险和替代检查方式。

## 7. 文档维护

- 模块行为变更：更新 `docs/specs/`。
- 新任务模式：更新 `docs/tasks/task-template.md` 或新增任务卡。
- 验收标准变更：更新 `docs/checklists/mvp-acceptance.md`。
- 代码审查标准变更：更新 `docs/reviews/pr-review-checklist.md`。
