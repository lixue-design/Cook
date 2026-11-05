# Cook MVP 服务端

当前服务端包含菜谱、计划、菜篮、登录与合规 Cloud Function actions，以及数据库迁移、
健康检查和本地菜品图片能力。仓库只提供可部署制品和运行说明，不包含任何真实环境部署或生产凭证。

## 运行形态

- CloudBase 云函数：构建后以 `server/index.js` 为包根入口，处理器为 `index.main`。
- CloudBase 云托管：使用 `server/Dockerfile`，服务读取平台注入的 `PORT` 并保持无状态。
- 本地开发：使用 `server/compose.yaml` 启动 PostgreSQL 16，端口只绑定到 `127.0.0.1`。
- 数据库：只使用标准 PostgreSQL SQL 和 `pg` 驱动，不依赖 TencentDB 专属能力或额外扩展。

官方约定参考：

- [CloudBase 云函数快速开始](https://docs.cloudbase.net/cloud-function/quick-start)
- [CloudBase 云函数入口 `index.main`](https://docs.cloudbase.net/api-reference/manager/node/function)
- [CloudBase 云托管 Node.js 容器化](https://docs.cloudbase.net/run/quick-start/dockerize-node)
- [CloudBase 云托管 `PORT` 环境变量](https://docs.cloudbase.net/run/develop/developing-guide)

## 本地准备

```sh
cp server/.env.example server/.env
# 只在 server/.env 中填写本地密码；该文件已被 Git 忽略。
npm --prefix server ci
docker compose --env-file server/.env -f server/compose.yaml up -d --wait
```

`.env.example` 只有非生产占位符。不要把 CloudBase `service_role`、数据库密码或任何模型密钥提交到仓库。

## 构建、迁移和测试

首次创建数据库或在一台新的 PostgreSQL 服务器上重建数据库时，设置管理员连接并运行：

```sh
export ADMIN_DATABASE_URL='postgresql://postgres:your-password@127.0.0.1:54329/postgres'
export TARGET_DATABASE_NAME='cook'
npm --prefix server run db:bootstrap
```

`db:bootstrap` 会在数据库不存在时创建它，并按顺序执行 `database/migrations` 中尚未应用的迁移。
命令使用迁移版本、事务、advisory lock 和 SHA-256 校验和，可以安全重复执行。管理员密码只通过环境变量提供，
不要写入脚本或提交到仓库。

先把 `server/.env` 注入当前 shell，再执行命令：

```sh
set -a
. server/.env
set +a

npm --prefix server run build
npm --prefix server run migrate
npm --prefix server run verify
```

数据库集成测试绝不使用 `DATABASE_URL`。先创建名称含独立 `test` 标记的测试数据库，并通过 `TEST_DATABASE_URL` 明确指定：

```sh
docker compose --env-file server/.env -f server/compose.yaml exec -T postgres \
  createdb -U "$POSTGRES_USER" dish_library_test
env -u DATABASE_URL TEST_DATABASE_URL="$TEST_DATABASE_URL" npm --prefix server test
```

测试还会在测试数据库内为每次运行创建随机 schema，只在该 schema 内迁移、回滚和写入约束数据，结束后自动删除。以下情况会在连接前直接失败：缺少 `TEST_DATABASE_URL`、测试地址与 `DATABASE_URL` 相同、数据库名不含独立 `test` 标记。

回滚最近一个版本：

```sh
npm --prefix server run rollback
```

迁移工具使用 PostgreSQL advisory lock、事务和 SHA-256 校验和。已应用迁移文件被改写、缺少回滚文件或出现重复版本时会失败。

## 健康检查

- `GET /health/live`：只检查进程是否存活，不访问数据库。
- `GET /health` 或 `GET /health/ready`：执行数据库查询，并要求当前迁移版本严格等于代码中的期望版本；版本为 0、落后或超前均返回 503，响应不包含连接串或数据库错误详情。

## 本地菜品图片与方舟兜底

图片搜索优先查询数据库和 `IMAGE_STORAGE_ROOT`。只有没有匹配结果，并且同时配置了
`ARK_API_KEY` 与 `ARK_IMAGE_MODEL` 时，服务才会调用方舟图片生成 API：

```sh
export IMAGE_STORAGE_ROOT='../storage/dish-images'
export ARK_API_KEY='在方舟控制台生成的 API Key'
export ARK_IMAGE_MODEL='doubao-seedream-4-0-250828'
export ARK_IMAGE_TIMEOUT_MS='180000'
```

生成任务通过 `generation_jobs.job_key` 防止并发重复调用。成功后图片立即写入本地
`generated/` 目录，并在同一事务中写入菜品、别名、图片素材、倒排关键词和生成记录。
后续相同菜名会直接返回已入库图片。密钥不得写入 `.env.example` 或提交到 Git。

本地启动：

```sh
npm --prefix server start
```

## CloudBase 云函数打包

仓库内未执行真实部署。发布负责人应先在隔离环境构建，然后把 `server/` 作为函数代码包根目录，确保包根包含：

```text
index.js
package.json
package-lock.json
dist/
```

处理器配置为 `index.main`。数据库连接只通过 CloudBase 服务端环境变量注入。

## CloudBase 云托管构建

仓库内只验证本地构建，不推送镜像：

```sh
docker build -f server/Dockerfile -t cook-ai-dish-library:local .
```

部署时构建上下文必须是仓库根目录，因为镜像同时复制 `server/` 和 `database/`。平台端口使用 `PORT` 环境变量；数据库连接只通过服务端环境变量配置。

## 停止本地数据库

保留数据卷：

```sh
docker compose --env-file server/.env -f server/compose.yaml down
```

删除本地开发数据卷：

```sh
docker compose --env-file server/.env -f server/compose.yaml down -v
```
