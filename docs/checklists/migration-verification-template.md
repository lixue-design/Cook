# Database Migration Verification Template

用于每次新增或修改 `database/migrations/` 时记录验证结果。不要在本文档或复制出的记录中填写真实密钥、token、生产连接串、真实用户隐私或不可脱敏数据。

## 使用时机

- 新增数据库 migration。
- 修改已有未发布 migration。
- 调整表结构、索引、约束、枚举、初始化数据或回滚 SQL。
- 无法在当前环境运行 migration 时，也必须复制本模板记录替代检查和剩余风险。

## 基本信息

| 字段 | 内容 |
| --- | --- |
| 任务 ID | `<TASK-ID>` |
| 模块 | `<菜谱 / 计划 / 菜篮 / 登录合规 / Harness / 其他>` |
| migration 文件 | `database/migrations/<version>_<name>.sql` |
| 负责人 | `<name>` |
| 验证日期 | `YYYY-MM-DD` |
| 环境 | `<local docker / test db / CI / Codex sandbox / other>` |
| 数据库类型 | `PostgreSQL` |
| 数据库标识 | `<脱敏后的本地或测试库标识，不填写连接串>` |

## 前置检查

- [ ] migration 文件包含 `-- migrate:up` 或等价 up SQL。
- [ ] migration 文件包含 `-- migrate:down` 或等价 down SQL；若不可回滚，已说明原因和人工恢复方案。
- [ ] 不包含真实密钥、token、生产地址、真实用户隐私或生产连接串。
- [ ] 新增用户数据表包含用户隔离字段或等价鉴权约束。
- [ ] 影响计划或菜篮历史数据时，已确认不会破坏菜谱快照。
- [ ] 影响食材数据时，已确认不会引入复杂单位换算或改变 MVP 合并规则。

## Up 验证

| 检查项 | 命令或 SQL | 期望 | 实际 | 结果 |
| --- | --- | --- | --- | --- |
| 构建迁移工具 | `npm --prefix server run build` | 构建通过 | `<实际结果>` | `<Pass/Fail/Skipped>` |
| 应用 migration | `npm --prefix server run migrate` | 迁移成功且版本记录更新 | `<实际结果>` | `<Pass/Fail/Skipped>` |
| 校验 migration | `npm --prefix server run verify` | 版本和 checksum 校验通过 | `<实际结果>` | `<Pass/Fail/Skipped>` |
| 表结构检查 | `<SELECT / \\d / information_schema SQL>` | 表、字段、索引、约束符合 spec | `<实际结果>` | `<Pass/Fail/Skipped>` |
| 兼容性检查 | `<必要的读写样例 SQL 或测试命令>` | 旧数据可读，新数据可写 | `<实际结果>` | `<Pass/Fail/Skipped>` |

## Down 或等价回滚验证

| 检查项 | 命令或 SQL | 期望 | 实际 | 结果 |
| --- | --- | --- | --- | --- |
| 执行回滚 | `npm --prefix server run rollback` | 最近版本 down SQL 成功执行 | `<实际结果>` | `<Pass/Fail/Skipped>` |
| 回滚后校验 | `npm --prefix server run verify` | migration 状态符合预期 | `<实际结果>` | `<Pass/Fail/Skipped>` |
| 结构恢复检查 | `<SELECT / \\d / information_schema SQL>` | 结构恢复到回滚前状态或记录差异 | `<实际结果>` | `<Pass/Fail/Skipped>` |
| 重新应用 | `npm --prefix server run migrate` | 回滚后可再次成功应用 | `<实际结果>` | `<Pass/Fail/Skipped>` |

若 down SQL 不可执行，必须填写：

```text
不可回滚原因：
- <例如数据不可逆转换 / PostgreSQL 限制 / 需人工恢复>

等价检查：
- <例如在临时库重建 schema 后执行 up，并用结构 SQL 校验目标状态>

人工恢复方案：
- <例如备份恢复、补偿 SQL、发布前人工确认点>
```

## 无法运行时的替代记录

```text
未运行：
- <命令或 SQL>

未运行原因：
- <缺 Docker / 缺测试数据库 / 缺 server/.env / Codex 沙箱端口限制 / CI 权限限制 / 其他>

替代检查：
- <静态检查 migration up/down 结构>
- <对照模块 spec 检查字段、索引、用户隔离和快照约束>
- <检查迁移命令入口和测试文件是否覆盖相关表>

剩余风险：
- <未真实执行 up/down 带来的数据兼容、回滚或 checksum 风险>
```

## 结论

| 项 | 结果 |
| --- | --- |
| up 验证 | `<Pass/Fail/Skipped>` |
| down 或等价回滚验证 | `<Pass/Fail/Skipped>` |
| 安全与隐私检查 | `<Pass/Fail>` |
| 是否阻塞合并 | `<是/否>` |
| 后续动作 | `<无 / 补测试 / 补 SQL / 人工复核 / 标记 Blocked>` |
