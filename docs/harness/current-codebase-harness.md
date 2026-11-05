# 当前代码库 Harness

本文基于 2026-07-30 读取当前代码后的状态整理，用于指导后续开发：**保留现有小程序前端设计和交互，只在必要位置接入真实数据、补齐服务端能力和测试。**

## 1. 当前代码库判断

### 1.1 当前主应用

当前仓库主应用是微信小程序，而不是此前规划中的 `apps/miniprogram` 单独目录结构。

关键入口：

- 小程序配置：`app.json`
- 全局状态：`app.js`
- 全局样式：`app.wxss`
- 自定义 Tab：`custom-tab-bar/`
- 页面：`pages/`
- 组件：`components/`
- 小程序服务适配层：`services/`
- 工具函数：`utils/`
- 后端服务：`server/`
- 数据库迁移：`database/migrations/`
- React/Vite 原型：`src/`、`package.json`

后续任务默认以微信小程序为主，不应把 React/Vite 原型当作主实现入口。

### 1.2 已存在页面

`app.json` 当前注册页面：

| 页面 | 当前职责 | Harness 判断 |
| --- | --- | --- |
| `pages/recipe-list/index` | 菜谱列表、分类管理、新建入口、加入计划弹窗 | 已有成熟 UI 和交互，必须保留设计。 |
| `pages/meal-plan/index` | 日/周计划视图、添加菜谱、加菜篮、拖拽/滑动交互 | 已有复杂交互，优先替换数据层。 |
| `pages/shopping-list/index` | 菜篮分组、勾选、滑动删除、拖拽排序、新增食材 | 已有完整页面体验，优先接真实 API。 |
| `pages/profile/index` | 我的页 | 当前很薄，需要补登录/协议/注销。 |
| `pages/recipe-create/index` | 手动/文本模式编辑菜谱、图片匹配、步骤输入 | 已有表单设计，需补草稿和真实上传/保存稳定性。 |
| `pages/recipe-search/index` | 菜谱搜索 | 可保留作为选择/搜索入口。 |
| `pages/plan-create/index` | 计划创建入口 | 可结合现有 plan sheet 继续使用。 |
| `pages/recipe-detail/index` | 菜谱详情、底部操作栏、步骤预览、加入计划 | 已有完整详情设计，必须保留。 |

### 1.3 已存在组件

重点保护组件：

| 组件 | 用途 | 后续策略 |
| --- | --- | --- |
| `components/half-screen-modal` | 半屏弹窗、遮罩、开合动效、键盘适配 | 作为统一弹窗基座，不重写。 |
| `components/floating-add` | 浮动新增按钮 | 保留视觉位置和行为。 |
| `components/recipe-catalog` | 菜谱分类和卡片目录 | 作为列表主渲染组件。 |
| `components/plan-action-sheet` | 计划新增方式弹窗 | 保留，真实 AI 入口继续置灰或提示。 |
| `components/plan-create-sheet` | 计划添加菜谱/备注 | 接真实 API 时保留交互。 |
| `components/add-recipe-plan-sheet` | 日期/餐段选择 | 复用到详情和计划入口。 |
| `components/date-range-switcher` | 周切换 | 计划和菜篮共用，保持一致。 |
| `components/search-field` | 搜索输入 | 复用。 |
| `components/primary-action` | 主按钮 | 复用。 |

### 1.4 当前数据层状态

| 数据域 | 当前状态 | 后续方向 |
| --- | --- | --- |
| 菜谱 | `services/recipe-api.js` 默认指向 `recipe-api-mock`；`recipe-api-remote.js` 已有 Cloud Function 适配。 | 切换到真实 API 时优先改 service 适配层，避免重写页面。 |
| 分类 | mock 支持增删改排；server 侧已有 categories actions 和 RPC。 | 可先接真实 Cloud Function，再补缺口。 |
| 菜品图片 | `dish-image-api.js` 调本地图片库服务 `/api/dish-images/search`。 | 保留图片匹配体验，但 AI 生成不进入 MVP 主线。 |
| 计划 | `meal-plan-api.js` 支持 mock/remote 调度；remote 已覆盖日/周读取、添加、移除、拖拽移动和周生成。 | 配置真实云函数并完成微信开发者工具联调。 |
| 菜篮 | 服务端持久化、合并和同步事务已实现；小程序具备 mock/remote adapter，页面写操作失败后重拉。 | 配置真实环境并做开发者工具/真机冒烟。 |
| 用户/登录 | 已有 auth mock/remote adapter、登录页、协议勾选、核心 Tab 拦截、我的页用户态与退出登录；服务端使用 CloudBase 可信身份。 | 配置真实环境并完成首次登录/失效/退出人工冒烟。 |
| 合规 | 我的页、版本化协议/隐私页、注销说明与 owner-scoped 申请记录已实现。 | 法务文案确认与真实环境页面冒烟。 |

### 1.5 当前后端状态

当前 `server/` 主要包含：

- Health/readiness。
- AI 菜品图库搜索和图片读取。
- CloudBase runtime。
- 菜谱/分类 Cloud Function action：
  - `recipes.list`
  - `recipes.detail`
  - `recipes.create`
  - `recipes.update`
  - `recipes.delete`
  - `categories.list`
  - `categories.create`
  - `categories.rename`
  - `categories.delete`
  - `categories.reorder`
  - `covers.upload`

后端尚未完整覆盖：

- 日计划真实 API。
- 周计划生成真实 API。
- 计划菜谱快照。
- 周菜篮真实 API。
- 菜篮食材合并持久化。
- 协议/注销申请。

## 2. 最新执行原则

### 2.1 前端设计保护优先

后续实现不得以“接真实接口”为理由重写页面布局、组件结构或视觉风格。

优先顺序：

```text
保留 WXML/WXSS/组件交互
  -> 稳定页面数据结构
  -> 在 services 层适配真实 API
  -> 仅在必要时小范围调整页面 JS
  -> 最后才考虑 WXML/WXSS 变更
```

### 2.2 真实数据闭环优先

当前前端体验已经有雏形，后续优先补齐：

1. 菜谱/分类从 mock 切到 remote。
2. 日计划/周计划真实服务。
3. 菜篮真实服务。
4. 登录、用户态、协议、注销。

### 2.3 保持既有页面数据契约

页面现有字段命名应尽量保持：

- 菜谱列表：`groups[].recipes[]`
- 菜谱卡片：`id`、`title`、`duration`、`calories`、`coverUrl`、`crop`
- 菜谱详情：`recipe.heroImage`、`recipe.ingredients[]`、`recipe.steps[]`
- 日计划：`mealPlans[].recipes[]`
- 周计划：`weeklyPlanDays[].meals[].items[]`、`emptySlots`
- 菜篮：`groups[].items[]`

服务端字段可以不同，但必须在 service 层适配成页面现有结构。

## 3. 当前 Harness 路线

### 阶段 0：锁定设计基线

交付：

- 当前文档。
- `frontend-design-preservation.md`。
- PR checklist 中加入设计保护门禁。
- 后续任务卡默认引用设计保护文档。

### 阶段 1：菜谱/分类真实化

目标：保留 `pages/recipe-list`、`pages/recipe-create`、`pages/recipe-detail` UI，只把 mock 切到真实服务。

首批任务：

- `TASK-RECIPE-REMOTE-001`：确认 remote mode 开关与环境配置。
- `TASK-RECIPE-REMOTE-002`：菜谱列表/详情/创建/编辑/删除接 remote。
- `TASK-CATEGORY-REMOTE-001`：分类增删改排接 remote。
- 菜谱主流程视觉回归要求写入上述任务卡的「前端设计保护」章节。

### 阶段 2：计划真实化

目标：保留 `pages/meal-plan` 的日/周切换、拖拽、滑动删除、弹窗，只替换 mock 数据和内存状态。

首批任务：

- `TASK-PLAN-API-001`：日计划 API 和数据模型。
- `TASK-PLAN-WEEK-001`：周计划生成规则和 warnings。
- `TASK-PLAN-FRONTEND-001`：计划页接真实 API，保留 WXML/WXSS。
- 计划菜谱快照要求并入 `TASK-PLAN-API-001` 和 `TASK-PLAN-WEEK-001`。

### 阶段 3：菜篮真实化

目标：保留 `pages/shopping-list` 的分组、勾选、拖拽、滑动删除、新增食材设计。

首批任务：

- `TASK-BASKET-API-001`：周菜篮 API。
- `TASK-BASKET-MERGE-001`：服务端食材合并规则。
- `TASK-BASKET-FRONTEND-001`：菜篮页接真实 API。
- 菜篮交互回归要求写入上述任务卡的「前端设计保护」章节。

### 阶段 4：登录与合规

目标：补齐产品必需但当前较薄的登录、协议、注销入口。

首批任务：

- `TASK-AUTH-001`：微信登录与用户态。
- `TASK-COMPLIANCE-001`：协议、隐私、注销说明和申请。
- 我的页设计补齐并入 `TASK-COMPLIANCE-001`。

## 4. Agent 执行规则更新

Agent 接后续代码任务时必须先判断：

1. 是否会改 WXML/WXSS 或组件结构。
2. 是否会改变现有字段契约。
3. 是否能只改 service 层完成。
4. 是否需要补视觉回归说明。

若任务只是接真实 API，默认禁止重写页面结构。

## 5. 最新缺口清单

| 优先级 | 缺口 | 推荐 owner | Agent 可做 |
| --- | --- | --- | --- |
| P0 | 真实 API 开关和环境配置不清晰 | Tech Lead/后端 | 梳理配置、补 README |
| P0 | 计划仍是 mock/内存态 | 后端 | API、模型、单测 |
| P0 | 菜篮仍是 globalData/local 状态 | 后端 + 前端 | 服务端合并、前端 service 替换 |
| P0 | 登录/我的/合规薄弱 | PM + 前后端 | 页面骨架、接口和验收 |
| P1 | 前端视觉回归机制缺失 | 前端 + QA | 补 checklist、截图流程 |
| P1 | 首批任务卡已按当前代码拆分 | PM + Tech Lead | 后续按迭代补齐和维护 |
| P1 | OpenAPI/API 契约未统一 | 后端 | 文档和适配层 |
| P2 | 目录结构与规划不一致 | Tech Lead | 后续稳定后再整理 |

## 6. 后续任务默认模板补充

所有涉及小程序页面的任务卡必须额外包含：

```text
## 前端设计保护

- 是否改 WXML：是/否
- 是否改 WXSS：是/否
- 是否改组件结构：是/否
- 是否保持现有字段契约：是/否
- 视觉回归范围：
  - 页面：
  - 弹窗：
  - 手势：
  - 空态/加载态/失败态：
```

若答案中任一项为“是”，必须说明必要性和回归方式。
