# API 契约索引与真实化状态矩阵

本文对应 `TASK-HARNESS-002`，记录当前小程序 service、Cloud Function action、服务端文件和 MVP 缺口。后续接真实 API 时，以本文作为任务拆分和联调基准。

正式 MVP API 契约初版见 [mvp-api-contract.md](./mvp-api-contract.md)。本文继续维护实现状态和缺口矩阵；当契约与状态矩阵出现差异时，先核对当前代码状态，再同步修正文档。

## 1. 状态定义

| 状态 | 含义 |
| --- | --- |
| `mock` | 当前页面或 service 使用本地 mock、内存数据或 `globalData`，没有真实持久化闭环。 |
| `remote adapter` | 小程序端已有调用远端的适配代码，但当前默认入口不一定启用。 |
| `server implemented` | 服务端已有可调用 action、HTTP 路由或数据库 RPC。 |
| `missing` | MVP 需要，但当前没有真实服务端接口或持久化能力。 |

当前实际后端形态是 Cloud Function `action` 模式：

```js
wx.cloud.callFunction({
  name: apiConfig.cloudFunctionName,
  data: { action, payload }
})
```

MVP 文档中的 REST 路径仍作为产品 API 语义参考；在团队决定切换 REST/OpenAPI 前，新增真实能力可以继续按 action 模式落地，但必须在本文或后续正式 OpenAPI 中补充契约。

## 2. 总览

| 模块 | 当前小程序入口 | 当前后端入口 | 当前状态 | 后续任务 |
| --- | --- | --- | --- | --- |
| 健康检查 | 无页面入口 | `server/src/app.ts`、`server/src/cloud-function.ts` | `server implemented` | Harness 维护 |
| 菜谱 CRUD | `services/recipe-api.js` 默认 mock，可通过 `config/recipe-api.js` 切 remote；`services/recipe-api-remote.js` 可 remote | `server/src/recipe-api.ts`、`database/migrations/0003_recipe_crud_api.up.sql` | `mock` default + configurable `remote adapter` + `server implemented` | `TASK-RECIPE-REMOTE-002` |
| 分类管理 | 同菜谱 service | `server/src/recipe-api.ts`、`database/migrations/0003_recipe_crud_api.up.sql` | `mock` default + configurable `remote adapter` + `server implemented` | `TASK-CATEGORY-REMOTE-001` |
| 封面上传 | `services/recipe-api-remote.js` | `covers.upload` action | `remote adapter` + `server implemented`，默认 mock 未启用 | `TASK-RECIPE-REMOTE-002` |
| 计划 | `services/meal-plan-api.js` mock/remote dispatcher | `plans.day.*`、`plans.week.get/generate`、`plans.items.move` | `configurable mock/remote` / `server implemented` | 真实环境配置与人工冒烟 |
| 菜篮 | `services/shopping-list-api.js` mock/remote dispatcher、`services/shopping-list-api-remote.js` | `baskets.week.*`、`baskets.items.*` 已实现 | `implemented` / 环境切换待配置 | 无 |
| 登录/用户态 | `services/auth-api.js` mock/remote、`services/auth-state.js`、登录页和我的页 | `server/src/auth-api.ts`、`0011_auth_profile`、`0022_default_user_profile` | `implemented` / 真实环境待配置 | 人工冒烟 |
| 协议/注销 | 我的页入口、协议/隐私页、注销说明与申请 service | `server/src/compliance-api.ts`、`0012_account_cancel_requests` | `implemented` / 法务确认待办 | 人工验收 |
| AI 图片库 | `services/dish-image-api.js` | `server/src/app.ts`、`server/src/dish-image-library.ts` | `server implemented`，不进入 MVP 主链路 | `TASK-AI-DISH-001` |

## 3. 健康检查与运行时

| 语义 | 当前契约 | 前端位置 | 后端位置 | 状态 | 鉴权/隔离 |
| --- | --- | --- | --- | --- | --- |
| 进程存活 | `GET /health/live` | 无 | `server/src/app.ts`、`server/src/cloud-function.ts` | `server implemented` | 不需要登录，不返回敏感信息。 |
| 数据库就绪 | `GET /health`、`GET /health/ready` | 无 | `server/src/app.ts`、`server/src/health.ts` | `server implemented` | 不需要登录，不返回连接串或数据库错误详情。 |
| Cloud Function 数据库就绪 | action `health.ready` | 无 | `server/src/cloud-function.ts` | `server implemented` | 使用服务端 CloudBase 运行时，不面向用户数据写入。 |

## 4. 菜谱与分类

| MVP REST 语义 | 当前 action | 小程序 service | 后端/RPC | 状态 | 后续任务 |
| --- | --- | --- | --- | --- | --- |
| `GET /api/recipes` | `recipes.list` | `fetchRecipeGroups()` in `services/recipe-api-remote.js`; 默认 `services/recipe-api.js` 仍走 mock，可通过配置切 remote | `handleRecipeApiEvent()` -> `ai_dish_library_list_recipes` | `mock` default + configurable `remote adapter` + `server implemented` | `TASK-RECIPE-REMOTE-002` |
| `GET /api/recipes/{recipeId}` | `recipes.detail` | `fetchRecipeDetail(id)` | `ai_dish_library_get_recipe` | `mock` default + `remote adapter` + `server implemented` | `TASK-RECIPE-REMOTE-002` |
| `POST /api/recipes` | `recipes.create` | `createRecipe(form)` | `ai_dish_library_create_recipe` | `mock` default + `remote adapter` + `server implemented` | `TASK-RECIPE-REMOTE-002` |
| `PUT /api/recipes/{recipeId}` | `recipes.update` | `updateRecipe(id, form)` | `ai_dish_library_update_recipe` | `mock` default + `remote adapter` + `server implemented` | `TASK-RECIPE-REMOTE-002` |
| `DELETE /api/recipes/{recipeId}` | `recipes.delete` | `deleteRecipe(id)` | `ai_dish_library_delete_recipe` | `mock` default + `remote adapter` + `server implemented` | `TASK-RECIPE-REMOTE-002` |
| `POST /api/uploads/recipe-image` | `covers.upload` | `uploadCustomCover(filePath)` | `uploadCover()` with CloudBase storage dependency | `remote adapter` + `server implemented` | `TASK-RECIPE-REMOTE-002` |
| `GET /api/recipe-categories` | `categories.list` | `getRecipeCategories()` | list groups via `ai_dish_library_list_recipes` | `mock` default + `remote adapter` + `server implemented` | `TASK-CATEGORY-REMOTE-001` |
| `POST /api/recipe-categories` | `categories.create` | `createRecipeCategory(name)` | `ai_dish_library_create_category` | `mock` default + `remote adapter` + `server implemented` | `TASK-CATEGORY-REMOTE-001` |
| `PATCH /api/recipe-categories/{categoryId}` | `categories.rename` | `renameRecipeCategory(id, name)` | `ai_dish_library_rename_category` | `mock` default + `remote adapter` + `server implemented` | `TASK-CATEGORY-REMOTE-001` |
| `DELETE /api/recipe-categories/{categoryId}` | `categories.delete` | `deleteRecipeCategory(id)` | `ai_dish_library_delete_category` | `mock` default + `remote adapter` + `server implemented` | `TASK-CATEGORY-REMOTE-001` |
| `PUT /api/recipe-categories/sort` | `categories.reorder` | `reorderRecipeCategories(orderedIds)` | `ai_dish_library_reorder_categories` | `mock` default + `remote adapter` + `server implemented` | `TASK-CATEGORY-REMOTE-001` |

鉴权和隔离现状：

- 所有菜谱/分类/封面 action 都先调用 `ensureIdentity()`，要求 CloudBase 提供可信 `userId`、`appId`、`openId`。
- 服务端通过 `p_owner_id` 调 RPC，按用户隔离读写。
- 自定义封面 storage key 必须以当前用户 hash 前缀开头，避免引用其他用户封面。
- 当前默认入口仍是 mock；后续缺口是 remote 环境联通、页面冒烟和字段映射确认。

## 5. 计划

| MVP REST 语义 | 当前 action | 小程序 service | 后端位置 | 状态 | 后续任务 |
| --- | --- | --- | --- | --- | --- |
| `GET /api/week-plans/{weekStartDate}` | `plans.week.get` | remote `fetchWeeklyPlan` | `server/src/plan-api.ts` | `configurable remote` | 真实环境冒烟 |
| `POST /api/week-plans/generate` | `plans.week.generate` | remote `generateWeeklyPlan` + 页面覆盖确认/warnings | `server/src/week-plan-generator.ts`、`cook_plan_generate_week` | `configurable remote` | 真实环境冒烟 |
| `PUT /api/week-plans/{weekStartDate}` | 未实现 | 无真实保存 | 无 | `missing` | `TASK-PLAN-API-001` |
| `GET /api/day-plans/{date}` | `plans.day.get` | remote `fetchMealPlans(date)` | `server/src/plan-api.ts`、`cook_plan_get_day` | `configurable remote` | 真实环境冒烟 |
| `PUT /api/day-plans/{date}` | 未实现 | 无真实保存 | 无 | `missing` | `TASK-PLAN-API-001` |
| `POST /api/day-plans/{date}/meals/{mealType}/recipes` | `plans.day.meal.recipes.add` | remote `addRecipeToPlan` | `server/src/plan-api.ts`、`cook_plan_add_recipe` | `configurable remote` | 真实环境冒烟 |
| `DELETE /api/day-plans/{date}/meals/{mealType}/recipes/{planRecipeId}` | `plans.day.meal.recipes.remove` | remote `removeRecipeFromPlan` | `server/src/plan-api.ts`、`cook_plan_remove_recipe` | `configurable remote` | 真实环境冒烟 |
| 拖拽调整计划项 | `plans.items.move` | remote `movePlanRecipe`，失败重新拉取回滚 | `cook_plan_move_recipe` | `configurable remote` | 真实环境手势冒烟 |
| 周日期辅助 | 不需要后端时可本地计算 | `fetchWeekDates(weekOffset)` mock 固定从 2026-07-05 起算 | 无 | `mock` | `TASK-PLAN-FRONTEND-001` |

计划 API 必须补齐：

- 写入计划项时保存菜谱快照。
- 菜谱编辑和删除不得污染历史计划。
- 周计划生成返回 `warnings`。
- 所有用户数据必须带用户隔离字段或等价鉴权逻辑。

## 6. 菜篮

| MVP REST 语义 | 当前 action | 小程序 service | 后端位置 | 状态 | 后续任务 |
| --- | --- | --- | --- | --- | --- |
| `GET /api/baskets/{weekStartDate}` | `baskets.week.get` | `fetchShoppingList(weekStartDate)` remote | `server/src/basket-api.ts`、`cook_basket_get_week` | `implemented` | 无 |
| `POST /api/baskets/{weekStartDate}/sync-from-plan` | `baskets.week.syncFromPlan` | `syncShoppingList(weekStartDate)` remote | `server/src/basket-api.ts`、`server/src/basket-merge.ts`、`cook_basket_plan_snapshots`、`cook_basket_replace_plan_items` | `implemented` | 无 |
| `POST /api/baskets/{weekStartDate}/add-recipe` | `baskets.week.addRecipe` | 详情页 `addRecipeToShoppingList()` | `server/src/basket-api.ts`、`cook_basket_add_recipe_items` | `implemented` | 真实环境冒烟 |
| `POST /api/baskets/{weekStartDate}/items` | `baskets.items.create` | `createShoppingItem()` remote | `cook_basket_create_manual_item` | `implemented` | 无 |
| `PATCH /api/baskets/{weekStartDate}/items/{itemId}` | `baskets.items.update` | `updateShoppingItem()` remote，失败重拉 | `cook_basket_update_item` | `implemented` | 无 |
| `DELETE /api/baskets/{weekStartDate}/items/{itemId}` | `baskets.items.delete` | `deleteShoppingItem()` remote，失败重拉 | `cook_basket_delete_item` | `implemented` | 无 |
| `PUT /api/baskets/{weekStartDate}/items/check-all` | `baskets.items.checkAll` | 无真实批量接口 | `cook_basket_check_all` | `server implemented` / 前端 missing | `TASK-BASKET-FRONTEND-001` |
| 食材分组归一 | 不应只在前端实现 | `normalize()`、`groupItems()` 仅映射服务端结果 | `server/src/basket-merge.ts` | `implemented` | 无 |

菜篮 API 必须补齐：

- 从周计划快照汇总食材。
- 只合并同名同单位且数字用量可解析的项。
- 同名不同单位分行。
- 不可解析用量保留原始文本。
- 计划同步默认 `replace_plan_items`，保留手动新增项。
- 勾选状态和删除操作必须持久化。

## 7. 登录、用户态与合规

| MVP REST 语义 | 当前 action | 小程序位置 | 后端位置 | 状态 | 后续任务 |
| --- | --- | --- | --- | --- | --- |
| `POST /api/auth/wechat-login` | `auth.wechatLogin` | `services/auth-api-remote.js`、`pages/login/index` | `server/src/auth-api.ts`、`cook_auth_update_profile` | `implemented` | 真实微信环境冒烟 |
| `POST /api/auth/logout` | `auth.logout` | `services/auth-api-remote.js`、`pages/profile/index` | `server/src/auth-api.ts` | `implemented` | 真实微信环境冒烟 |
| `GET /api/me` | `auth.me` | `services/auth-api-remote.js`、`pages/profile/index` | `server/src/auth-api.ts`、`cook_auth_get_user` | `implemented` | 真实微信环境冒烟 |
| `POST /api/account/cancel-request` | `account.cancelRequest.create` | `pages/account-cancel/index`、`services/compliance-api-remote.js` | `cook_account_cancel_request_create` | `implemented` | 真实环境冒烟 |
| `GET /api/agreements/latest` | `agreements.latest` | 登录确认与静态协议页，当前版本 `2026-11-05` | `server/src/compliance-api.ts` | `implemented` | 微信公众平台隐私保护指引人工配置 |
| `GET /api/agreements/{type}` | `agreements.get` | `pages/agreement/index` | `server/src/compliance-api.ts` | `implemented` | 微信公众平台隐私保护指引人工配置 |
| `GET /api/app-config` | 不实现 | MVP 配置保留在版本化本地 config | 无 | `not required for MVP` | 发布清单核对 |

auth action 和业务 action 均从 CloudBase 服务端上下文取得可信身份；客户端本地用户态只用于页面准入和展示，不能作为服务端鉴权依据。

## 8. AI 图片库边界

| 语义 | 当前契约 | 小程序 service | 后端位置 | 状态 | MVP 处理 |
| --- | --- | --- | --- | --- | --- |
| 图片搜索 | `GET /api/dish-images/search?q=&limit=` | `services/dish-image-api.js` | `server/src/app.ts`、`server/src/dish-image-library.ts` | `server implemented` | 可保留图片匹配体验，但 AI 生成不进入 MVP 主链路。 |
| 图片读取 | `GET /api/dish-images/{assetId}` | 由搜索结果 URL 间接使用 | `server/src/app.ts` | `server implemented` | 同上。 |
| 方舟兜底生成 | 服务端配置 `ARK_API_KEY` + `ARK_IMAGE_MODEL` 后启用 | 无直接页面主流程承诺 | `server/src/ark-dish-image-generator.ts` | 可选能力 | 需 `TASK-AI-DISH-001` 明确专项边界。 |

## 9. 写接口统一要求

后续新增或接入真实接口时必须满足：

- 所有写接口必须鉴权；登录、协议读取类接口除外。
- 所有用户数据必须通过 `user_id`、`owner_id` 或等价服务端身份字段隔离。
- 服务端必须做最终参数校验，前端校验只用于体验。
- 计划和菜篮写入必须使用菜谱快照。
- 错误返回必须能被小程序展示，不应只返回通用 500。
- 新接口必须同步本文、对应模块 spec 或正式 OpenAPI。

## 10. 下一步推荐顺序

1. `TASK-RECIPE-REMOTE-002`：菜谱列表、详情、新建、编辑、删除接 remote。
2. `TASK-CATEGORY-REMOTE-001`：分类增删改排接 remote。
3. `TASK-PLAN-API-001`：建立日计划/周计划数据模型和快照接口。
4. `TASK-PLAN-WEEK-001`：实现周计划生成和 warnings。
5. `TASK-BASKET-API-001` + `TASK-BASKET-MERGE-001`：建立菜篮 API 和服务端合并规则。
6. `TASK-AUTH-001` + `TASK-COMPLIANCE-001`：补齐登录态、协议和注销入口。
