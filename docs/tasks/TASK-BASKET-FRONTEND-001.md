# TASK-BASKET-FRONTEND-001 菜篮页接真实 API

## 任务 ID

`TASK-BASKET-FRONTEND-001`

## 背景

`pages/shopping-list/index` 已有完整菜篮交互，但目前通过 `shopping-list-api.js` mock 和 `app.globalData` 持有周菜篮。MVP 要求菜篮持久化、从计划快照同步，并且手动项在再次同步后保留。

## 目标

将菜篮页从 mock/globalData 切换到真实菜篮服务，保留现有分组、勾选、滑动删除、拖拽、新增食材体验。

## 范围

### 包含

- 改造 `services/shopping-list-api.js` 或新增 remote adapter。
- 周切换时读取对应周菜篮。
- 勾选/取消勾选调用真实 API。
- 手动新增调用真实 API。
- 删除调用真实 API。
- 从计划页触发同步时调用真实菜篮同步接口。
- 接口失败时回滚或重新拉取。

### 不包含

- 不重写菜篮页 WXML/WXSS。
- 不改变现有分组视觉。
- 不实现复杂单位换算。
- 不做多人共享采购。

## 相关上下文

- 菜篮 spec：`docs/specs/basket.md`
- 前端设计保护：`docs/harness/frontend-design-preservation.md`
- 当前代码库：`docs/harness/current-codebase-harness.md`
- 页面：`pages/shopping-list/index`
- Service：`services/shopping-list-api.js`
- 当前工具：`utils/shopping-list.js`
- 依赖任务：`TASK-BASKET-API-001`、`TASK-BASKET-MERGE-001`

## 实现要求

- 保持页面字段契约：
  - `groups[].items[]`
  - `id`
  - `name`
  - `amount`
  - `checked`
  - `source`
  - `category`
- 服务端字段转换在 service 层完成。
- 现有 `globalData.shoppingBasket*` 不再作为真实数据源，可仅作为过渡缓存。
- 勾选、删除、新增失败时必须可恢复。
- 同步失败不能清空页面当前列表。

## 前端设计保护

- 是否改 WXML：否，除非补必要失败态
- 是否改 WXSS：否
- 是否改组件结构：否
- 是否保持现有字段契约：是
- 是否优先通过 `services/` 或数据映射接入：是
- 视觉回归范围：
  - 页面：菜篮页
  - 弹窗：新增食材半屏弹窗
  - 手势：勾选后重排、滑动删除、长按跨分组拖拽、周切换
  - 空态/加载态/失败态：空菜篮、同步失败、保存失败

## API/数据变更

不新增后端能力；消费 `TASK-BASKET-API-001` 的接口。

## 验收标准

- [ ] 可按周加载真实菜篮。
- [ ] 从计划同步后菜篮展示服务端合并结果。
- [ ] 勾选状态刷新后仍保留。
- [ ] 手动新增刷新后仍保留。
- [ ] 删除刷新后仍删除。
- [ ] 再次同步不删除手动新增项。
- [ ] 现有手势和弹窗未被破坏。

## 测试要求

- [ ] 单元测试：service 数据映射函数。
- [ ] 接口测试：依赖后端任务。
- [ ] 页面冒烟：同步、勾选、新增、删除、周切换。
- [ ] 回归范围：菜篮页手势和新增弹窗。

## 风险

- 当前页面将勾选后重排和拖拽状态写入本地数据，接真实 API 时要谨慎处理乐观更新。
- 若计划真实 API 未完成，同步入口无法完整验收。

## 完成汇报模板

```text
完成：
- 菜篮页接真实 API
- 替换 globalData 真实数据源

验证：
- service 映射测试
- 菜篮页手动冒烟

风险/后续：
- 记录仍依赖 mock 或计划任务的部分
```
