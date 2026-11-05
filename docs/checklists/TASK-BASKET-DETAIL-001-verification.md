# TASK-BASKET-DETAIL-001 验证记录

日期：2026-07-31

## 完成

- 菜谱详情“加菜篮”不再写 `app.globalData`，改调 `baskets.week.addRecipe`。
- 服务端只接收周起始日和 recipeId，按可信 owner 读取菜谱并解析食材。
- 食材服务端合并后以 manual 来源写入，计划同步不会删除。
- 来源引用包含 recipeId 和 `recipe_detail`；同一周同一菜谱重复添加幂等。
- 详情页 WXML/WXSS 未因本修复修改。

## 验证

- shopping list remote verifier 通过，并确认客户端不上传食材。
- 服务端 basket、merge、migration、auth、compliance 定向测试：33 项通过。
- 页面脚本语法检查通过。

## 风险

- 真实 CloudBase/PostgreSQL 环境未配置，迁移 apply/rollback 和页面刷新可见性需 QA 冒烟。
- 无食材菜谱返回 warning，不创建食材项。
