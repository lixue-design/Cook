# MVP API 契约初版

本文对应 `TASK-API-CONTRACT-001`，用于统一 MVP 联调、审查和后续真实化任务的接口语义。当前后端以 Cloud Function `action` 模式为主，MVP 文档中的 REST 路径作为产品 API 语义和未来 OpenAPI 迁移参考；在正式切换 REST 前，小程序端优先通过 `services/` 适配 action 响应，不改页面字段契约。

## 1. 通用约定

### 1.1 调用形态

当前 Cloud Function 调用格式：

```js
wx.cloud.callFunction({
  name: apiConfig.cloudFunctionName,
  data: {
    action: 'recipes.list',
    payload: {}
  }
})
```

统一响应包：

```json
{
  "ok": true,
  "data": {}
}
```

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "请求参数格式不正确"
  }
}
```

### 1.2 鉴权和用户隔离

- 登录、协议读取、健康检查可以不要求登录。
- 除上述接口外，所有用户数据读写 action 必须从服务端可信身份解析当前用户，不能信任客户端传入的 `userId`、`ownerId` 或 `openid`。
- 当前菜谱/分类/上传 action 通过 CloudBase 身份获取 `userId`、`appId`、`openId`，并经 `ai_dish_library_ensure_user` 归一到服务端用户 ID。
- 后续计划、菜篮、注销申请等接口必须使用同等可信身份，并在数据库层写入 `user_id`、`owner_id` 或等价隔离字段。
- 写接口必须服务端最终校验参数；前端校验只作为体验优化。

### 1.3 通用错误码

| code | 语义 | 页面处理建议 |
| --- | --- | --- |
| `UNAUTHENTICATED` | 未登录或无法取得可信身份 | 跳转或展示登录引导。 |
| `FORBIDDEN` | 无权访问该资源 | 提示无权限并停止重试。 |
| `INVALID_ARGUMENT` | 入参非法 | 展示 `message`，保留用户输入。 |
| `NOT_FOUND` | 资源不存在或已删除 | 展示不可用提示，可返回上一页。 |
| `CONFLICT` | 名称重复、覆盖冲突或状态冲突 | 展示冲突提示，引导用户确认或修改。 |
| `UPLOAD_TOO_LARGE` | 上传文件超限 | 提示压缩或重新选择。 |
| `UNSUPPORTED_MEDIA_TYPE` | 上传格式不支持 | 提示选择 JPEG、PNG 或 WebP。 |
| `DATABASE_UNAVAILABLE` | 数据库或依赖未就绪 | 展示稍后重试。 |
| `INTERNAL_ERROR` | 服务端未知错误 | 展示通用失败提示，记录诊断信息。 |

错误响应保持 `{ ok: false, error: { code, message, requestId } }`。`requestId`
由服务端生成，用于按时间和 action 定位脱敏日志；页面展示 `message`，问题反馈可附
`code + requestId + 发生时间`。不得把数据库错误、堆栈、密钥或用户输入放入对外错误。

### 1.4 日期、枚举和分页

- 日期使用 `YYYY-MM-DD`。
- 自然周开始日期使用 `weekStartDate`，MVP 默认周一为一周开始。
- 餐段枚举：`breakfast`、`lunch`、`dinner`。
- 分页参数：`page` 从 1 开始，`pageSize` 默认 20，上限 50。

## 2. 字段映射总览

服务端字段可以使用数据库命名，小程序页面字段保持现有契约，由 `services/` 做映射。

| 模块 | 服务端字段 | 小程序页面字段 | 说明 |
| --- | --- | --- | --- |
| 菜谱列表 | `displayName` / `name` | `title` | 卡片主标题。 |
| 菜谱列表 | `durationMinutes` / `cookTimeMinutes` | `duration` | 页面展示为 `15分钟`。 |
| 菜谱列表 | `caloriesKcal` | `calories` | 页面展示为 `320kcal`。 |
| 菜谱列表 | `coverImageUrl` / signed custom cover URL | `coverUrl`、`crop` | `crop` 缺省为 `{ width:64,height:64,left:0,top:0 }`。 |
| 菜谱详情 | `coverImageUrl` / signed custom cover URL | `heroImage`、`coverUrl` | 详情头图。 |
| 菜谱详情 | `recipe_ingredients` 或分组字符串 | `ingredients[]`、`mainIngredients`、`sideIngredients`、`seasonings` | 页面保留主料、辅料、调料三组。 |
| 菜谱详情 | `recipe_steps` | `steps[]` | 每步包含 `id`、`text`、`imageUrl`。 |
| 分类 | `recipe_categories[]` | `groups[]` / category list | 列表页使用 `groups[].recipes[]`。 |
| 日计划 | `meal_plans` + `meal_plan_recipes` | `mealPlans[].recipes[]` | 三餐固定展示。 |
| 周计划 | `week_plan.days[].meals[]` | `weeklyPlanDays[].meals[].items[]`、`emptySlots` | `emptySlots` 可由 service 层按渲染需要补齐。 |
| 菜篮 | `shopping_basket_items` | `groups[].items[]` | 分组建议为主料、辅料、调料、其他。 |
| 用户 | `users.nickname`、`users.avatar_url` | `user.nickName`、`user.avatarUrl` | 登录后展示系统默认资料或用户编辑后的资料。 |

## 3. 菜谱分类

分类接口状态：当前 action 已实现，默认小程序入口仍可配置 mock/remote；后续真实化由 `TASK-CATEGORY-REMOTE-001` 完成页面联调和冒烟。

### 3.1 分类列表

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `GET /api/recipe-categories` | `categories.list` | `server implemented` | 必须登录。 |

入参：

```json
{}
```

出参：

```json
[
  {
    "id": "category-id",
    "name": "家常菜",
    "recipeCount": 12,
    "sortOrder": 10,
    "isDefault": false
  }
]
```

用户隔离：服务端使用可信用户 ID 查询当前用户分类。默认「未分类」必须可返回且不可删除。

错误态：`UNAUTHENTICATED`、`DATABASE_UNAVAILABLE`、`INTERNAL_ERROR`。

### 3.2 创建分类

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `POST /api/recipe-categories` | `categories.create` | `server implemented` | 必须登录。 |

入参：

```json
{
  "name": "快手菜"
}
```

出参：推荐返回最新 `groups[]` 或分类列表；现有 action 返回最新菜谱分组。

校验：

- `name` 必填。
- 最多 8 个汉字或等价长度。
- 同一用户下名称不可重复。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`CONFLICT`、`DATABASE_UNAVAILABLE`、`INTERNAL_ERROR`。

### 3.3 重命名分类

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `PATCH /api/recipe-categories/{categoryId}` | `categories.rename` | `server implemented` | 必须登录。 |

入参：

```json
{
  "id": "category-id",
  "name": "家常菜"
}
```

出参：推荐返回最新 `groups[]` 或分类列表；现有 action 返回最新菜谱分组。

用户隔离：只能重命名当前用户分类；默认分类不可重命名。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`INTERNAL_ERROR`。

### 3.4 删除分类

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `DELETE /api/recipe-categories/{categoryId}` | `categories.delete` | `server implemented` | 必须登录。 |

入参：

```json
{
  "id": "category-id"
}
```

出参：推荐返回最新 `groups[]` 或分类列表；现有 action 返回最新菜谱分组。

业务规则：删除分类时，该分类下菜谱归入「未分类」，不删除菜谱。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`FORBIDDEN`、`NOT_FOUND`、`INTERNAL_ERROR`。

### 3.5 分类排序

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `PUT /api/recipe-categories/sort` | `categories.reorder` | `server implemented` | 必须登录。 |

入参：

```json
{
  "orderedIds": ["category-a", "category-b"]
}
```

出参：推荐返回最新 `groups[]` 或分类列表；现有 action 返回最新菜谱分组。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`FORBIDDEN`、`NOT_FOUND`、`INTERNAL_ERROR`。

## 4. 菜谱 CRUD 和图片上传

菜谱接口状态：当前 action 已实现，默认小程序入口仍可配置 mock/remote；后续真实化由 `TASK-RECIPE-REMOTE-002` 完成页面联调和冒烟。

### 4.1 菜谱列表

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `GET /api/recipes` | `recipes.list` | `server implemented` | 必须登录。 |

入参：

```json
{
  "categoryId": "category-id",
  "keyword": "番茄",
  "page": 1,
  "pageSize": 20
}
```

当前 action 可先忽略分页和筛选，后续 remote 任务补齐时不得破坏页面字段。目标出参：

```json
{
  "groups": [
    {
      "id": "category-id",
      "name": "家常菜",
      "recipes": [
        {
          "id": "recipe-id",
          "title": "番茄炒蛋",
          "rawName": "番茄炒蛋",
          "displayName": "番茄炒蛋",
          "coverUrl": "https://...",
          "duration": "15分钟",
          "calories": "320kcal",
          "durationMinutes": 15,
          "caloriesKcal": 320,
          "crop": { "width": 64, "height": 64, "left": 0, "top": 0 }
        }
      ]
    }
  ],
  "page": 1,
  "pageSize": 20,
  "hasMore": false
}
```

兼容说明：现有 `services/recipe-api-remote.js` 直接把 action 返回数组规范化为 `groups[]`；正式分页可在 service 层兼容数组或对象两种返回。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`DATABASE_UNAVAILABLE`、`INTERNAL_ERROR`。

### 4.2 菜谱详情

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `GET /api/recipes/{recipeId}` | `recipes.detail` | `server implemented` | 必须登录。 |

入参：

```json
{
  "id": "recipe-id"
}
```

出参：

```json
{
  "id": "recipe-id",
  "category": "家常菜",
  "categoryId": "category-id",
  "title": "番茄炒蛋",
  "rawName": "番茄炒蛋",
  "displayName": "番茄炒蛋",
  "coverUrl": "https://...",
  "heroImage": "https://...",
  "duration": "15分钟",
  "calories": "320kcal",
  "durationMinutes": 15,
  "caloriesKcal": 320,
  "mainIngredients": "番茄2个、鸡蛋2个",
  "sideIngredients": "",
  "seasonings": "盐少许",
  "ingredients": [
    {
      "group": "主料",
      "display": "番茄2个、鸡蛋2个",
      "items": [
        { "name": "番茄", "amount": "2个" }
      ]
    }
  ],
  "steps": [
    { "id": "step-1", "text": "番茄切块。", "imageUrl": "" }
  ]
}
```

用户隔离：只能读取当前用户菜谱；已软删除菜谱不在普通详情返回。历史计划展示必须使用计划快照，不依赖本接口。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`NOT_FOUND`、`INTERNAL_ERROR`。

### 4.3 创建菜谱

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `POST /api/recipes` | `recipes.create` | `server implemented` | 必须登录。 |

入参：

```json
{
  "name": "番茄炒蛋",
  "rawName": "番茄炒蛋",
  "displayName": "番茄炒蛋",
  "categoryId": "category-id",
  "category": "家常菜",
  "customCoverStorageKey": "user-hash/cover.jpg",
  "durationMinutes": 15,
  "caloriesKcal": 320,
  "mainIngredients": "番茄2个、鸡蛋2个",
  "sideIngredients": "",
  "seasonings": "盐少许",
  "steps": [
    { "id": "step-1", "text": "番茄切块，鸡蛋打散。", "imageUrl": "" }
  ]
}
```

校验：

- 菜名必填，当前页面与 API 的兼容上限为 200 个字符。
- 耗时为 1-999 正整数，可为空。
- 热量为 1-9999 正整数，可为空。
- 封面 storage key 必须属于当前用户前缀。
- 临时本地图片路径不能作为持久 URL 保存。

出参：同菜谱详情。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`FORBIDDEN`、`CONFLICT`、`INTERNAL_ERROR`。

### 4.4 更新菜谱

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `PUT /api/recipes/{recipeId}` | `recipes.update` | `server implemented` | 必须登录。 |

入参：与创建菜谱相同，额外包含 `id`。

```json
{
  "id": "recipe-id",
  "name": "番茄炒蛋",
  "durationMinutes": 18,
  "caloriesKcal": 330,
  "mainIngredients": "番茄2个、鸡蛋3个",
  "steps": []
}
```

业务规则：更新菜谱不得修改已生成计划或已同步菜篮中的快照。

出参：同菜谱详情；若资源不存在，目标契约应返回 `NOT_FOUND`，当前 action 可能返回 `data:null`，后续 `TASK-RECIPE-REMOTE-002` 需要在 service 或服务端统一处理。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`INTERNAL_ERROR`。

### 4.5 删除菜谱

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `DELETE /api/recipes/{recipeId}` | `recipes.delete` | `server implemented` | 必须登录。 |

入参：

```json
{
  "id": "recipe-id"
}
```

出参：

```json
{
  "deleted": true
}
```

兼容说明：现有 action 返回 boolean，service 可映射为 `{ deleted:true }`。

业务规则：软删除菜谱；列表不再展示；历史计划和菜篮继续展示快照。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`FORBIDDEN`、`NOT_FOUND`、`INTERNAL_ERROR`。

### 4.6 上传菜谱图片

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `POST /api/uploads/recipe-image` | `covers.upload` | `server implemented` | 必须登录。 |

当前 action 用于菜谱封面上传。步骤图远端存储尚未建立独立 storage key 模型；小程序端选择的临时步骤图在保存前会提示降级，并按无图步骤保存文字内容，避免把临时路径或短期签名 URL 写入长期数据。

入参：

```json
{
  "base64": "/9j/4AAQSkZJRgABAQ...",
  "contentType": "image/jpeg",
  "purpose": "cover"
}
```

出参：

```json
{
  "storageKey": "user-hash/uuid.jpg",
  "coverUrl": "https://..."
}
```

校验：

- 支持 JPEG、PNG、WebP。
- MVP 前端压缩到最长边 1280px。
- 服务端限制 5MB，并返回可区分的大小和格式错误码。
- 存储路径必须由服务端生成，按当前用户隔离。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`UPLOAD_TOO_LARGE`、`UNSUPPORTED_MEDIA_TYPE`、`INTERNAL_ERROR`。

## 5. 计划

计划接口状态：日计划读取、添加和移除 action 已由 `TASK-PLAN-API-001` 实现；周计划生成、整周保存和页面联调仍由 `TASK-PLAN-WEEK-001`、`TASK-PLAN-FRONTEND-001` 完成。

### 5.1 获取周计划

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `GET /api/week-plans/{weekStartDate}` | `plans.week.get` | `server implemented` | `TASK-PLAN-FRONTEND-001` | 必须登录。 |

入参：

```json
{
  "weekStartDate": "2026-07-27"
}
```

出参：

```json
{
  "weekStartDate": "2026-07-27",
  "days": [
    {
      "id": "2026-07-27",
      "date": "2026-07-27",
      "weekday": "周一",
      "day": 27,
      "isToday": false,
      "meals": [
        {
          "type": "breakfast",
          "name": "早餐",
          "items": [
            {
              "id": "plan-recipe-id",
              "recipeId": "recipe-id",
              "title": "番茄炒蛋",
              "coverUrl": "",
              "duration": "15分钟",
              "calories": "320kcal",
              "source": "manual",
              "recipeDeleted": false,
              "ingredients": []
            }
          ]
        }
      ]
    }
  ],
  "warnings": []
}
```

用户隔离：按当前用户 ID 和 `weekStartDate` 查询；不得返回其他用户计划。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`INTERNAL_ERROR`。

### 5.2 生成周计划

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `POST /api/week-plans/generate` | `plans.week.generate` | `server implemented` | `TASK-PLAN-FRONTEND-001` | 必须登录。 |

入参：

```json
{
  "weekStartDate": "2026-07-27",
  "overwrite": false
}
```

出参：同获取周计划，必须包含 `warnings`。

```json
{
  "weekStartDate": "2026-07-27",
  "days": [],
  "warnings": [
    {
      "code": "INSUFFICIENT_BREAKFAST_RECIPES",
      "message": "早餐菜谱较少，已使用内置早餐组合补位。"
    }
  ]
}
```

业务规则：

- 已有计划且 `overwrite:false` 时返回 `CONFLICT`，前端展示覆盖确认。
- 生成时写入计划菜谱快照，快照至少包含菜名、封面、耗时、热量、食材、原菜谱 ID。
- 菜谱不足时允许生成不完整计划，并通过 `warnings` 说明。
- 不使用 AI 自动菜单，不读取用户偏好、忌口、人数设置。
- 当前 warning code 包括 `INSUFFICIENT_RECIPES`、`NO_BREAKFAST_RECIPES`、`NO_STAPLE_RECIPES`、`INCOMPLETE_MEAL_COMBINATION`。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`CONFLICT`、`INTERNAL_ERROR`。

### 5.3 保存整周计划

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `PUT /api/week-plans/{weekStartDate}` | `plans.week.save` | `missing` | `TASK-PLAN-API-001` | 必须登录。 |

入参：

```json
{
  "weekStartDate": "2026-07-27",
  "days": [
    {
      "date": "2026-07-27",
      "meals": [
        {
          "type": "breakfast",
          "items": [
            { "recipeId": "recipe-id", "source": "manual", "sortOrder": 1 }
          ]
        }
      ]
    }
  ]
}
```

出参：同获取周计划。

业务规则：服务端根据 `recipeId` 生成快照；不能接受客户端伪造完整快照作为唯一依据。若保留客户端快照用于兼容，也必须服务端校验归属。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`FORBIDDEN`、`NOT_FOUND`、`INTERNAL_ERROR`。

### 5.4 获取日计划

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `GET /api/day-plans/{date}` | `plans.day.get` | `server implemented` | `TASK-PLAN-FRONTEND-001` | 必须登录。 |

入参：

```json
{
  "date": "2026-07-27"
}
```

出参：

```json
[
  {
    "id": "breakfast",
    "name": "早餐",
    "recipes": []
  },
  {
    "id": "lunch",
    "name": "午餐",
    "recipes": []
  },
  {
    "id": "dinner",
    "name": "晚餐",
    "recipes": []
  }
]
```

业务规则：即使无计划，也固定返回早餐、午餐、晚餐三组空数组，便于页面空态稳定。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`INTERNAL_ERROR`。

### 5.5 保存日计划

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `PUT /api/day-plans/{date}` | `plans.day.save` | `missing` | `TASK-PLAN-API-001` | 必须登录。 |

入参：

```json
{
  "date": "2026-07-27",
  "meals": [
    {
      "type": "breakfast",
      "items": [
        { "recipeId": "recipe-id", "sortOrder": 1 }
      ]
    }
  ]
}
```

出参：同获取日计划。

业务规则：保存后同一周计划视图必须同步；写入时生成快照。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`FORBIDDEN`、`NOT_FOUND`、`INTERNAL_ERROR`。

### 5.6 添加菜谱到餐段

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `POST /api/day-plans/{date}/meals/{mealType}/recipes` | `plans.day.meal.recipes.add` | `server implemented` | `TASK-PLAN-FRONTEND-001` | 必须登录。 |

入参：

```json
{
  "date": "2026-07-27",
  "mealType": "lunch",
  "recipeId": "recipe-id",
  "sortOrder": 1
}
```

出参：

```json
{
  "id": "plan-recipe-id",
  "recipeId": "recipe-id",
  "title": "番茄炒蛋",
  "source": "manual",
  "recipeSnapshot": {
    "name": "番茄炒蛋",
    "coverUrl": "",
    "cookTimeMinutes": 15,
    "caloriesKcal": 320,
    "ingredients": []
  }
}
```

用户隔离：`recipeId` 必须属于当前用户；计划项写入当前用户对应日期和餐段。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`INTERNAL_ERROR`。

### 5.7 移除餐段菜谱

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `DELETE /api/day-plans/{date}/meals/{mealType}/recipes/{planRecipeId}` | `plans.day.meal.recipes.remove` | `server implemented` | `TASK-PLAN-FRONTEND-001` | 必须登录。 |

入参：

```json
{
  "date": "2026-07-27",
  "mealType": "lunch",
  "planRecipeId": "plan-recipe-id"
}
```

出参：

```json
{
  "deleted": true
}
```

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`FORBIDDEN`、`NOT_FOUND`、`INTERNAL_ERROR`。

### 5.8 移动或重排计划菜谱

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `PATCH /api/plan-recipes/{planRecipeId}/position` | `plans.items.move` | `server implemented` | 必须登录。 |

入参：

```json
{
  "planRecipeId": "plan-recipe-id",
  "targetDate": "2026-07-28",
  "targetMealType": "dinner",
  "targetSortOrder": 1
}
```

业务规则：只移动当前用户的计划项，不重建或修改 `recipe_snapshot`；用于持久化日/周视图长按拖拽。失败时页面重新读取服务端计划，回滚本地乐观位置。

## 6. 菜篮

菜篮持久化 action、服务端精确合并规则和小程序 remote adapter 已实现；实际运行由环境配置选择 mock 或 remote。

### 6.1 获取周菜篮

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `GET /api/baskets/{weekStartDate}` | `baskets.week.get` | `server implemented` | `TASK-BASKET-FRONTEND-001` | 必须登录。 |

入参：

```json
{
  "weekStartDate": "2026-07-27"
}
```

出参：

```json
{
  "weekStartDate": "2026-07-27",
  "lastSyncedAt": "2026-07-27T12:00:00.000Z",
  "groups": [
    {
      "id": "主料",
      "name": "主料",
      "showDivider": true,
      "items": [
        {
          "id": "basket-item-id",
          "name": "番茄",
          "category": "主料",
          "amount": "4",
          "amountText": "4个",
          "unit": "个",
          "checked": false,
          "source": "plan",
          "sourceRefs": []
        }
      ]
    }
  ],
  "warnings": []
}
```

用户隔离：按当前用户 ID 和 `weekStartDate` 查询唯一周菜篮。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`INTERNAL_ERROR`。

### 6.2 从计划同步菜篮

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `POST /api/baskets/{weekStartDate}/sync-from-plan` | `baskets.week.syncFromPlan` | `server implemented` | `TASK-BASKET-FRONTEND-001` | 必须登录。 |

入参：

```json
{
  "weekStartDate": "2026-07-27",
  "mode": "replace_plan_items",
  "dateRange": {
    "startDate": "2026-07-27",
    "endDate": "2026-08-02"
  }
}
```

出参：同获取周菜篮，必须包含同步 warnings。

业务规则：

- MVP 默认 `replace_plan_items`：删除旧计划来源项，保留手动项，再从当前周计划快照汇总。
- 只合并同名同单位且数字用量可解析的项。
- 名称和单位做透明的空白、大小写标准化；不做单位换算。
- 同名不同单位分行。
- 空单位只与空单位合并，合并后保留全部 `sourceRefs` 和首次出现顺序。
- 不可解析用量分行展示并保留 `amountText`。
- 计划中菜谱无食材时跳过该菜谱并返回 warning。
- 同步失败不能清空现有菜篮。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`NOT_FOUND`、`INTERNAL_ERROR`。

### 6.2.1 从菜谱详情添加至周菜篮

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `POST /api/baskets/{weekStartDate}/add-recipe` | `baskets.week.addRecipe` | `server implemented` | 必须登录。 |

入参只包含 `weekStartDate` 和 `recipeId`。服务端按可信 owner 重新读取菜谱，
不接受客户端食材、ownerId 或 userId。食材以 `manual` 来源和
`recipe_detail` 来源引用写入，因此计划同步不会删除；同一周同一菜谱重复添加幂等。

### 6.3 手动新增菜篮项

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `POST /api/baskets/{weekStartDate}/items` | `baskets.items.create` | `server implemented` | `TASK-BASKET-FRONTEND-001` | 必须登录。 |

入参：

```json
{
  "weekStartDate": "2026-07-27",
  "name": "猕猴桃",
  "category": "其他",
  "amount": "3",
  "amountText": "3个",
  "unit": "个",
  "sortOrder": 10
}
```

出参：

```json
{
  "id": "basket-item-id",
  "name": "猕猴桃",
  "category": "其他",
  "amount": "3",
  "amountText": "3个",
  "unit": "个",
  "checked": false,
  "source": "manual"
}
```

校验：`name` 必填；`category` 不在主料、辅料、调料时归入其他。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`INTERNAL_ERROR`。

### 6.4 修改菜篮项或勾选状态

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `PATCH /api/baskets/{weekStartDate}/items/{itemId}` | `baskets.items.update` | `server implemented` | `TASK-BASKET-FRONTEND-001` | 必须登录。 |

入参：

```json
{
  "weekStartDate": "2026-07-27",
  "itemId": "basket-item-id",
  "name": "猕猴桃",
  "amount": "4",
  "amountText": "4个",
  "unit": "个",
  "category": "其他",
  "checked": true
}
```

出参：更新后的菜篮项。

用户隔离：只能修改当前用户该周菜篮项。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`FORBIDDEN`、`NOT_FOUND`、`INTERNAL_ERROR`。

### 6.5 删除菜篮项

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `DELETE /api/baskets/{weekStartDate}/items/{itemId}` | `baskets.items.delete` | `server implemented` | `TASK-BASKET-FRONTEND-001` | 必须登录。 |

入参：

```json
{
  "weekStartDate": "2026-07-27",
  "itemId": "basket-item-id"
}
```

出参：

```json
{
  "deleted": true
}
```

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`FORBIDDEN`、`NOT_FOUND`、`INTERNAL_ERROR`。

### 6.6 批量勾选或取消勾选

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `PUT /api/baskets/{weekStartDate}/items/check-all` | `baskets.items.checkAll` | `server implemented` | `TASK-BASKET-FRONTEND-001` | 必须登录。 |

入参：

```json
{
  "weekStartDate": "2026-07-27",
  "checked": true,
  "source": "all"
}
```

出参：同获取周菜篮。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`INTERNAL_ERROR`。

## 7. 登录、当前用户和退出登录

登录 action 已实现。当前部署基于 CloudBase 小程序可信身份上下文，不额外签发应用 token。

### 7.1 微信登录

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `POST /api/auth/wechat-login` | `auth.wechatLogin` | `server implemented` | 真实环境人工冒烟 | 需要 CloudBase 可信微信身份，不要求已有本地用户态。 |

入参：

```json
{
  "agreedAgreementVersion": "2026-07-31",
  "profile": {
    "nickName": "半勺用户",
    "avatarUrl": "https://..."
  }
}
```

出参：

```json
{
  "user": {
    "id": "user-id",
    "nickName": "半勺用户",
    "avatarUrl": "https://...",
    "status": "active",
    "agreedAgreementVersion": "2026-07-31"
  }
}
```

业务规则：

- 服务端从 CloudBase 函数上下文读取 AppID、OpenID/UID，不信任客户端传入的 `code`、OpenID 或 userId。
- CloudBase 管理微信会话，本服务不另行签发 token；AppSecret 不进入小程序端。
- 首次登录必须记录已同意协议版本。
- 不获取手机号。
- 如果账号状态为 `cancel_requested`、`cancelled` 或 `blocked`，返回明确错误。

错误态：`INVALID_ARGUMENT`、`FORBIDDEN`、`CONFLICT`、`INTERNAL_ERROR`。

### 7.2 当前用户

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `GET /api/me` | `auth.me` | `server implemented` | 真实环境人工冒烟 | 必须具备 CloudBase 可信身份。 |

入参：

```json
{}
```

出参：

```json
{
  "id": "user-id",
  "nickName": "半勺用户",
  "avatarUrl": "https://...",
  "status": "active",
  "agreedAgreementVersion": "2026-07-29"
}
```

错误态：`UNAUTHENTICATED`、`FORBIDDEN`、`INTERNAL_ERROR`。

### 7.3 退出登录

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `POST /api/auth/logout` | `auth.logout` | `server implemented` | 真实环境人工冒烟 | 必须具备 CloudBase 可信身份。 |

入参：

```json
{}
```

出参：

```json
{
  "loggedOut": true
}
```

业务规则：本服务不持有独立 session/token；action 确认退出请求后，小程序清除本地用户态。CloudBase 微信身份仍由平台管理，退出不删除业务数据。

错误态：`UNAUTHENTICATED`、`INTERNAL_ERROR`。

## 8. 协议、隐私和注销申请

版本化协议读取和注销申请 action 已实现；小程序协议页使用同一版本的静态正文。

### 8.1 获取最新协议版本

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `GET /api/agreements/latest` | `agreements.latest` | `server implemented` | 法务文案确认 | 不要求登录。 |

入参：

```json
{}
```

出参：

```json
{
  "serviceAgreementVersion": "2026-07-31",
  "privacyPolicyVersion": "2026-07-31",
  "requiredAgreementVersion": "2026-07-31"
}
```

错误态：`INTERNAL_ERROR`。

### 8.2 获取协议正文

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `GET /api/agreements/{type}` | `agreements.get` | `server implemented` | 法务文案确认 | 不要求登录。 |

入参：

```json
{
  "type": "service",
  "version": "2026-07-29"
}
```

出参：

```json
{
  "type": "service",
  "version": "2026-07-29",
  "title": "用户服务协议",
  "content": "..."
}
```

枚举：`type` 为 `service` 或 `privacy`。

错误态：`INVALID_ARGUMENT`、`NOT_FOUND`、`INTERNAL_ERROR`。

### 8.3 提交注销申请

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `POST /api/account/cancel-request` | `account.cancelRequest.create` | `server implemented` | 真实环境人工冒烟 | 必须登录。 |

入参：

```json
{
  "reason": "不再使用"
}
```

出参：

```json
{
  "id": "cancel-request-id",
  "status": "submitted",
  "submittedAt": "2026-07-31T12:00:00.000Z"
}
```

业务规则：

- MVP 只要求入口、说明和申请记录，不自动完成全量数据清理。
- 同一用户已有 `submitted` 或 `processing` 申请时返回现有申请或 `CONFLICT`。
- MVP 提交时只写入可追踪申请，不立即锁定账号或删除数据；人工开始处理后可另行更新账号状态。

错误态：`UNAUTHENTICATED`、`INVALID_ARGUMENT`、`CONFLICT`、`INTERNAL_ERROR`。

### 8.4 获取小程序配置

| REST 语义 | action | 状态 | 依赖任务 | 鉴权 |
| --- | --- | --- | --- | --- |
| `GET /api/app-config` | `app.config.get` | `missing` | `TASK-COMPLIANCE-001` 或后续配置任务 | 不要求登录。 |

入参：

```json
{}
```

出参：

```json
{
  "recipePageSize": 20,
  "maxRecipePageSize": 50,
  "upload": {
    "maxImageBytes": 5242880,
    "maxImageLongSide": 1280,
    "allowedContentTypes": ["image/jpeg", "image/png", "image/webp"]
  }
}
```

说明：此接口不是 MVP 主路径阻塞项。本 MVP 不实现远程配置，固定上限保留在版本化本地 config 和服务端校验中，发布前由清单核对。

## 9. 健康检查

| REST 语义 | action | 状态 | 鉴权 |
| --- | --- | --- | --- |
| `GET /health/live` | 无 | `server implemented` | 不要求登录。 |
| `GET /health` / `GET /health/ready` | 无 | `server implemented` | 不要求登录。 |
| Cloud Function readiness | `health.ready` | `server implemented` | 不要求用户登录。 |

健康检查不得返回数据库连接串、密钥或用户数据。

## 10. 缺失接口与依赖任务

| 模块 | 缺失 action | 依赖任务 |
| --- | --- | --- |
| 计划 | `plans.week.save`、`plans.day.save` | `TASK-PLAN-FRONTEND-001` |
| 周计划生成 | 无 | 已由 `TASK-PLAN-WEEK-001` 实现，待前端联调。 |
| 菜篮 | 无 action 或前端适配缺口；真实环境配置与人工冒烟待提测执行 | `TASK-QA-MVP-001`、`TASK-RELEASE-001` |
| 登录 | 无 action 缺口；真实微信环境冒烟待执行 | `TASK-QA-MVP-001` |
| 协议/注销 | 无 action 缺口；法务文案和真实环境冒烟待执行 | `TASK-QA-MVP-001`、`TASK-RELEASE-001` |
| 配置 | `app.config.get` | `TASK-COMPLIANCE-001` 或后续配置任务 |

## 11. 验收清单覆盖

| MVP 验收能力 | 契约覆盖 |
| --- | --- |
| 登录、退出、当前用户 | `auth.wechatLogin`、`auth.me`、`auth.logout` |
| 协议、隐私、注销申请 | `agreements.latest`、`agreements.get`、`account.cancelRequest.create` |
| 菜谱分类增删改排 | `categories.*` |
| 菜谱列表、详情、新建、编辑、删除 | `recipes.*` |
| 图片上传 | `covers.upload` |
| 日计划查看、添加、移除 | `plans.day.*` |
| 周计划查看、保存、生成 warnings | `plans.week.*` |
| 菜篮同步、合并、勾选、新增、删除 | `baskets.*` |
| 用户隔离、写接口登录态、快照 | 通用约定 + 计划/菜篮业务规则 |
