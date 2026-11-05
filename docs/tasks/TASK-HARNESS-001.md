# TASK-HARNESS-001 本地启动与验证说明

## 任务 ID

`TASK-HARNESS-001`

## 背景

当前仓库已有小程序、服务端、数据库迁移和 Harness 文档，但缺少统一的本地启动、测试和验证入口。此前验证发现前端 `npm run build` 可能因 optional native binding 缺失失败，后端部分测试在沙箱内监听 `127.0.0.1` 会失败但在正常环境可通过。需要把这些环境事实沉淀成新人和 Agent 都能执行的说明。

## 目标

建立一份可信的本地启动与验证说明，让后续任务都能明确如何运行小程序、服务端、迁移和测试，并知道失败时如何判断是环境问题还是业务问题。

## 范围

### 包含

- 新增或更新根目录 README 或 `docs/harness/local-development-and-verification.md`。
- 梳理小程序主入口、服务端入口、数据库迁移目录、测试命令。
- 记录前端依赖修复方式，例如重新安装缺失 optional dependencies。
- 记录后端测试在受限沙箱与本机环境下的差异。
- 明确哪些命令需要数据库、哪些命令不需要数据库。
- 补充模块 owner/评审人建议表。

### 不包含

- 不重构目录结构。
- 不改业务代码。
- 不引入新的 CI 系统。
- 不提交真实密钥、生产地址或个人本地配置。

## 相关上下文

- Harness：`docs/harness/README.md`
- 当前代码库：`docs/harness/current-codebase-harness.md`
- Agent 指南：`docs/harness/agent-operating-guide.md`
- Review：`docs/reviews/pr-review-checklist.md`
- 服务端说明：`server/README.md`
- 配置：`package.json`、`server/package.json`、`project.config.json`

## 实现要求

- 明确当前主应用是微信小程序，React/Vite 只作为原型或辅助验证，不作为主实现入口。
- 命令说明至少覆盖：
  - 小程序开发者工具打开方式。
  - 前端原型构建命令和已知依赖问题。
  - `npm --prefix server run build`
  - `npm --prefix server run test:unit`
  - 数据库 bootstrap、migrate、verify、rollback 的前置条件。
- 写清楚无法运行测试时的汇报格式。
- 模块 owner 表至少覆盖：Harness、菜谱、计划、菜篮、登录合规、AI 图片库。

## 前端设计保护

纯文档任务，不涉及。

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

无。

## 验收标准

- [ ] 文档中列出当前小程序、服务端、数据库、测试的启动和验证命令。
- [ ] 文档说明前端 `rolldown` optional binding 缺失时的处理建议。
- [ ] 文档说明后端单测在沙箱监听失败时如何复核。
- [ ] 文档包含模块 owner/评审人建议表。
- [ ] 文档没有包含真实密钥、个人 token 或生产连接串。

## 测试要求

- [ ] 单元测试：不涉及。
- [ ] 接口测试：不涉及。
- [ ] 页面冒烟：不涉及。
- [ ] 回归范围：检查文档链接、命令名称和路径是否存在。

## 风险

- 本地环境差异较大，命令可能需要随实际开发机和 CI 再次修订。
- 若后续引入 CI，需要将本文档同步为自动化脚本或工作流。

## 完成汇报模板

```text
完成：
- 新增/更新本地启动与验证说明
- 补充模块 owner 和已知环境问题

验证：
- 检查文档路径和命令名称

风险/后续：
- 说明哪些命令未实际运行及原因
```
