# Full PRD API 契约

本文定义 MVP 之后的原始 PRD 剩余能力 API。当前工程仍以 Cloud Function action 模式为主，REST 路径作为语义说明。

原 PRD 中涉及 AI 的能力，首版统一使用 `provider = "rules"` 的本地/服务端规则生成；接口预留
`provider = "ai"`，后续可以灰度切换，但不得改变主流程契约。

```js
wx.cloud.callFunction({
  name: apiConfig.cloudFunctionName,
  data: { action, payload }
})
```

## 1. 通用约定

### 1.1 响应格式

```json
{
  "ok": true,
  "data": {},
  "requestId": "req_xxx"
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "参数错误",
    "details": {}
  },
  "requestId": "req_xxx"
}
```

### 1.2 通用错误 code

| Code | 含义 |
| --- | --- |
| `UNAUTHENTICATED` | 未登录或可信身份缺失。 |
| `FORBIDDEN` | 无权限访问资源或管理员接口。 |
| `INVALID_ARGUMENT` | 入参非法。 |
| `NOT_FOUND` | 资源不存在或不属于当前用户。 |
| `CONFLICT` | 状态冲突，如已有计划、任务不可取消。 |
| `RATE_LIMITED` | 超出频率或成本限制。 |
| `DATABASE_UNAVAILABLE` | 数据库不可用。 |
| `INTERNAL_ERROR` | 未分类服务端错误。 |

### 1.3 鉴权和用户隔离

- 除协议读取、公开配置读取外，所有接口默认需要登录。
- 用户数据必须通过服务端可信身份解析 owner，不接受客户端传 `userId` 作为鉴权依据。
- 管理员接口必须使用独立管理员鉴权，不得只依赖小程序端入口隐藏。
- AI 模型密钥、对象存储密钥、数据库连接串不得出现在小程序端。

## 2. 规则优先的菜谱生成

生成任务结果必须先进入小程序编辑草稿；正式菜谱只能由用户确认后的 `recipes.create` 或
`recipes.update` 保存。任何生成 action 都不得直接创建、更新或删除正式菜谱。

### 2.1 创建生成任务

| REST | Action |
| --- | --- |
| `POST /api/generation/recipe-jobs` | `generation.recipeJobs.create` |

入参：

```json
{
  "sourceType": "link",
  "provider": "rules",
  "input": {
    "url": "https://example.com/recipe",
    "text": "",
    "imageFileId": ""
  },
  "clientDraftId": "draft_xxx"
}
```

规则：

- `sourceType` 为 `link`、`image`、`text`。
- `provider` 首版只允许 `rules`；后续可支持 `ai`。
- `link` 必须传 `url`。
- `image` 必须传已上传的临时图片 ID 或云存储 ID。
- `text` 必须传非空 `text`。
- 返回任务后不直接创建正式菜谱。
- `image + rules` 不能伪装成视觉识别；信息不足时必须要求用户补充菜名或说明。
- 首版 `create` 可同步执行 rules provider 并将任务落为 `succeeded` 或 `failed`；后续接 AI provider 时可改为 `pending/running` 异步执行，但响应字段保持不变。
- `provider=ai` 首版返回 `GENERATION_PROVIDER_UNAVAILABLE`，不得创建真实模型调用任务。

出参：

```json
{
  "jobId": "job_001",
  "status": "succeeded",
  "sourceType": "link",
  "provider": "rules",
  "resultDraft": {},
  "warnings": [],
  "error": null,
  "requestId": "req_xxx",
  "createdAt": "2026-08-05T10:00:00.000Z"
}
```

错误态：`INVALID_ARGUMENT`、`UNAUTHENTICATED`、`RATE_LIMITED`、`GENERATION_PROVIDER_UNAVAILABLE`。

### 2.2 查询生成任务

| REST | Action |
| --- | --- |
| `GET /api/generation/recipe-jobs/{jobId}` | `generation.recipeJobs.get` |

出参：

```json
{
  "jobId": "job_001",
  "status": "succeeded",
  "sourceType": "link",
  "provider": "rules",
  "resultDraft": {
    "title": "番茄炒蛋",
    "duration": 15,
    "calories": 320,
    "coverUrl": "",
    "mainIngredients": "番茄2个、鸡蛋3个",
    "sideIngredients": "",
    "seasonings": "盐少许",
    "steps": []
  },
  "warnings": [
    { "code": "LOW_CONFIDENCE", "message": "部分字段需要确认" }
  ],
  "error": null
}
```

`status` 可选：`pending`、`running`、`succeeded`、`failed`、`cancelled`。

错误态：`NOT_FOUND`、`FORBIDDEN`、`DATABASE_UNAVAILABLE`。

### 2.3 取消生成任务

| REST | Action |
| --- | --- |
| `POST /api/generation/recipe-jobs/{jobId}/cancel` | `generation.recipeJobs.cancel` |

规则：

- 只能取消 `pending` 或 `running` 任务。
- 已成功或失败任务不可取消。
- 取消只改变任务状态，不删除原始输入，便于排查和后续手动录入兜底。

### 2.4 生成专项错误 code

| Code | 含义 |
| --- | --- |
| `LINK_FETCH_FAILED` | 外链无法访问或抓取失败。 |
| `NOT_RECIPE_CONTENT` | 内容不像菜谱。 |
| `GENERATION_TIMEOUT` | 生成 provider 超时。 |
| `GENERATION_PROVIDER_UNAVAILABLE` | 生成 provider 不可用。 |
| `GENERATION_OUTPUT_INVALID` | provider 输出无法通过 schema 校验。 |
| `IMAGE_RULES_INPUT_INSUFFICIENT` | 图片规则解析信息不足，需要用户补充。 |
| `CONTENT_SAFETY_REJECTED` | 输入或输出被内容安全拦截。 |
| `LOW_CONFIDENCE` | 识别置信度低，返回部分字段。 |

## 3. AI 菜品图库

### 3.1 菜名匹配图片

| REST | Action |
| --- | --- |
| `GET /api/dish-images/match?name=` | `dishImages.match` |

出参：

```json
{
  "normalizedName": "番茄炒蛋",
  "matched": true,
  "image": {
    "assetId": "asset_001",
    "url": "cloud://...",
    "status": "ready",
    "source": "library"
  },
  "generationJobId": null
}
```

### 3.2 创建图片生成任务或占位任务

| REST | Action |
| --- | --- |
| `POST /api/dish-images/generate` | `dishImages.generate` |

入参：

```json
{
  "dishName": "番茄炒蛋",
  "reason": "library_miss"
}
```

规则：

- 首版 `provider=rules` 时不调用 AI 生图，返回占位图、图库缺失状态或运营待补状态。
- 后续 `provider=ai` 时，普通用户只能为当前编辑菜谱触发受限生图。
- 运营可为标准菜品主动生成或替换图片。
- 生成失败不得阻塞菜谱保存。

## 4. 图库运营接口

管理员 REST 接口必须独立鉴权。当前最小实现使用服务端 `ADMIN_API_TOKEN`，支持
`Authorization: Bearer <token>` 或 `x-admin-token`；未配置 token 时 `/api/admin/*` 默认关闭。
写接口可通过 `x-admin-actor`、`x-request-id`、body.reason 记录审计信息。

| REST | Action | 说明 |
| --- | --- | --- |
| `GET /api/admin/dish-images` | `admin.dishImages.list` | 查询图库资源。 |
| `PATCH /api/admin/dish-images/{id}` | `admin.dishImages.update` | 替换、下线、改状态。 |
| `POST /api/admin/dish-images/{id}/regenerate` | `admin.dishImages.regenerate` | 首版只置为待补。 |
| `POST /api/admin/dish-aliases` | `admin.dishAliases.create` | 新增同义词。 |

### 4.1 查询图库资源

查询参数：

```json
{
  "status": "READY",
  "q": "番茄",
  "limit": 50
}
```

出参：

```json
{
  "items": [
    {
      "id": "asset_uuid",
      "canonicalDishId": "dish_uuid",
      "dishName": "番茄炒蛋",
      "status": "READY",
      "storageKey": "ops/tomato.webp",
      "mimeType": "image/webp",
      "width": 768,
      "height": 768,
      "isCurrent": true
    }
  ]
}
```

### 4.2 更新图库资源

入参：

```json
{
  "status": "READY",
  "storageKey": "ops/tomato-v2.webp",
  "mimeType": "image/webp",
  "width": 1024,
  "height": 1024,
  "isCurrent": true,
  "reason": "replace blurry image"
}
```

规则：

- `status` 可选 `PENDING`、`READY`、`FAILED`、`RETIRED`。
- `READY` 必须包含有效 `storageKey`、`mimeType`、`width`、`height`。
- `isCurrent=true` 仅允许用于 `READY` 图片，同一标准菜品只保留一个当前图。
- 写操作必须记录 `admin_audit_logs`。

### 4.3 重新生成占位

首版不调用 AI provider，不创建真实模型任务，只把指定资产置为 `PENDING` 且 `isCurrent=false`。

出参：

```json
{
  "asset": { "id": "asset_uuid", "status": "PENDING", "isCurrent": false },
  "provider": "rules",
  "generationJobId": null,
  "message": "已进入运营待补状态，首版不调用 AI 生图"
}
```

### 4.4 新增同义词

入参：

```json
{
  "canonicalDishId": "dish_uuid",
  "rawName": "西红柿炒鸡蛋",
  "locale": "zh-CN",
  "reason": "ops alias"
}
```

规则：

- `rawName` 必须能标准化为非空菜名。
- 不能给 `MERGED` 标准菜品新增同义词。
- 写操作必须记录 `admin_audit_logs`。

## 5. 日计划增强与菜篮选择性同步

### 5.1 复刻历史日计划

| REST | Action |
| --- | --- |
| `POST /api/day-plans/{date}/clone` | `plans.day.clone` |

入参：

```json
{
  "sourceDate": "2026-08-01",
  "targetDate": "2026-08-05",
  "mode": "replace"
}
```

规则：

- `mode` 可选 `replace` / `merge`。
- `replace` 先清空目标日期日级计划，再复制源日期快照。
- `merge` 保留目标日期已有计划，把源日期各餐段追加到对应餐段末尾。
- 默认复制历史 `recipeSnapshot`，不自动刷新为当前菜谱。
- 源日期和目标日期不能相同。
- 返回目标日期三餐结构和 `sourceCount` / `clonedCount`。

### 5.2 选择性同步菜篮

| REST | Action |
| --- | --- |
| `POST /api/baskets/{weekStartDate}/sync-selected` | `baskets.week.syncSelected` |

入参：

```json
{
  "planRecipeIds": ["plan_recipe_1", "plan_recipe_2"],
  "mode": "replace_selected_plan_items"
}
```

规则：

- 只同步当前用户、当前周、指定计划项的食材。
- 首版保留手动新增项，并把计划来源菜篮项重建为选中的计划项集合。
- 同名同单位数字用量仍按现有合并规则处理。
- 找不到任何选中计划项时返回 `NOT_FOUND`，不得清空现有菜篮计划项。
- 找到部分选中项时同步已找到项，并返回 `PLAN_ITEM_NOT_FOUND` warning。

## 6. 月计划

月计划 API 必须遵守：日级计划是唯一事实表，周计划和月计划均从日级事实聚合；所有批量操作最终写入日级计划项快照。

### 6.0 用户饮食习惯

| REST | Action |
| --- | --- |
| `GET /api/plan-preferences` | `plans.preferences.get` |
| `PUT /api/plan-preferences` | `plans.preferences.update` |

入参：

```json
{
  "hasBreakfast": true,
  "breakfastPreference": "quick",
  "lunchPreference": "quick",
  "dinnerPreference": "balanced",
  "stapleFoods": ["米饭", "面"],
  "dislikedIngredients": ["香菜"],
  "servings": 2,
  "weekdayMaxCookTimeMinutes": 45,
  "weekendMaxCookTimeMinutes": 90
}
```

规则：

- 用户未设置时使用默认习惯。
- `hasBreakfast` 必须是布尔值；`servings` 范围为 1-12。
- `stapleFoods` 最多 12 项且不能为空；`dislikedIngredients` 最多 30 项。
- `weekdayMaxCookTimeMinutes` 范围为 5-240；`weekendMaxCookTimeMinutes` 范围为 5-360。
- 服务端必须通过可信身份解析 owner，不接受客户端传入 `userId` 作为鉴权依据。
- 用户未设置时使用默认习惯：吃早餐、早餐快手、午餐快手、晚餐均衡、主食米饭、2 人、工作日 45 分钟、周末 90 分钟。
- 计划生成必须读取这些偏好，但菜谱不足时可返回 warning 并放宽规则。
- 周计划生成联动 `hasBreakfast`、`dislikedIngredients`、`stapleFoods`、三餐偏好和工作日/周末耗时；人数先保留为后续食材份量扩展字段。

### 6.1 获取月计划聚合

| REST | Action |
| --- | --- |
| `GET /api/month-plans/{month}` | `plans.month.get` |

`month` 格式：`YYYY-MM`。

出参：

```json
{
  "month": "2026-08",
  "days": [
    {
      "date": "2026-08-05",
      "day": 5,
      "weekday": "周三",
      "weekStartDate": "2026-08-03",
      "meals": [
        { "type": "breakfast", "name": "早餐", "items": [] },
        { "type": "lunch", "name": "午餐", "items": [] },
        { "type": "dinner", "name": "晚餐", "items": [] }
      ]
    }
  ],
  "summary": {
    "totalDays": 31,
    "plannedDays": 1
  }
}
```

规则：

- 只读聚合日级计划事实，不创建月计划事实表。
- 返回的 `items` 使用现有计划快照映射，菜谱后续编辑不污染历史计划。

### 6.2 月度批量操作

| REST | Action | 说明 |
| --- | --- | --- |
| `POST /api/month-plans/{month}/fill-from-week` | `plans.month.fillFromWeek` | 将一周计划循环填充到月内空白周。 |
| `POST /api/month-plans/{month}/clear` | `plans.month.clear` | 清空整月或指定周次。 |
| `POST /api/month-plans/{month}/replace-recipe` | `plans.month.replaceRecipe` | 替换月内指定菜品。 |

批量操作入参必须包含 `confirmToken` 或等价二次确认标记，避免误删。

首版 `confirmToken` 固定为 `CONFIRM`。

清空入参：

```json
{
  "month": "2026-08",
  "startDate": "2026-08-01",
  "endDate": "2026-08-31",
  "confirmToken": "CONFIRM"
}
```

周复用入参：

```json
{
  "month": "2026-08",
  "sourceWeekStartDate": "2026-07-27",
  "startDate": "2026-08-01",
  "endDate": "2026-08-31",
  "confirmToken": "CONFIRM"
}
```

替换菜品入参：

```json
{
  "month": "2026-08",
  "fromRecipeId": "recipe_a",
  "toRecipeId": "recipe_b",
  "confirmToken": "CONFIRM"
}
```

规则：

- `clear` 只删除目标月份或指定日期范围内的日级计划项。
- `fillFromWeek` 只填充目标月份内空白日期，按星期复制源周对应日期的计划快照。
- `replaceRecipe` 只影响目标月份内 `fromRecipeId` 对应计划项，替换为 `toRecipeId` 当前菜谱快照。
- 所有操作返回 `operation` 摘要和最新 `month` 聚合结果。

### 6.3 月度统计

| REST | Action |
| --- | --- |
| `GET /api/month-plans/{month}/stats` | `plans.month.stats` |

入参：

```json
{
  "month": "2026-08",
  "startDate": "2026-08-01",
  "endDate": "2026-08-31"
}
```

出参：

```json
{
  "month": "2026-08",
  "startDate": "2026-08-01",
  "endDate": "2026-08-31",
  "totalDays": 31,
  "plannedDays": 30,
  "totalMealItems": 60,
  "uniqueRecipeCount": 24,
  "topIngredients": [
    { "name": "鸡蛋", "count": 8 }
  ],
  "emptyDates": ["2026-08-12"]
}
```

规则：

- 统计只读取目标月份或指定日期范围内的日级计划快照。
- `totalMealItems` 统计所有餐段计划项数量。
- `uniqueRecipeCount` 优先按菜谱 ID 去重；无菜谱 ID 时按快照原菜谱 ID 或快照菜名去重。
- `topIngredients` 只做轻量食材出现次数统计，不做复杂单位换算或营养素计算。
- `emptyDates` 表示全天三餐都没有计划项的日期。

### 6.4 月度模板

| REST | Action | 说明 |
| --- | --- | --- |
| `POST /api/month-plan-templates` | `plans.monthTemplates.create` | 保存模板。 |
| `GET /api/month-plan-templates` | `plans.monthTemplates.list` | 查询模板。 |
| `POST /api/month-plan-templates/{id}/apply` | `plans.monthTemplates.apply` | 应用模板。 |
| `DELETE /api/month-plan-templates/{id}` | `plans.monthTemplates.delete` | 删除模板。 |

创建入参：

```json
{
  "month": "2026-08",
  "name": "清淡月计划"
}
```

创建/列表出参项：

```json
{
  "id": "template_uuid",
  "name": "清淡月计划",
  "sourceMonth": "2026-08",
  "itemCount": 48,
  "createdAt": "2026-08-05T10:00:00.000Z",
  "updatedAt": "2026-08-05T10:00:00.000Z"
}
```

应用入参：

```json
{
  "templateId": "template_uuid",
  "targetMonth": "2026-09",
  "mode": "replace",
  "confirmToken": "CONFIRM"
}
```

应用出参：

```json
{
  "operation": {
    "templateId": "template_uuid",
    "targetMonth": "2026-09",
    "mode": "replace",
    "sourceItemCount": 48,
    "appliedCount": 45
  },
  "month": {}
}
```

规则：

- 模板保存当前 owner 指定月份的日级计划快照。
- 模板是快照来源，不是月计划事实表；应用模板最终写入日级 `meal_plans` / `meal_plan_recipes`。
- 应用模板必须要求 `confirmToken = "CONFIRM"`。
- 首版按月内日序号映射；模板第 1 天应用到目标月 1 日，目标月没有的日期自动跳过。
- `mode=replace` 先清空目标月份日级计划再写入模板快照；`mode=merge` 追加到已有餐段后。
- 若原菜谱已删除，应用时保留模板快照，计划项 `recipeId` 可为空。

## 7. 注销自动化与协议版本

### 7.1 用户侧注销申请

| REST | Action | 说明 |
| --- | --- | --- |
| `GET /api/account/cancel-request` | `account.cancelRequest.get` | 查看当前申请。 |
| `POST /api/account/cancel-request` | `account.cancelRequest.create` | 提交申请。 |
| `POST /api/account/cancel-request/cancel` | `account.cancelRequest.cancel` | 撤销申请。 |

状态：

```text
submitted -> reviewing -> approved -> processing -> completed
         -> rejected
         -> cancelled_by_user
         -> failed -> processing
```

用户侧返回：

```json
{
  "id": "request_uuid",
  "status": "submitted",
  "reason": "不再使用",
  "submittedAt": "2026-08-05T10:00:00.000Z",
  "updatedAt": "2026-08-05T10:00:00.000Z"
}
```

规则：

- 创建申请保持幂等；存在 `submitted`、`reviewing`、`approved`、`processing` 状态申请时返回现有申请。
- 用户只能撤销 `submitted` 或 `reviewing` 状态申请。
- 每次创建、撤销和后续管理员状态流转都必须写入 `account_cancel_audit_logs`。
- 用户侧接口只使用服务端可信 owner，不接受客户端 `userId` 作为鉴权依据。

### 7.2 管理员侧注销处理

| REST | Action | 说明 |
| --- | --- | --- |
| `POST /api/admin/account-cancel/{id}/review` | `admin.accountCancel.review` | 审核申请。 |
| `POST /api/admin/account-cancel/{id}/dry-run` | `admin.accountCancel.dryRun` | 生成处理清单。 |
| `POST /api/admin/account-cancel/{id}/execute` | `admin.accountCancel.execute` | 执行删除/匿名化。 |
| `GET /api/admin/account-cancel/{id}/logs` | `admin.accountCancel.logs` | 查看审计日志。 |

规则：

- `execute` 必须要求管理员鉴权、dry-run 记录和二次确认。
- 执行任务必须幂等。
- 删除/匿名化结果必须可审计。

### 7.3 协议版本

| REST | Action | 说明 |
| --- | --- | --- |
| `GET /api/agreements/latest` | `agreements.latest` | 获取最新协议。 |
| `POST /api/agreements/confirm` | `agreements.confirm` | 确认协议版本。 |
| `GET /api/me/agreement-status` | `agreements.myStatus` | 查询当前用户是否需重新确认。 |

最新协议出参：

```json
{
  "serviceAgreementVersion": "2026-08-05",
  "privacyPolicyVersion": "2026-08-05",
  "requiredAgreementVersion": "2026-08-05",
  "effectiveAt": "2026-08-05T00:00:00.000Z"
}
```

确认状态出参：

```json
{
  "agreedAgreementVersion": "2026-07-31",
  "requiredAgreementVersion": "2026-08-05",
  "requiresAgreementConfirm": true,
  "confirmedAt": null
}
```

确认入参：

```json
{
  "version": "2026-08-05"
}
```

规则：

- `agreement_versions` 是协议版本事实源；当前 required 版本只有一个。
- `agreements.latest` 和 `agreements.get` 可公开读取。
- `agreements.myStatus` 和 `agreements.confirm` 必须使用服务端可信 owner。
- `auth.me` 返回 `requiredAgreementVersion` 和 `requiresAgreementConfirm`，核心功能可据此拦截。
- `auth.wechatLogin` 和 `agreements.confirm` 只能确认当前 required 版本。
- 确认成功后更新 `app_users.agreed_agreement_version` 并写入 `user_agreement_confirmations`。

错误态：`AGREEMENT_CONFIRM_REQUIRED`、`INVALID_AGREEMENT_VERSION`、`INVALID_ARGUMENT`。
