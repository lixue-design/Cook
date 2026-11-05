# 前端设计保护 Harness

当前小程序前端已经有较完整的视觉和交互实现。后续开发的默认策略是：**保护现有设计，优先替换数据层，不重写页面。**

## 1. 设计基线

### 1.1 全局设计特征

当前前端设计以微信小程序原生 WXML/WXSS 为主，具有以下共同特征：

- 白色主背景。
- `PingFang SC` 字体。
- 自定义导航和自定义 Tab。
- 大量固定 rpx 尺寸，明显来自移动端设计稿。
- 多处 Figma 注释，如 `Figma 1:1129`、`Figma 118:4973`。
- 半屏弹窗统一使用 `components/half-screen-modal`。
- 通过 `tabBarHeight`、`safeAreaBottom`、`navigationBottom` 做安全区适配。

这些特征属于设计资产，后续不应随意改动。

### 1.2 页面设计资产

| 页面 | 必须保护的设计/交互 |
| --- | --- |
| 菜谱列表 | 顶部自定义导航、搜索按钮、管理按钮、浮动加号、新增菜谱半屏弹窗、分类管理弹窗、分类拖拽。 |
| 菜谱创建 | 自定义返回栏、分段表单、图片选择区、图片匹配提示、食材三组输入、步骤图片/文本输入、底部保存按钮。 |
| 菜谱详情 | 顶部返回按钮、头图区域、底部四操作栏、食材表格、步骤卡片、步骤图片预览。 |
| 计划页 | 日/周切换、顶部日期条、加菜篮快捷入口、餐段卡片、滑动删除、长按拖拽、周计划网格、空格点击添加。 |
| 菜篮页 | 顶部周切换、食材分组、勾选后排序、滑动删除、长按拖拽、新增食材半屏弹窗。 |
| 自定义 Tab | 4 Tab：菜谱、计划、菜篮、我的；保留高度和安全区处理。 |

### 1.3 组件设计资产

| 组件 | 保护点 |
| --- | --- |
| `half-screen-modal` | 遮罩、底部弹出、关闭动效、键盘避让、圆角。 |
| `floating-add` | 全局新增入口位置和形态。 |
| `date-range-switcher` | 周切换样式和左右切换行为。 |
| `add-recipe-plan-sheet` | 加计划日期/餐段选择体验。 |
| `plan-create-sheet` | 计划添加菜谱/备注入口。 |
| `recipe-catalog` | 菜谱列表的分类和卡片展示结构。 |

## 2. 修改优先级

后续接入真实服务时，按以下顺序尝试：

1. 只改 `services/`。
2. 只改页面 JS 的数据映射。
3. 小范围增加状态字段。
4. 小范围调整 WXML 条件渲染。
5. 最后才修改 WXSS。

若要改 WXML/WXSS，必须在任务卡中说明：

- 为什么 service 层无法解决。
- 会影响哪些页面状态。
- 如何做视觉回归。

## 3. 数据契约保护

### 3.1 菜谱列表契约

页面期望：

```js
groups = [
  {
    id,
    name,
    recipes: [
      { id, title, duration, calories, coverUrl, crop }
    ]
  }
]
```

真实 API 返回不同结构时，在 service 层转换。

### 3.2 菜谱详情契约

页面期望：

```js
recipe = {
  id,
  title,
  heroImage,
  duration,
  calories,
  ingredients: [{ group, display, items }],
  steps: [{ text, imageUrl }]
}
```

### 3.3 计划契约

日计划期望：

```js
mealPlans = [
  {
    id: 'breakfast' | 'lunch' | 'dinner',
    name: '早餐' | '午餐' | '晚餐',
    recipes: [{ id, title, coverUrl, duration, calories, source }]
  }
]
```

周计划期望：

```js
weeklyPlanDays = [
  {
    id,
    weekday,
    day,
    isToday,
    meals: [
      { type: 'breakfast' | 'lunch' | 'dinner', items: [{ id, title }], emptySlots: [] }
    ]
  }
]
```

### 3.4 菜篮契约

页面期望：

```js
groups = [
  {
    id,
    name,
    showDivider,
    items: [
      { id, name, amount, checked, source, category }
    ]
  }
]
```

## 4. 视觉回归要求

任何涉及小程序页面的 PR，至少检查：

- 页面首次加载态。
- 页面空态。
- 正常数据态。
- 失败态或接口失败提示。
- 半屏弹窗开合。
- 自定义 Tab 是否被弹窗正确遮挡。
- 安全区和底部按钮是否被遮挡。

重点页面：

- 菜谱列表。
- 菜谱创建。
- 菜谱详情。
- 计划页日视图。
- 计划页周视图。
- 菜篮页。

## 5. 手势与动效保护

不得无意破坏：

- 菜谱分类长按拖拽。
- 计划日视图卡片左滑移除。
- 计划日视图卡片长按拖拽。
- 计划周视图食物块拖拽。
- 菜篮食材勾选后重排。
- 菜篮食材左滑删除。
- 菜篮食材长按跨分组拖拽。
- 半屏弹窗开合动画。

若因接真实 API 必须调整交互，需先记录影响和替代方案。

## 6. 不应做的事

- 不为了接 API 重写页面布局。
- 不把已有 WXML/WXSS 替换成新的组件库风格。
- 不统一删除 rpx 固定尺寸。
- 不移除 Figma 对齐注释。
- 不把半屏弹窗改成普通页面跳转。
- 不把自定义 Tab 改回系统 Tab。
- 不把 mock 字段名直接暴露成后端强约束，适配应发生在 service 层。

