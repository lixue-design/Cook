# 本地启动与验证说明

本文对应 `TASK-HARNESS-001`，用于统一小程序、服务端、数据库迁移和测试的本地验证入口。当前仓库主应用是微信小程序；根目录的 React/Vite 工程只作为原型或辅助验证，不作为 MVP 主实现入口。

## 1. 入口地图

| 域 | 入口 | 说明 |
| --- | --- | --- |
| 微信小程序 | `app.json`、`project.config.json`、`pages/` | MVP 主应用，使用微信开发者工具打开仓库根目录。 |
| 小程序服务适配层 | `services/` | 接真实 API 时优先改这里和数据映射，避免重写页面。 |
| 小程序全局状态 | `app.js` | 只保留轻量页面共享状态；remote 模式下业务真相以服务端为准。 |
| 后端服务 | `server/` | Node.js + TypeScript，支持本地 HTTP、CloudBase 云函数和云托管形态。 |
| 数据库迁移 | `database/migrations/` | PostgreSQL SQL 迁移，包含 up/down。 |
| Harness 文档 | `docs/harness/` | Agent/研发任务执行轨道。 |
| 任务卡 | `docs/tasks/` | 当前迭代任务拆分和验收标准。 |

## 2. 小程序本地启动

1. 安装并打开微信开发者工具。
2. 选择「导入项目」，项目目录选择仓库根目录。
3. `project.config.json` 的 `compileType` 已是 `miniprogram`，页面入口来自 `app.json`。
4. 当前体验版的菜谱、计划、菜篮和登录/合规 service 均为 `remote`，并统一指向经确认的业务云函数；本地独立开发可临时逐项切回 `mock`。

注意：

- 不要把 `src/`、`dist/`、根目录 Vite 原型当作小程序主入口。
- 小程序视觉/交互改动需先阅读 `docs/harness/frontend-design-preservation.md`。
- 接真实 API 时优先修改 `services/` 或数据映射层。

## 3. 根目录原型构建

根目录 `package.json` 提供 React/Vite 原型脚本：

```sh
npm run dev
npm run build
npm run preview
```

这些命令不依赖数据库。它们只验证根目录原型，不代表小程序可提测。

若 `npm run build` 报 `rolldown` optional native binding 缺失，例如找不到 `@rolldown/binding-*`：

```sh
npm ci
```

如本机已有不完整的 `node_modules`，可先移除根目录 `node_modules` 后重新安装依赖。不要手动改 `package-lock.json` 来绕过 optional dependency；若是在受限沙箱中因网络失败，应在正常开发机或已授权网络环境下重装依赖后复核。

## 4. 后端本地准备

复制本地配置模板：

```sh
cp server/.env.example server/.env
```

只在 `server/.env` 中填写本地密码和本地连接串。不要提交真实密钥、CloudBase 服务端凭证、生产数据库地址或模型 API Key。

安装后端依赖：

```sh
npm --prefix server ci
```

启动本地 PostgreSQL：

```sh
docker compose --env-file server/.env -f server/compose.yaml up -d --wait
```

`server/compose.yaml` 默认只把 PostgreSQL 绑定到 `127.0.0.1:${POSTGRES_PORT:-54329}`。

## 5. 菜谱 remote mode 配置

小程序菜谱 service 的开关在 `config/recipe-api.js`。当前体验版为：

```js
const configuredMode = 'remote';
const configuredCloudFunctionName = 'cook-recipe-api';
```

可选 mode：

| mode | 行为 |
| --- | --- |
| `mock` | 默认模式，`services/recipe-api.js` 导出 `services/recipe-api-mock.js`，不依赖云函数。 |
| `remote` | `services/recipe-api.js` 导出 `services/recipe-api-remote.js`，通过 `wx.cloud.callFunction` 调用菜谱 Cloud Function action。 |

启用 remote 时必须配置云函数名称：

```js
const configuredMode = 'remote';
const configuredCloudFunctionName = '你的菜谱云函数名称';
```

`cloudFunctionName` 不是密钥，但应使用环境对应的云函数名称；不要把 AppSecret、服务端 token 或生产数据库连接串写入小程序配置。若 `mode: 'remote'` 但 `cloudFunctionName` 为空，`services/recipe-api.js` 会抛出可读错误，不会静默回退到 mock。

`RECIPE_API_MODE` 和 `RECIPE_CLOUD_FUNCTION_NAME` 仅用于 Node 侧工具脚本或临时检查覆盖；小程序实际运行以 `configuredMode` 和 `configuredCloudFunctionName` 为准。

### 5.1 计划 remote mode

计划 service 使用独立的 `config/plan-api.js`，当前同样指向体验版业务函数：

```js
const configuredMode = 'remote';
const configuredCloudFunctionName = 'cook-recipe-api';
```

Node 验证可使用 `PLAN_API_MODE`、`PLAN_CLOUD_FUNCTION_NAME`；小程序运行以配置文件常量为准。remote adapter 覆盖日计划读取、添加、移除、拖拽移动、周计划读取和生成。云函数名称不是密钥，不得在配置中加入 AppSecret、数据库连接串或服务端 token。

### 5.2 菜篮与登录/合规 remote mode

菜篮和登录/合规分别使用 `config/basket-api.js`、`config/auth-api.js`。真实联调时两者也必须设为
`remote` 并填写同一环境中已部署、已验证的云函数名称。Node 侧检查可使用
`BASKET_API_MODE` / `BASKET_CLOUD_FUNCTION_NAME` 和
`AUTH_API_MODE` / `AUTH_CLOUD_FUNCTION_NAME`。

真实提测包必须同时检查四个配置文件。任何一个仍为 `mock` 或云函数名为空，都属于发布
P0；不得依靠 mock 兜底，也不得把 AppSecret、数据库连接串或服务端 token 写入小程序。

## 6. 后端构建与启动

后端 TypeScript 构建不需要数据库：

```sh
npm --prefix server run build
```

本地服务启动需要 `DATABASE_URL` 和已迁移的数据库。先加载 `server/.env`：

```sh
set -a
. server/.env
set +a
npm --prefix server start
```

本地 HTTP 入口：

| 路径 | 说明 | 是否需要数据库 |
| --- | --- | --- |
| `GET /health/live` | 进程存活检查 | 否 |
| `GET /health` | 数据库和迁移版本就绪检查 | 是 |
| `GET /health/ready` | 同 `/health` | 是 |
| `GET /api/dish-images/search?q=番茄炒蛋` | 本地菜品图片搜索 | 是 |
| `GET /api/dish-images/{assetId}` | 读取本地菜品图片 | 是 |

菜谱/分类 CRUD 当前在 Cloud Function action 模式下实现，不是本地 HTTP REST 路由。

## 7. 数据库迁移命令

首次创建数据库或重建数据库时，确认 `server/.env` 中有本地 `ADMIN_DATABASE_URL` 和 `TARGET_DATABASE_NAME`，然后运行：

```sh
npm --prefix server run db:bootstrap
```

常规迁移和校验需要先完成后端构建，并加载 `server/.env`：

```sh
npm --prefix server run build
npm --prefix server run migrate
npm --prefix server run verify
```

当前代码期望数据库 schema 版本为 `20`，对应 `0001`–`0020` 成对 up/down 文件。staging
必须完成 apply、verify、rollback 最近一版、re-apply 和再次 verify；生产迁移只能由获授权
的发布负责人在备份和回滚决策已确认后执行。

回滚最近一个迁移版本：

```sh
npm --prefix server run rollback
```

迁移命令前置条件：

| 命令 | 前置条件 | 说明 |
| --- | --- | --- |
| `npm --prefix server run db:bootstrap` | PostgreSQL 可连；`ADMIN_DATABASE_URL` 和 `TARGET_DATABASE_NAME` 已设置 | 创建目标库并应用迁移。 |
| `npm --prefix server run migrate` | `DATABASE_URL` 指向目标库；已执行 `build` | 应用未执行迁移。 |
| `npm --prefix server run verify` | `DATABASE_URL` 指向目标库；已执行 `build` | 校验迁移版本和校验和。 |
| `npm --prefix server run rollback` | `DATABASE_URL` 指向目标库；已执行 `build` | 执行最近版本 down SQL。 |

## 8. 测试命令

后端测试需要先构建：

```sh
npm --prefix server run build
```

不依赖真实数据库的单元测试：

```sh
npm --prefix server run test:unit
```

完整测试：

```sh
npm --prefix server test
```

数据库集成测试必须使用独立测试库，并且不能复用 `DATABASE_URL`：

```sh
env -u DATABASE_URL TEST_DATABASE_URL="$TEST_DATABASE_URL" npm --prefix server test
```

测试前置条件：

| 命令 | 是否需要数据库 | 备注 |
| --- | --- | --- |
| `npm --prefix server run build` | 否 | TypeScript 编译。 |
| `npm --prefix server run test:unit` | 否 | 包含 health/config/recipe API 等单元测试；health 测试会本地监听 `127.0.0.1` 随机端口。 |
| `npm --prefix server test` | 部分需要 | 会运行 `server/dist/test/*.test.js`，集成测试需要 `TEST_DATABASE_URL`。 |
| `npm --prefix server run test:integration` | 是 | 需要独立测试库，数据库名需包含独立 `test` 标记。 |

## 9. 受限沙箱中的已知差异

在 Codex 或其他受限沙箱里，以下失败可能是环境限制而非业务回归：

| 现象 | 可能原因 | 复核方式 |
| --- | --- | --- |
| `npm run build` 找不到 `@rolldown/binding-*` | optional native dependency 未完整安装 | 在正常网络环境重新执行根目录 `npm ci`，再跑 `npm run build`。 |
| health 单测监听 `127.0.0.1` 失败 | 沙箱禁止或限制本地端口监听 | 在本机终端执行 `npm --prefix server run build` 和 `npm --prefix server run test:unit` 复核。 |
| Docker 或 PostgreSQL 无法启动 | 沙箱无 Docker 权限或端口受限 | 在本机 Docker 环境执行 compose 和迁移命令。 |
| 依赖安装失败 | 沙箱网络受限 | 在授权网络环境执行 `npm ci`。 |

如果失败信息指向参数校验、断言不匹配、迁移校验和错误或 TypeScript 编译错误，应优先按业务/代码问题处理。

## 10. 无法运行测试时的汇报格式

如果未运行的是数据库 migration 验证，复制 `docs/checklists/migration-verification-template.md` 的“无法运行时的替代记录”填写；如果未运行的是小程序页面或主路径冒烟，复制 `docs/checklists/miniprogram-smoke-record-template.md` 的对应章节填写。发现缺陷时，使用 `docs/reviews/defect-report-template.md` 记录复现步骤、期望、实际、影响范围、环境、证据和阻塞状态。

```text
验证：
- 已运行：
  - <命令或手动检查>
- 未运行：
  - <命令>
- 未运行原因：
  - <缺 Docker / 缺数据库 / 沙箱网络或端口限制 / 其他>
- 替代检查：
  - <检查了哪些路径、命令名、测试文件或手动流程>
- 剩余风险：
  - <未覆盖的接口、页面或数据迁移风险>
```

## 11. 模块 owner/评审人建议

| 模块 | 建议 owner | 建议评审人 | 重点检查 |
| --- | --- | --- | --- |
| Harness | Tech Lead | QA / 后端 / 前端各 1 人 | 任务边界、验证口径、文档链接。 |
| 菜谱 | 小程序前端 + 后端 | 产品 / QA | 分类、CRUD、图片上传、软删除和用户隔离。 |
| 计划 | 后端 | 小程序前端 / 产品 / QA | 计划快照、周生成 warnings、覆盖确认。 |
| 菜篮 | 后端 + 小程序前端 | QA / 产品 | 同名同单位数字合并、手动项保留、勾选持久化。 |
| 登录合规 | 后端 + 小程序前端 | 产品 / QA | 微信登录、协议勾选、退出登录、注销申请。 |
| AI 图片库 | 后端 | 产品 / 安全或合规 | 不混入 MVP 主链路、密钥隔离、生成兜底。 |

## 12. 最小开工检查

每个任务开工前至少确认：

- 已读取对应任务卡和模块 spec。
- 任务属于 MVP 范围，或已有专项文档说明边界。
- 是否会改 WXML/WXSS/组件结构。
- 是否需要数据库、Cloud Function、微信开发者工具或 Docker。
- 完成后能跑哪些单测、接口测试或页面冒烟。
