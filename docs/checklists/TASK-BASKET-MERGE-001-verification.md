# TASK-BASKET-MERGE-001 验证记录

日期：2026-07-31

## 完成

- 服务端新增透明、可测试的食材合并函数，并接入周菜篮同步。
- 仅合并标准化后同名、同单位且数字用量可解析的计划来源项。
- 不可解析用量保持独立行和原始文本；空单位仅与空单位合并。
- 合并保持首次出现顺序，并汇总全部来源引用。

## 验证

- `npm --prefix server run build`
- `node --test server/dist/test/basket-merge.test.js server/dist/test/basket-api.test.js server/dist/test/migration-contract.test.js server/dist/test/plan-api.test.js server/dist/test/recipe-api.test.js`
- 结果：44 项通过，0 项失败。
- 覆盖：同单位精确求和、不同单位分行、不可解析分行、空单位、稳定顺序、来源引用、同步接口调用合并函数。

## 风险与后续

- 当前结构化解析仅接受非负十进制数字和显式单位；不做分数、负数或单位换算，符合 MVP 边界。
- 页面真实数据展示与手势回归由 `TASK-BASKET-FRONTEND-001` 完成。
- 未配置 `TEST_DATABASE_URL`，本次未执行真实 PostgreSQL 集成迁移；数据库契约由迁移静态测试覆盖。
