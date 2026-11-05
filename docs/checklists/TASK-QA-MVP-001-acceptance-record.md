# TASK-QA-MVP-001 逐项验收记录

日期：2026-07-31  
环境：macOS Codex 沙箱，Node 26.5.0；微信开发者工具 2.01.2510290 已安装并已打开项目；
本地 PostgreSQL `TEST_DATABASE_URL` 已配置，小程序四类 API 配置默认 mock。

2026-07-31 范围调整：用户明确本轮只要求本地测试；产品/法务确认和日志/注销 SLA 暂不作为
本地测试门禁。真实 CloudBase 与提审生产配置仍未验证，不得据此宣称可生产发布。

状态说明：

- 自动通过：有直接单元/接口/静态契约证据。
- 自动通过，人工待验：实现和自动证据成立，但视觉、手势或真实平台仍需人工。
- 阻塞：必须依赖真实微信、CloudBase 或 PostgreSQL 测试环境，当前不能宣称通过。

## 1. 登录与合规

| 验收项 | 结果 | 证据 / 阻塞 |
| --- | --- | --- |
| 首次进入核心功能时引导登录 | 自动通过，人工待验 | auth-state verifier；五个核心页面 guard；真机导航待验。 |
| 微信快捷登录成功后可进入主功能 | 阻塞 | remote action/client 测试通过；真实微信身份与 CloudBase 未配置。 |
| 登录前展示协议勾选 | 自动通过，人工待验 | 登录页未勾选拦截与 client test；视觉待验。 |
| 用户服务协议可查看 | 自动通过，人工待验 | 页面注册、版本 `2026-07-31`、public action 测试通过；法务待确认。 |
| 隐私政策可查看 | 自动通过，人工待验 | 同上。 |
| 我的页展示用户信息 | 阻塞 | auth.me 与页面状态实现；真实昵称/头像待微信环境。 |
| 可退出登录 | 自动通过，人工待验 | logout action/client test、确认弹窗与核心 guard；真机待验。 |
| 可进入账号注销说明页 | 自动通过，人工待验 | manifest、页面与 profile 入口静态验证。 |
| 可提交注销申请或形成待处理记录 | 阻塞 | owner-scoped API/迁移契约通过；真实 DB 未应用。 |

## 2. 菜谱

| 验收项 | 结果 | 证据 / 阻塞 |
| --- | --- | --- |
| 菜谱列表可加载 | 阻塞 | remote 映射通过；真实 CloudBase/DB 未联调。 |
| 分类可新增 | 自动通过，人工待验 | category remote action verifier 与服务端测试。 |
| 分类可编辑 | 自动通过，人工待验 | 同上。 |
| 分类可删除，菜谱归入未分类 | 自动通过，人工待验 | migration/RPC 契约与确认 UI；真实 DB 待验。 |
| 分类可排序或至少有稳定排序 | 自动通过，人工待验 | reorder action 与拖拽持久化代码；手势待验。 |
| 可新建菜谱 | 自动通过，人工待验 | create action、表单映射/校验测试；页面操作待验。 |
| 可上传或选择封面图 | 阻塞 | 图片处理/上传测试通过；真实存储 bucket 与授权未验。 |
| 可填写主料、辅料、调料 | 自动通过，人工待验 | draft/输入映射与服务端校验测试。 |
| 可添加、删除、编辑步骤 | 自动通过，人工待验 | 表单与 draft verifier；页面键盘/交互待验。 |
| 可编辑已有菜谱 | 自动通过，人工待验 | update action 与详情到编辑映射；真实链路待验。 |
| 可删除菜谱 | 自动通过，人工待验 | owner-scoped soft delete 测试与确认弹窗。 |
| 删除菜谱后列表不再展示 | 自动通过 | list RPC 过滤 `deleted_at`，接口测试覆盖。 |
| 删除菜谱后历史计划快照仍可展示 | 自动通过 | plan API 快照保留测试直接覆盖。 |

## 3. 计划

| 验收项 | 结果 | 证据 / 阻塞 |
| --- | --- | --- |
| 可查看日计划 | 阻塞 | remote/API 映射通过；真实 DB 未联调。 |
| 日计划固定展示早餐、午餐、晚餐 | 自动通过 | plan API/client tests 断言三餐映射。 |
| 可添加菜谱到指定餐段 | 自动通过，人工待验 | owner/date/meal RPC 与 client payload 测试。 |
| 可移除餐段菜谱 | 自动通过，人工待验 | remove RPC、确认弹窗与刷新逻辑。 |
| 点击计划中的菜谱可进入详情 | 自动通过，人工待验 | 页面路由静态检查；真机点击待验。 |
| 可查看周计划 | 阻塞 | week get 映射通过；真实 DB 未联调。 |
| 可生成本周计划 | 自动通过，人工待验 | 规则、持久化 action 和 client tests。 |
| 已有计划时生成会提示覆盖确认 | 自动通过，人工待验 | CONFLICT test 与覆盖确认静态契约。 |
| 菜谱不足时有 warning，不导致页面崩溃 | 自动通过，人工待验 | generator warnings、诊断和非致命弹窗。 |
| 日计划修改后周计划同步展示 | 自动通过，人工待验 | 写后同时刷新 day/week；真实 DB 页面待验。 |

## 4. 菜篮

| 验收项 | 结果 | 证据 / 阻塞 |
| --- | --- | --- |
| 可查看当前周菜篮 | 阻塞 | remote 映射通过；真实 DB 未联调。 |
| 可从周计划同步菜篮 | 阻塞 | action/interface test 通过；真实事务迁移未应用。 |
| 同名同单位数字食材自动求和 | 自动通过 | 精确十进制 merge 单测。 |
| 同名不同单位食材分行展示 | 自动通过 | merge 单测。 |
| 不可解析用量保留原始文本 | 自动通过 | merge 单测。 |
| 可勾选/取消勾选食材 | 自动通过，人工待验 | update action/client 与失败回拉；真机排序待验。 |
| 可手动新增食材 | 自动通过，人工待验 | create action/client；半屏弹窗待验。 |
| 可删除食材 | 自动通过，人工待验 | delete action、确认和失败回拉；滑动待验。 |
| 再次同步不会删除手动新增项 | 自动通过 | transaction/API tests 直接覆盖 manual 保留。 |

## 5. 错误态与空态

| 验收项 | 结果 | 证据 / 阻塞 |
| --- | --- | --- |
| 菜谱列表空态明确 | 自动通过，人工待验 | hardening verifier；视觉待验。 |
| 日计划空态明确 | 自动通过，人工待验 | 三餐空槽状态；视觉待验。 |
| 周计划空态明确 | 自动通过，人工待验 | weekly empty state；视觉待验。 |
| 菜篮空态明确 | 自动通过，人工待验 | empty banner 与分组新增入口；视觉待验。 |
| 网络失败有提示 | 自动通过，人工待验 | 各核心页面 error/retry 与 remote error tests。 |
| 保存失败不丢表单内容 | 自动通过 | draft verifier 与 hardening contract。 |
| 图片上传失败可重试或无图保存 | 自动通过，人工待验 | upload error test 与无图保存确认逻辑。 |

## 6. 数据与安全

| 验收项 | 结果 | 证据 / 阻塞 |
| --- | --- | --- |
| 所有用户数据按用户隔离 | 本地数据库通过 | owner-scoped RPC 集成测试在独立 PostgreSQL 测试库通过。 |
| 写接口需要登录态 | 自动通过 | CloudBase trusted identity tests；客户端 guard。 |
| 数据库不保存明文密钥 | 自动通过 | schema/代码安全扫描无密钥列或常量。 |
| 小程序端不包含 AppSecret | 自动通过 | runtime 源码扫描无 AppSecret/token/连接串。 |
| 删除用户内容符合软删除或明确策略 | 自动通过 | 菜谱 soft delete；注销仅可追踪申请、不即时清理的明确策略。 |
| 计划和菜篮使用快照 | 自动通过 | plan snapshot schema/API tests；basket 从 plan snapshot 同步。 |

## 7. 本地冒烟路径

开发者工具已启动并打开项目；页面自动化等待本机 IDE 服务端口授权：

```text
登录 -> 新建菜谱 -> 查看详情 -> 编辑菜谱 -> 生成周计划
-> 添加/移除餐段 -> 同步菜篮 -> 勾选 -> 查看协议 -> 退出
```

本轮允许使用默认 mock 完成本地 UI/交互冒烟；它验证页面闭环和设计回归，不等价于真实
CloudBase、微信授权或提审环境联调。

## 8. 2026-07-31 本地数据库复验

- `npm --prefix server run build`：通过。
- `npm --prefix server test`：101/101 通过。
- 独立测试库内覆盖迁移 0001–0014、0014→0001 全量回滚、重新应用、用户隔离、计划快照、
  菜篮同步与合并、并发约束和 HTTP health。
- 用户确认本轮可使用 `127.0.0.1:54329/dish_library_test` 作为本地应用库；通过进程级
  `DATABASE_URL=$TEST_DATABASE_URL` 从版本 0 应用迁移 0001–0014，`verify` 返回版本 14。
- 本地服务 `/health/live` 与 `/health/ready` 均返回 ok，ready 报告数据库版本与期望版本均为 14。
- 未改写 `server/.env`，也未对已迁移 public schema 执行破坏性 rollback；全量 rollback/re-apply
  已由隔离 schema 集成测试覆盖。

## P0 / P1

### 当前本地测试阻塞

- 微信开发者工具服务端口已经用户授权并成功开启；CLI 正确识别 AppID，模拟器使用缓存的
  3.16.2 基础库并成功加载用户代码。但 IDE 2.01.2510290 automator 事件层抛出
  `TypeError: Cannot set property 'handler' of undefined`，导致 DOM/data/screenshot 协议无响应。
- Codex 进程没有 macOS 辅助功能和屏幕录制权限，无法绕过 automator 做窗口点击/截图；页面
  主链路需人工复核，或授权上述系统权限后继续。

### 本轮明确暂不纳入门禁

- 真实 CloudBase/remote 配置与微信真实授权（本轮只要求本地 mock 测试）。
- 协议与隐私正文的 PM/法务确认。
- CloudBase 日志保留、访问控制及注销申请人工处理 SLA。

### 代码审计

- QA 发现的 SECURITY DEFINER search_path P1 已由 `TASK-SECURITY-RPC-001` 修复。
- 当前自动化和静态审计未发现未记录的代码级 P0/P1。

## 其他环境差异

- 根目录 React/Vite 原型因 rolldown optional native binding 缺失无法构建；它不是小程序主入口。
- 沙箱内禁止本地网络访问；授权在沙箱外复跑后 HTTP health 与数据库测试均通过。
