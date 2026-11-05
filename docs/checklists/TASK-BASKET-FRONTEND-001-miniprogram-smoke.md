# TASK-BASKET-FRONTEND-001 小程序冒烟记录

日期：2026-07-31

## 完成

- 菜篮 service 拆分为 mock/remote dispatcher，remote 覆盖按周读取、计划同步、勾选/排序、手动新增和删除。
- 菜篮页不再以 `app.globalData.shoppingBasket*` 作为真实数据源。
- 计划页“加菜篮”改为调用服务端周计划快照同步，不再在客户端解析并合并食材。
- 勾选、删除、拖拽失败时重新读取服务端真值；新增失败保留弹窗输入。
- 未修改菜篮页 WXML、WXSS、组件结构和既有手势事件。

## 自动验证

- `npm run test:shopping-list-api-mode`
- `npm run test:shopping-list-api-remote`
- `npm run test:meal-plan-api-remote`
- 页面及 service `node --check`
- 服务端菜篮、合并和迁移契约回归：23 项通过，0 项失败。
- 静态确认页面不再引用 `shoppingBasket*`、`addIngredientGroupsToWeekBasket` 或客户端计划食材解析。

## 人工冒烟待办

- [ ] 微信开发者工具配置 remote 模式和测试云函数。
- [ ] 周切换后读取对应菜篮。
- [ ] 从计划页同步并确认服务端合并结果。
- [ ] 勾选后重排，重新进入页面仍保留。
- [ ] 手动新增后刷新仍保留，再同步也不删除。
- [ ] 左滑删除后刷新仍删除。
- [ ] 长按跨分组拖拽后刷新仍保持分类和顺序。
- [ ] 模拟接口失败，确认当前列表不被清空且提示可见。
- [ ] 新增半屏弹窗、自定义 Tab、安全区视觉无回归。

## 风险与后续

- 仓库默认仍为 mock 模式，避免硬编码真实云函数名；remote 环境切换与真实账号联调需在提测环境人工执行。
- 当前环境没有微信开发者工具、云函数配置和真实账号，无法完成页面/真机人工冒烟；纳入 `TASK-QA-MVP-001`。
