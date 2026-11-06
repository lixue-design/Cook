# TASK-RELEASE-001 / Full PRD 提审前发布清单与运行手册

更新日期：2026-11-06
当前结论：**Blocked / 不允许提审或生产发布**。Full PRD 本地代码切片与发布文档已推进，但
`TASK-ACCOUNT-CANCEL-EXECUTE-001`、`TASK-FULL-PRD-SMOKE-001` 和 `TASK-QA-MVP-001`
的真实环境/合规 P0 尚未关闭。

本手册只定义检查与人工执行顺序，不授权部署、提交审核、修改生产配置或处理真实用户数据。

## 1. 环境与负责人

| 环境 | 用途 | 数据与配置 | 允许动作 |
| --- | --- | --- | --- |
| local | 开发与自动测试 | 本地 mock、独立 test 数据库 | 构建、单测、迁移演练 |
| staging | 联调、体验版、提审前验收 | 独立 CloudBase、数据库、存储桶 | 经负责人授权后部署与冒烟 |
| prod | 审核通过后的正式环境 | 生产 CloudBase、数据库、存储桶 | 仅人工发布负责人操作 |

发布负责人、数据库负责人、QA、产品/法务和回滚决策人必须在发布记录中实名确认。staging
和 prod 的 AppID、CloudBase 环境、云函数、数据库、存储桶必须逐项记录并交叉核对，不能复用
local/test 连接，也不能凭名称猜测。

## 2. 安全配置门禁

- [ ] `project.config.json` 的 AppID 已由小程序管理员确认属于目标应用。
- [ ] `config/recipe-api.js`、`plan-api.js`、`basket-api.js`、`auth-api.js` 在真实构建中全部为
  `remote`，且指向同一目标环境中经验证的函数。
- [ ] 发布制品中不存在 `mock` API；函数名为空时立即停止发布。
- [ ] 微信 AppSecret、数据库连接串、CloudBase 服务端凭证、对象存储凭证、模型密钥和
  session/JWT secret 均只通过服务端密钥管理或环境变量注入。
- [ ] 小程序包、Git、日志、截图、审核备注和发布记录中均无上述秘密。
- [ ] staging 与 prod 使用不同数据库和存储资源；最小权限和访问审计由环境负责人确认。
- [ ] 首版生成能力保持 `provider=rules`；`provider=ai` 未批准时必须关闭，发布制品不包含模型密钥。

当前体验版的四个 API 配置统一指向体验环境的 `cook-recipe-api`。发布负责人在生产发布前必须
替换为目标生产环境的同类受控配置并评审差异；不得向仓库提交 AppSecret、生产连接串或凭证。

## 3. 构建与服务端制品

在干净、可信且具备锁定依赖的构建环境中：

```sh
npm --prefix server ci
npm --prefix server run build
npm --prefix server test
```

- [ ] 所有非环境限制测试通过；数据库测试明确使用独立且名称含 `test` 标记的
  `TEST_DATABASE_URL`。
- [ ] 函数包根包含 `index.js`、`package.json`、`package-lock.json`、`dist/` 及生产依赖，
  handler 为 `index.main`。
- [ ] 制品版本、源码 commit、依赖锁文件摘要和构建日志已保存。
- [ ] 服务端运行身份能访问目标数据库和私有菜谱图片存储，但无超出 MVP 的管理权限。
- [ ] 部署后 `/health/live` 存活，`/health/ready` 返回就绪且 schema 版本严格为 `32`。

真实 CloudBase 函数/容器发布由外部负责人执行，本任务不执行。

## 4. 数据库迁移门禁

迁移文件必须完整包含 `0001`–`0032` 的 up/down。先在 staging 的隔离数据库演练：

```sh
npm --prefix server run build
npm --prefix server run migrate
npm --prefix server run verify
npm --prefix server run rollback
npm --prefix server run migrate
npm --prefix server run verify
```

- [ ] 执行前完成可恢复备份，记录备份标识和恢复负责人。
- [ ] apply/verify 成功，当前版本为 `32`，迁移校验和无差异。
- [ ] 最近一版 rollback 成功；re-apply 和二次 verify 成功。
- [ ] owner 隔离、快照、食材合并、注销申请和 RPC 权限集成测试通过。
- [ ] 生产变更窗口、锁等待、失败终止阈值和恢复路径已批准。

生产环境不得把 `TEST_DATABASE_URL` 当作 `DATABASE_URL`，也不得在无备份时迁移。应用写入新
schema 后，不应盲目回滚数据库：先回退客户端/函数，评估兼容性与已写数据，再由数据库负责人
决定逐版 down 或从备份恢复。

## 5. 小程序与真实用户闭环

使用同一 staging 账号、同一数据库连续执行，并填写
`docs/checklists/miniprogram-smoke-record-template.md`：

```text
同意协议并微信登录
-> 新建菜谱（含图片、食材、步骤）
-> 查看并编辑详情
-> 生成周计划
-> 添加、移动、移除餐段菜谱
-> 同步菜篮
-> 勾选、手动新增、删除采购项
-> 编辑菜谱或删除菜谱后验证历史计划/菜篮快照
-> 查看协议、隐私政策和注销说明
-> 提交注销申请并确认进入可撤回期
-> Full PRD 规则生成、月计划、模板、协议版本重新确认和注销状态机主链路
-> 退出并重新登录
```

- [ ] loading、空、失败、重试、未登录态已真机验收。
- [ ] 分类排序、半屏弹窗、拖拽、滑动删除、确认弹窗已真机回归。
- [ ] 图片上传格式、压缩、失败重试和私有访问已验收。
- [ ] 网络中断/服务端错误显示安全提示与 requestId，表单草稿不丢失。
- [ ] `docs/checklists/mvp-acceptance.md` 和 `docs/checklists/full-prd-acceptance.md` 全部有真实结果与证据。
- [ ] `docs/checklists/TASK-QA-MVP-001-pr-review-audit.md` 无未关闭 P0/P1。

## 6. 合规与提审人工确认

- [ ] 产品/法务确认用户协议、隐私政策正文和版本日期。
- [ ] 微信公众平台的服务类目、隐私保护指引、收集字段、接口权限和截图与实际行为一致。
- [ ] 登录前协议同意、协议入口、隐私入口、注销入口均可访问。
- [ ] 账号自助注销的 7 天可撤回期、自动删除范围、最小完成记录和失败重试规则已确认。
- [ ] 云函数已配置 `ACCOUNT_CANCELLATION_TIMER_TOKEN`，定时器使用同一令牌且只调用 `system.accountCancellation.runDue`。
- [ ] 专用测试账号已完成创建、撤回、模拟到期删除和失败重试的 staging 验证；未使用真实用户账号。
- [ ] CloudBase 日志访问角色、脱敏规则、保留期限和删除规则已批准。
- [ ] 客服联系方式、版本号、体验账号/说明和审核备注由产品负责人复核。

这些事项依赖真实账号、平台权限或业务决策，自动化测试不能代签。

## 7. 发布顺序

只有第 2–6 节全部通过且 QA、产品、技术负责人签字后：

1. 冻结发布 commit 和数据库迁移；保存旧客户端、旧函数和数据库备份。
2. 在 staging 部署数据库、函数和小程序体验版，执行完整冒烟。
3. 生产窗口内先迁移并 verify 数据库，再部署同 commit 的函数，检查 ready 和诊断日志。
4. 构建并上传指向 prod 的小程序包，复核制品不含 mock/秘密，人工提交审核。
5. 审核通过后按批准窗口发布；观察登录、菜谱写入、计划生成、菜篮同步和错误率。

每一步记录操作者、时间、版本、结果和证据；任何 P0/P1、ready 失败或数据异常立即停止。

## 8. 失败、降级与回滚

- 审核前失败：停止提审，保留当前线上版本；修复后从 staging 全链路重验。
- 函数/接口失败：先部署上一个已验证函数制品；确认旧函数与当前 schema 兼容。
- 小程序失败：不发布新版本或回退到微信平台允许的上一个稳定版本。
- 数据库迁移失败：保持事务失败状态，禁止继续发布；由数据库负责人按备份和迁移记录恢复。
- 已产生新数据后的 schema 问题：禁止自动执行 down；先隔离写入、回退调用方并完成数据影响评估。
- 单一增强能力故障：仅关闭非 MVP 可选能力（如未来 AI provider）。**不得把生产切到 mock**，
  否则会隐藏真实用户数据并造成假成功。
- 登录、用户隔离、快照、菜篮同步、协议或注销入口任一关键能力不可用时，不允许降级发布。

恢复后重新执行 ready、数据库 verify 和完整用户闭环；未通过前保持 Blocked。

## 9. 当前未关闭项

以下项目来自 `TASK-QA-MVP-001` 和 Full PRD 队列，均需外部负责人补证：

- P0：四类 API 的真实 remote 配置和准确云函数名。
- P0：独立测试数据库中迁移 0001–0032 的 apply/verify/rollback/re-apply。
- P0：微信开发者工具、真实 CloudBase 和同一账号下的 MVP + Full PRD 连续主链路冒烟及视觉/手势验收。
- P0：自助注销定时任务、内部令牌、幂等重试及专用测试账号演练闭环。
- P1：协议与隐私正文的产品/法务批准。
- P1：日志保留/访问控制、注销处理 SLA 和完成通知规则。

关闭记录应链接
`docs/checklists/TASK-QA-MVP-001-acceptance-record.md`、
`docs/checklists/mvp-acceptance.md` 和
`docs/reviews/pr-review-checklist.md`。
