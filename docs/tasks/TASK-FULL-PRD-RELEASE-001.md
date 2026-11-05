# TASK-FULL-PRD-RELEASE-001

## 任务 ID

`TASK-FULL-PRD-RELEASE-001`

## 背景

Full PRD 队列最后需要更新发布手册、回滚策略和成本/安全门禁。当前本地代码切片已推进到 schema version 20，但真实发布仍依赖 CloudBase、微信开发者工具、真机冒烟、法务文案和注销处理批准。

## 目标

更新 Full PRD 提审前发布清单，明确 schema 20、规则 provider、真实环境冒烟、注销处理和安全/成本门禁。

## 当前发布结论

`Blocked`

## 阻塞原因

- `TASK-ACCOUNT-CANCEL-EXECUTE-001` 仍为 `Blocked`，注销 dry-run/execute 未获合规门禁。
- `TASK-FULL-PRD-SMOKE-001` 仍为 `Blocked`，没有真实 staging/CloudBase/真机冒烟证据。
- 真实 remote 配置、数据库迁移演练、存储桶、微信登录和法务文案仍需外部负责人确认。

## 范围

### 包含

- 更新 `docs/checklists/TASK-RELEASE-001-release-runbook.md` 到 Full PRD / schema 20。
- 更新发布文档验证脚本的 migration 范围到 0001-0020。
- 明确首版生成只启用 `provider=rules`，未来 AI provider 需要成本/密钥/熔断门禁。
- 明确真实环境、注销执行和法务/安全门禁。

### 不包含

- 提交小程序审核。
- 部署 staging/prod。
- 操作真实 CloudBase、生产数据库或真实用户数据。
- 代替 QA、产品、法务或发布负责人签字。

## 相关上下文

- 发布手册：`docs/checklists/TASK-RELEASE-001-release-runbook.md`
- Full PRD 验收：`docs/checklists/full-prd-acceptance.md`
- 冒烟任务：`docs/tasks/TASK-FULL-PRD-SMOKE-001.md`
- 注销执行任务：`docs/tasks/TASK-ACCOUNT-CANCEL-EXECUTE-001.md`

## 实现要求

- 发布手册必须保留 `Blocked / 不允许提审或生产发布` 结论，直到真实门禁关闭。
- 发布手册必须禁止 mock 作为生产降级方案。
- 发布手册必须检查迁移版本 20。
- 发布手册必须覆盖 Full PRD 规则生成、月计划、注销和协议版本。

## Full PRD 限制

- Provider 策略：首版只允许 `provider=rules`；`provider=ai` 需另行确认模型、成本、内容安全和密钥门禁。
- 前端样式保护：不修改小程序 WXML/WXSS、页面布局、手势、自定义 Tab 或半屏弹窗。
- 数据事实来源：发布前以真实 remote 服务端、数据库和存储桶为准，不接受 mock 结论。
- 快照规则：发布验收必须覆盖计划、菜篮、模板和复刻快照。
- 用户隔离：发布验收必须覆盖 owner 隔离。
- 不可做事项：不提交审核、不部署生产、不写入真实密钥、不执行未批准的注销处理。

## 前端设计保护

- 是否改 WXML：不涉及
- 是否改 WXSS：不涉及
- 是否改组件结构：不涉及
- 是否保持现有字段契约：不涉及
- 是否优先通过 `services/` 或数据映射接入：不涉及
- 视觉回归范围：
  - 页面：发布前真实冒烟覆盖
  - 弹窗：发布前真实冒烟覆盖
  - 手势：发布前真实冒烟覆盖
  - 空态/加载态/失败态：发布前真实冒烟覆盖

## API/数据变更

不涉及业务 API；文档验证脚本检查 migration 0001-0020。

## 验收标准

- [x] 发布手册更新到 Full PRD / schema 20。
- [x] 发布手册覆盖规则 provider、成本/密钥、真实环境和注销执行门禁。
- [x] 发布文档验证脚本覆盖 0001-0020 migration。
- [x] 明确真实发布仍 Blocked，不能提审或生产发布。

## 测试要求

- [x] `npm run test:release-docs`
- [x] `npm --prefix server run build`

## 风险

- 本任务只能完成发布清单更新；真实提审和生产发布必须等待外部门禁解除。

## 完成汇报模板

```text
完成：
- ...

验证：
- ...

风险/后续：
- ...
```
