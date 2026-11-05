# TASK-AUTH-001 验证记录

日期：2026-07-31

## 完成

- 新增数据库迁移 `0011_auth_profile`，保存昵称、头像、账号状态和已同意协议版本。
- 新增 `auth.wechatLogin`、`auth.me`、`auth.logout`，身份仅取自 CloudBase 服务端上下文。
- 新增 auth mock/remote adapter 和本地非敏感用户态 store。
- 新增登录页、协议勾选和协议入口；我的页支持用户展示和退出登录。
- 菜谱、计划、菜篮三个核心 Tab 未登录时统一跳转登录。
- 业务 remote adapter 收到 `UNAUTHENTICATED` 时清除失效用户态并引导重新登录。

## 自动验证

- `npm run test:auth-client`
- recipe、plan、basket remote adapter 回归全部通过。
- 登录、协议、我的和核心 Tab 页面脚本通过 `node --check`。
- 服务端构建通过；单元测试 70 项中 67 项通过。
- 3 项 health 测试因当前沙箱禁止监听 `127.0.0.1`（`EPERM`）失败，与登录链路无关。
- auth 与 migration 定向测试：16 项通过，0 项失败。

## 人工冒烟待办

- [ ] 使用真实小程序/CloudBase 环境完成首次微信登录。
- [ ] 未勾选协议时确认无法登录；协议入口可正常返回。
- [ ] 我的页展示真实昵称和头像。
- [ ] 退出后访问菜谱、计划、菜篮均重新引导登录。
- [ ] 模拟 CloudBase 身份失效，确认清理本地状态并重新引导。

## 风险与后续

- 仓库不写入真实云函数名、AppSecret 或生产配置；真实环境联调纳入 `TASK-QA-MVP-001`。
- 协议最终文案、注销入口和申请记录由 `TASK-COMPLIANCE-001` 完成。
- 未配置 `TEST_DATABASE_URL`，迁移尚未在真实 PostgreSQL 测试库执行；当前由迁移契约测试覆盖。
