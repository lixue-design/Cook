# 菜谱小程序 MVP 范围与实现拆解

本文基于《菜谱小程序产品需求文档》整理，目标是把产品描述收敛为可研发、可测试、可排期的 MVP 版本。

## 1. MVP 定位

### 1.1 产品目标

帮助家庭用户完成从「收藏/创建菜谱」到「安排一周吃什么」再到「生成采购清单」的基础闭环。

### 1.2 MVP 核心闭环

```text
微信登录 -> 新建菜谱 -> 管理菜谱库 -> 生成/编辑周计划 -> 查看日计划 -> 汇总菜篮 -> 勾选采购
```

### 1.3 MVP 设计原则

- 优先跑通真实用户闭环，延后复杂 AI、运营后台、月度复盘能力。
- 数据规则先清晰，智能推荐先简单可解释。
- 对历史计划和菜篮采用快照机制，避免菜谱编辑后篡改已确认内容。
- 首版以微信小程序单端为主，不做多端同步体验优化。

## 2. MVP 范围裁剪

### 2.1 MVP 必做范围

| 模块 | MVP 内容 | 说明 |
| --- | --- | --- |
| 登录 | 微信一键登录、退出登录 | 获取 OpenID；首次登录由系统分配预置头像和唯一默认用户名，不获取手机号。 |
| 菜谱分类 | 默认分类、分类新增/编辑/删除/排序 | 删除分类时菜谱归入「未分类」。 |
| 菜谱列表 | 左侧分类、右侧菜谱卡片、分页加载 | 支持按分类筛选、进入详情。 |
| 菜谱详情 | 头图、名称、耗时、热量、食材、步骤 | 支持编辑、删除、加入计划、加入菜篮。 |
| 新建/编辑菜谱 | 手动录入、文字生成、文字菜谱截图 OCR、受限的小红书公开链接导入、基础表单、食材录入、步骤录入、图片上传 | 所有生成结果均须先进入编辑页确认，不直接创建正式菜谱。 |
| 日计划 | 查看/编辑某日早餐、午餐、晚餐 | 支持添加菜谱、移除菜谱、进入菜谱详情。 |
| 周计划 | 一键生成本周计划、查看一周三餐 | 生成逻辑采用规则引擎，不接 AI。 |
| 菜篮 | 从日/周计划同步食材、合并同名食材、勾选采购 | MVP 以周菜篮为主。 |
| 我的 | 登录状态展示、协议入口、退出登录、账号自助注销 | 注销后有 7 天可撤回期，期满由服务端定时任务自动删除，无需人工逐条处理。 |
| 合规页面 | 用户服务协议、隐私政策静态页 | 满足小程序审核基础要求。 |

### 2.2 MVP 暂不做范围

| 模块 | 暂不做内容 | 原因 |
| --- | --- | --- |
| 通用外链解析 | 非小红书平台、需要登录或绕过限制的链接解析 | 仅支持受限的小红书公开链接；外链访问稳定性和版权/来源风险仍需单独评估。 |
| 非文字菜谱图片理解 | 成品菜照片、手写菜谱、复杂图文混排识别 | 需要视觉模型与异常兜底，当前 OCR 仅支持文字菜谱截图。 |
| AI 菜品图库匹配 | 同义词归一、AI 生图、全局图库复用 | 涉及图片生成、运营审核和素材库。 |
| 运营后台 | 图库运营、同义词管理、图片重生成 | 等用户规模和内容量起来后再做。 |
| 月计划 | 月历、批量复用、全局替换、月度统计 | 首版周计划已足够验证计划价值。 |
| 复杂历史复刻 | 过往日计划一键复刻 | 可以后续基于历史计划数据补。 |
| 菜谱分享/导入 | 其他外部平台一键转存、评论/图片/视频导入 | 当前仅提取小红书公开链接的标题和正文。 |

### 2.3 建议版本规划

| 版本 | 目标 | 主要能力 |
| --- | --- | --- |
| V0.1 原型版 | 跑通主流程 | 菜谱 CRUD、日计划、周菜篮，本地 mock 数据。 |
| V0.2 MVP 内测版 | 可真实使用 | 登录、云端存储、图片上传、周计划生成、菜篮勾选。 |
| V0.3 小程序审核版 | 可提交审核 | 协议、隐私、注销入口、错误兜底、埋点。 |
| V1.0 增强版 | 提升效率 | 非文字菜谱图片理解、更多外部平台的受限链接导入。 |
| V1.1 运营版 | 降低内容成本 | 菜品图库、同义词库、运营后台。 |

## 3. 需求问题清单

### 3.1 高优先级问题

| 编号 | 问题 | 影响 | 建议决策 |
| --- | --- | --- | --- |
| Q1 | 文档中「加计划」「加入菜篮」部分有删除线，但后续计划和菜篮依赖这些入口。是否 MVP 保留？ | 影响菜谱详情、列表卡片和计划闭环。 | MVP 保留详情页「加入计划」「加入菜篮」，列表卡片先不保留「加计划」。 |
| Q2 | 周计划、月计划标题和内容存在混用：4.3 写「周计划」，内容却包含月历和月计划。 | 影响页面范围和导航。 | MVP 只做周计划；月计划整体后置。 |
| Q3 | 「周菜篮」只有标题，没有详细规则。 | 影响采购清单核心闭环。 | MVP 定义为：按自然周汇总计划内菜谱食材，支持勾选、手动新增、删除。 |
| Q4 | 菜谱编辑后不自动同步历史计划和菜篮，但未说明未来计划是否同步。 | 影响数据一致性。 | 所有计划/菜篮均保存菜谱快照；编辑菜谱不影响已生成计划和菜篮。 |
| Q5 | 食材用量合并规则未定义，如「鸡蛋2个 + 鸡蛋100g」如何处理。 | 影响菜篮准确性。 | 同名同单位自动求和；同名不同单位分行展示，不强制换算。 |
| Q6 | 周计划生成是否允许用户选择人数、忌口、偏好？ | 影响生成算法和设置页面。 | MVP 不做偏好设置，只基于菜谱标签和规则生成。 |
| Q7 | 图片上传是否需要压缩，文档中留有疑问。 | 影响性能、存储和小程序体验。 | MVP 前端压缩到最长边 1280px，后端限制 5MB。 |
| Q8 | 微信登录后是否允许未登录使用本地菜谱？ | 影响准入和数据同步。 | MVP 强制登录后使用核心功能，未登录仅展示登录引导。 |

### 3.2 中优先级问题

| 编号 | 问题 | 影响 | 建议决策 |
| --- | --- | --- | --- |
| Q9 | 分类是否系统内置，如早餐、家常菜、快手菜？ | 影响冷启动体验。 | MVP 内置「全部」「未分类」，用户自建其他分类。 |
| Q10 | 热量字段是否用户手填，是否需要按份数计算？ | 影响表单复杂度。 | MVP 用户手填总 kcal，不做份数换算。 |
| Q11 | 菜谱是否支持多图步骤、视频步骤？ | 影响内容模型。 | MVP 单步骤最多 1 张图，不支持视频。 |
| Q12 | 日计划手动修改是否反向覆盖周计划？ | 影响同步逻辑。 | MVP 是：同一周计划下的日计划修改直接更新该周数据。 |
| Q13 | 删除菜谱后，历史计划展示什么？ | 影响历史回溯。 | 计划中保留菜谱快照，标记原菜谱已删除。 |
| Q14 | 菜篮是否支持跨周查看历史？ | 影响数据留存。 | MVP 支持按周查看当前及历史菜篮。 |
| Q15 | 空计划是否显示空白占位还是推荐生成按钮？ | 影响体验。 | 日计划空态展示「添加菜品」「生成本周计划」。 |

### 3.3 低优先级问题

| 编号 | 问题 | 建议 |
| --- | --- | --- |
| Q16 | 产品名称在「半勺/开火/食册」之间未定。 | MVP 工程名先用 `cook`，产品展示名用「半勺」占位。 |
| Q17 | 分类名称「最多 8 个字，超过 4 个字折行」规则略矛盾。 | 按最多 8 字处理，UI 自然换行。 |
| Q18 | 草稿「强杀重启恢复」需要本地缓存还是云草稿？ | MVP 用本地缓存，保存后清除。 |
| Q19 | 加载分页 20 条是否固定？ | 作为默认值，后端支持 pageSize 参数，上限 50。 |
| Q20 | 协议是否需要版本管理和二次确认？ | MVP 保留版本字段，先不做强制升级弹窗。 |

## 4. 页面拆解

### 4.1 页面清单

| 页面 | 路径建议 | MVP 功能 |
| --- | --- | --- |
| 登录页 | `/pages/login/index` | 微信快捷登录、协议勾选、协议入口。 |
| 菜谱列表页 | `/pages/recipes/index` | 分类栏、菜谱列表、分页、搜索入口预留、新建入口。 |
| 分类管理页 | `/pages/categories/index` | 新增、编辑、删除、排序分类。 |
| 新建/编辑菜谱页 | `/pages/recipe-edit/index` | 表单录入、图片上传、食材、步骤、保存草稿。 |
| 菜谱详情页 | `/pages/recipe-detail/index` | 展示菜谱，编辑、删除、加入计划、加入菜篮。 |
| 加入计划弹窗 | 组件 | 选择日期、餐段，确认加入。 |
| 日计划页 | `/pages/day-plan/index` | 日期切换、三餐分区、添加/移除菜品、同步菜篮。 |
| 周计划页 | `/pages/week-plan/index` | 周切换、一键生成、七天三餐概览、进入日计划。 |
| 选择菜谱页 | `/pages/recipe-picker/index` | 从菜谱库选择菜谱加入餐段。 |
| 周菜篮页 | `/pages/basket/index` | 周切换、食材列表、勾选采购、手动新增/删除。 |
| 我的页 | `/pages/profile/index` | 用户信息、协议入口、退出登录、注销入口。 |
| 协议页 | `/pages/agreement/index` | 用户服务协议、隐私政策。 |
| 账号注销说明页 | `/pages/account-cancel/index` | 注销风险说明、提交申请入口。 |

### 4.2 Tab 建议

| Tab | 页面 | 说明 |
| --- | --- | --- |
| 菜谱 | 菜谱列表页 | 产品主入口。 |
| 计划 | 周计划页 | 默认展示本周，可进入日计划。 |
| 菜篮 | 周菜篮页 | 采购执行入口。 |
| 我的 | 我的页 | 账号与合规。 |

### 4.3 核心用户流程

#### 4.3.1 新建菜谱流程

```text
菜谱列表 -> 点击 + -> 选择手动录入 -> 编辑页 -> 填写菜谱 -> 保存 -> 菜谱详情
```

关键状态：

- 空表单状态
- 图片上传中/失败
- 保存中/保存失败
- 未填写菜名拦截
- 退出未保存二次确认

#### 4.3.2 生成周计划流程

```text
周计划页 -> 点击生成本周计划 -> 后端按规则选择菜谱 -> 返回七天三餐 -> 用户手动调整 -> 保存
```

关键状态：

- 菜谱数量不足
- 早餐池不足
- 正餐菜谱不足
- 生成失败
- 覆盖已有计划二次确认

#### 4.3.3 同步菜篮流程

```text
日计划/周计划 -> 点击同步菜篮 -> 汇总计划菜谱食材 -> 合并同名同单位食材 -> 写入周菜篮 -> 菜篮页勾选采购
```

关键状态：

- 已存在菜篮时追加还是覆盖
- 部分菜谱无食材
- 同名不同单位分行
- 手动新增食材与计划食材同时展示

## 5. API 拆解

接口路径仅为建议，实际可按后端框架调整。所有接口默认需要登录态，除登录、协议类接口外。

### 5.1 认证与用户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/wechat-login` | 微信 code 换取登录态。 |
| POST | `/api/auth/logout` | 退出登录，清除服务端 session/token。 |
| GET | `/api/me` | 获取当前用户信息。 |
| POST | `/api/account/cancel-request` | 提交账号注销申请。 |

`POST /api/auth/wechat-login`

```json
{
  "code": "wx_login_code",
  "agreedAgreementVersion": "2026-07-29"
}
```

### 5.2 菜谱分类

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/recipe-categories` | 分类列表，含排序。 |
| POST | `/api/recipe-categories` | 新增分类。 |
| PATCH | `/api/recipe-categories/{categoryId}` | 修改分类名称。 |
| DELETE | `/api/recipe-categories/{categoryId}` | 删除分类，菜谱转入未分类。 |
| PUT | `/api/recipe-categories/sort` | 批量更新排序。 |

### 5.3 菜谱

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/recipes` | 分页查询菜谱。 |
| POST | `/api/recipes` | 创建菜谱。 |
| GET | `/api/recipes/{recipeId}` | 菜谱详情。 |
| PUT | `/api/recipes/{recipeId}` | 全量更新菜谱。 |
| DELETE | `/api/recipes/{recipeId}` | 删除菜谱。 |
| POST | `/api/uploads/recipe-image` | 上传菜谱/步骤图片。 |

`GET /api/recipes`

```text
categoryId?: string
keyword?: string
page?: number
pageSize?: number
```

`POST /api/recipes`

```json
{
  "name": "番茄炒蛋",
  "categoryId": "cat_001",
  "coverImageUrl": "https://example.com/image.jpg",
  "cookTimeMinutes": 15,
  "caloriesKcal": 320,
  "ingredients": [
    {
      "group": "main",
      "name": "番茄",
      "amount": "2",
      "unit": "个",
      "sortOrder": 1
    }
  ],
  "steps": [
    {
      "description": "番茄切块，鸡蛋打散。",
      "imageUrl": "",
      "sortOrder": 1
    }
  ]
}
```

### 5.4 计划

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/week-plans/{weekStartDate}` | 获取某周计划。 |
| POST | `/api/week-plans/generate` | 生成某周计划。 |
| PUT | `/api/week-plans/{weekStartDate}` | 保存整周计划。 |
| GET | `/api/day-plans/{date}` | 获取某日计划。 |
| PUT | `/api/day-plans/{date}` | 保存某日计划。 |
| POST | `/api/day-plans/{date}/meals/{mealType}/recipes` | 添加菜谱到餐段。 |
| DELETE | `/api/day-plans/{date}/meals/{mealType}/recipes/{planRecipeId}` | 移除餐段菜谱。 |

`POST /api/week-plans/generate`

```json
{
  "weekStartDate": "2026-07-27",
  "overwrite": false
}
```

生成返回需要包含 `warnings`，用于提示菜谱不足、重复规则被放宽等情况。

### 5.5 菜篮

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/baskets/{weekStartDate}` | 获取某周菜篮。 |
| POST | `/api/baskets/{weekStartDate}/sync-from-plan` | 从周计划同步菜篮。 |
| POST | `/api/baskets/{weekStartDate}/items` | 手动新增菜篮项。 |
| PATCH | `/api/baskets/{weekStartDate}/items/{itemId}` | 修改名称、用量、勾选状态。 |
| DELETE | `/api/baskets/{weekStartDate}/items/{itemId}` | 删除菜篮项。 |
| PUT | `/api/baskets/{weekStartDate}/items/check-all` | 批量勾选/取消勾选。 |

`POST /api/baskets/{weekStartDate}/sync-from-plan`

```json
{
  "mode": "merge",
  "dateRange": {
    "startDate": "2026-07-27",
    "endDate": "2026-08-02"
  }
}
```

`mode` 建议：

- `merge`：保留手动新增项，更新计划来源项。
- `replace_plan_items`：只替换计划来源项，保留手动项。
- MVP 默认使用 `replace_plan_items`，避免重复同步。

### 5.6 协议与配置

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/agreements/latest` | 获取最新协议版本。 |
| GET | `/api/agreements/{type}` | 获取协议正文。 |
| GET | `/api/app-config` | 获取小程序配置，如上传限制、分页大小。 |

## 6. 数据模型拆解

字段类型按关系型数据库表达，实际可映射为 MySQL/PostgreSQL/云开发数据库。

### 6.1 users

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | varchar | 用户 ID。 |
| openid | varchar | 微信 OpenID，唯一。 |
| unionid | varchar nullable | 微信 UnionID，可选。 |
| nickname | varchar | 系统默认名或用户主动编辑后的用户名。 |
| avatar_url | varchar | 预置头像路径或用户主动编辑后的头像。 |
| default_profile_code | char(4) nullable unique | 首次登录分配的 4 位无歧义英文数字码。 |
| default_avatar_preset | smallint nullable | 首次登录随机分配的预置头像编号，范围 1-6。 |
| status | enum | `active` / `cancel_requested` / `cancelled` / `blocked`。 |
| agreed_agreement_version | varchar | 已同意协议版本。 |
| created_at | datetime | 创建时间。 |
| updated_at | datetime | 更新时间。 |
| cancelled_at | datetime nullable | 注销完成时间。 |

### 6.2 recipe_categories

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | varchar | 分类 ID。 |
| user_id | varchar | 用户 ID。 |
| name | varchar | 分类名称，最多 8 个汉字。 |
| sort_order | int | 排序。 |
| is_default | boolean | 是否默认分类。 |
| created_at | datetime | 创建时间。 |
| updated_at | datetime | 更新时间。 |

默认分类：

- `cold`：爽口凉菜。
- `stir_fry`：家常小炒。
- `meat`：大口吃肉。
- `soup`：一碗鲜汤。
- `staple`：饱腹主食。
- `uncategorized`：未分类，不可删除。

### 6.3 recipes

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | varchar | 菜谱 ID。 |
| user_id | varchar | 用户 ID。 |
| category_id | varchar | 分类 ID。 |
| name | varchar | 菜品名称，最多 12 个汉字。 |
| cover_image_url | varchar nullable | 封面图。 |
| cook_time_minutes | int nullable | 烹饪耗时。 |
| calories_kcal | int nullable | 热量。 |
| source_type | enum | `manual` / `link_ai` / `image_ai` / `text_ai`，MVP 只用 `manual`。 |
| status | enum | `active` / `deleted`。 |
| created_at | datetime | 创建时间。 |
| updated_at | datetime | 更新时间。 |
| deleted_at | datetime nullable | 删除时间。 |

### 6.4 recipe_ingredients

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | varchar | 食材 ID。 |
| recipe_id | varchar | 菜谱 ID。 |
| group_type | enum | `main` / `side` / `seasoning`。 |
| name | varchar | 食材名称。 |
| amount | decimal nullable | 数字用量。 |
| amount_text | varchar | 原始展示用量，如 `少许`。 |
| unit | varchar nullable | 单位，如 `个`、`g`、`斤`。 |
| sort_order | int | 排序。 |
| created_at | datetime | 创建时间。 |

说明：

- MVP 表单提示用户使用「数字 + 单位」。
- 为兼容「少许」等文本，保留 `amount_text`，但菜篮只对 `amount + unit` 可解析项做自动求和。

### 6.5 recipe_steps

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | varchar | 步骤 ID。 |
| recipe_id | varchar | 菜谱 ID。 |
| description | text | 步骤描述，最多 500 字。 |
| image_url | varchar nullable | 步骤图。 |
| sort_order | int | 排序。 |
| created_at | datetime | 创建时间。 |

### 6.6 meal_plans

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | varchar | 计划 ID。 |
| user_id | varchar | 用户 ID。 |
| date | date | 日期。 |
| week_start_date | date | 自然周开始日期。 |
| meal_type | enum | `breakfast` / `lunch` / `dinner`。 |
| created_at | datetime | 创建时间。 |
| updated_at | datetime | 更新时间。 |

唯一约束建议：

```text
unique(user_id, date, meal_type)
```

### 6.7 meal_plan_recipes

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | varchar | 计划菜谱项 ID。 |
| meal_plan_id | varchar | 计划 ID。 |
| recipe_id | varchar nullable | 原菜谱 ID，菜谱删除后可为空或保留引用。 |
| recipe_snapshot | json | 菜谱快照，含名称、封面、食材、耗时、热量。 |
| sort_order | int | 同餐段排序。 |
| source | enum | `generated` / `manual`。 |
| created_at | datetime | 创建时间。 |

快照最少包含：

```json
{
  "name": "番茄炒蛋",
  "coverImageUrl": "",
  "cookTimeMinutes": 15,
  "caloriesKcal": 320,
  "ingredients": [
    {
      "group": "main",
      "name": "番茄",
      "amount": "2",
      "unit": "个"
    }
  ]
}
```

### 6.8 shopping_baskets

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | varchar | 菜篮 ID。 |
| user_id | varchar | 用户 ID。 |
| week_start_date | date | 周开始日期。 |
| status | enum | `active` / `archived`。 |
| last_synced_at | datetime nullable | 最近从计划同步时间。 |
| created_at | datetime | 创建时间。 |
| updated_at | datetime | 更新时间。 |

唯一约束建议：

```text
unique(user_id, week_start_date)
```

### 6.9 shopping_basket_items

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | varchar | 菜篮项 ID。 |
| basket_id | varchar | 菜篮 ID。 |
| name | varchar | 食材名称。 |
| amount | decimal nullable | 合计用量。 |
| amount_text | varchar | 展示用量。 |
| unit | varchar nullable | 单位。 |
| source | enum | `plan` / `manual`。 |
| source_refs | json | 来源菜谱/日期/餐段引用。 |
| checked | boolean | 是否已采购。 |
| sort_order | int | 排序。 |
| created_at | datetime | 创建时间。 |
| updated_at | datetime | 更新时间。 |

合并规则：

- `name + unit` 相同，且 `amount` 可解析为数字：自动求和。
- `name` 相同但 `unit` 不同：分行展示。
- `amount` 不可解析：分行展示，保留原始 `amount_text`。

### 6.10 account_cancel_requests

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | varchar | 申请 ID。 |
| user_id | varchar | 用户 ID。 |
| status | enum | `submitted` / `processing` / `completed` / `rejected`。 |
| reason | varchar nullable | 用户填写原因，可选。 |
| submitted_at | datetime | 提交时间。 |
| completed_at | datetime nullable | 完成时间。 |

## 7. 周计划生成 MVP 规则

### 7.1 菜谱标签生成

MVP 不提供用户手动打标；服务端在菜谱创建、编辑及历史回填时，将下列可解释标签写入菜谱的 `system_tags`。每项记录来源和可信度，周计划直接读取这份持久化标签；标签缺失时才按同一规则兼容推断。

| 标签 | 判断规则 | 标签来源 |
| --- | --- | --- |
| 早餐候选 | 菜名包含粥、包子、吐司、燕麦、豆浆、三明治、面包、牛奶、鸡蛋、玉米。 | 菜名或分类 |
| 主食 | 菜名或食材包含饭、面、粥、馒头、面包、饺子、馄饨、玉米、杂粮。 | 菜名优先，其次食材 |
| 一餐完成 | 菜名包含炒饭、盖饭、焖饭、面、饺子、馄饨、三明治。 | 菜名 |
| 蛋白质菜 | 菜名或食材包含鸡蛋、鸡、牛、猪、鱼、虾、豆腐等。 | 菜名优先，其次食材 |
| 素菜 | 菜名或食材包含番茄/西红柿、西兰花、包菜、黄瓜、豆角及常见蔬菜。 | 菜名优先，其次食材；西红柿归一为番茄 |
| 烹饪方式 | 炒、蒸、炖/焖、拌。 | 菜名优先，其次步骤 |
| 快手菜 | 耗时小于等于 30 分钟；耗时为空时按默认规则标低可信度快手。 | 耗时或默认规则 |
| 周末菜 | 耗时大于等于 45 分钟。 | 耗时 |

### 7.2 生成策略

- 早餐：优先早餐候选；同一道早餐最多 2 次，至少间隔 2 天。
- 工作日午/晚餐：优先「一荤一素一主食」或「一餐完成」。
- 周末午/晚餐：每天最多 1 道周末菜，其他用普通菜补足。
- 重复控制：同菜名不重复；菜谱不足时允许间隔 2 天后重复。
- 内置补位：早餐可用内置组合，主食可用米饭。

### 7.3 生成失败兜底

| 场景 | 兜底 |
| --- | --- |
| 用户菜谱少于 5 个 | 提示「菜谱较少，已为你生成基础计划，可继续添加菜谱丰富搭配」。 |
| 无早餐菜谱 | 使用内置早餐组合。 |
| 无主食 | 使用内置「米饭」。 |
| 无法组成一荤一素 | 使用已有正餐菜谱填充，并返回 warning。 |

## 8. 研发任务建议

### 8.1 第一批：基础闭环

- 初始化小程序工程和后端工程。
- 实现微信登录与用户表。
- 实现菜谱分类 CRUD。
- 实现菜谱 CRUD、图片上传、详情展示。
- 实现新建/编辑菜谱页。

### 8.2 第二批：计划闭环

- 实现日计划数据模型和接口。
- 实现周计划生成规则。
- 实现周计划页、日计划页、选择菜谱页。
- 实现计划菜谱快照。

### 8.3 第三批：菜篮闭环

- 实现菜篮数据模型和接口。
- 实现从计划同步菜篮。
- 实现食材合并规则。
- 实现勾选、手动新增、删除。

### 8.4 第四批：审核与体验

- 实现我的页、协议页、注销说明页。
- 完善空态、错误态、加载态。
- 补充埋点和日志。
- 做小程序审核前合规检查。

## 9. MVP 验收标准

### 9.1 菜谱

- 用户可创建、编辑、删除菜谱。
- 菜谱可包含封面、耗时、热量、三类食材、多步骤。
- 删除分类后，分类下菜谱自动进入未分类。
- 删除菜谱后，已生成计划仍能展示快照。

### 9.2 计划

- 用户可生成本周三餐计划。
- 用户可手动添加、移除任意餐段菜谱。
- 日计划修改后，周计划同步更新。
- 菜谱不足时有明确提示，不阻塞生成。

### 9.3 菜篮

- 用户可从周计划生成周菜篮。
- 同名同单位食材自动合并。
- 同名不同单位食材分行展示。
- 用户可勾选、取消勾选、手动新增、删除食材。

### 9.4 合规

- 首次登录前展示协议同意。
- 用户可查看用户服务协议和隐私政策。
- 用户可退出登录。
- 用户可进入账号注销说明并提交注销申请。
