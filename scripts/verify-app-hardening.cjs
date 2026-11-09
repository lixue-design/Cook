'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const states = [
  ['pages/recipe-list/index.wxml', ["status === 'loading'", "status === 'empty'", '食谱加载失败', 'onRetryLoad']],
  ['pages/recipe-detail/index.wxml', ["status === 'loading'", "status === 'empty'", '食谱加载失败', 'onRetryLoad']],
  ['pages/meal-plan/index.wxml', ["dayStatus === 'loading'", "dayStatus === 'error'", 'weeklyLoading', 'weeklyError', 'retryDayPlan', 'retryWeeklyPlan']],
  ['pages/shopping-list/index.wxml', ["status === 'loading'", "status === 'empty'", '菜篮加载失败', 'onRetryLoad']],
  ['pages/profile/index.wxml', ["status === 'loading'", "status === 'loggedOut'", 'account-more-arrow.svg']],
  ['pages/about/index.wxml', ['用户协议', '隐私协议', '账号注销', '退出登录']],
  ['pages/feedback/index.wxml', ['反馈内容', '上传图片', '最多 3 张', '保存反馈']],
  ['pages/profile-edit/index.wxml', ['头像', '用户名', '保存']],
  ['pages/account-cancel/index.wxml', ['申请注销账号', '账号注销中']]
];
for (const [file, tokens] of states) {
  const source = read(file);
  for (const token of tokens) assert.ok(source.includes(token), `${file} missing ${token}`);
}

assert.ok(read('pages/recipe-list/index.wxml').includes('class="recipe-skeleton"'), 'recipe loading must render a recipe-shaped skeleton');
assert.ok(read('pages/meal-plan/index.wxml').includes('class="plan-day-skeleton"'), 'day plan loading must render a meal-shaped skeleton');
assert.ok(read('pages/meal-plan/index.wxml').includes('class="plan-week-skeleton"'), 'week plan loading must render a grid-shaped skeleton');
assert.ok(read('pages/shopping-list/index.wxml').includes('class="basket-skeleton"'), 'basket loading must render a checklist-shaped skeleton');

const recipeCreateStyles = read('pages/recipe-create/index.wxss');
const dayPlanSeparatorStyles = read('pages/meal-plan/index.wxss');
assert.match(recipeCreateStyles, /\.editor-line \{[^}]*border-top: 1rpx solid #EBEDF2;/, 'recipe editor separators must use the auxiliary line border');
assert.match(recipeCreateStyles, /\.editor-navigation \{[^}]*border-bottom: 1rpx solid #EBEDF2;/, 'recipe editor navigation separator must use the auxiliary line border');
assert.match(recipeCreateStyles, /\.editor-footer \{[^}]*border-top: 1rpx solid #EBEDF2;/, 'recipe editor footer separator must use the auxiliary line border');
assert.match(dayPlanSeparatorStyles, /\.top-area--day::after \{[\s\S]*?border-top: 1rpx solid #EBEDF2;/, 'day plan header separator must use the auxiliary line border');
assert.match(dayPlanSeparatorStyles, /\.meal-divider \{[^}]*border-top: 1rpx solid #EBEDF2;/, 'day meal separators must use the auxiliary line border');
assert.match(dayPlanSeparatorStyles, /\.meal-gap \{[^}]*height: 48rpx;/, 'day meal gaps must keep dividers aligned to the same pixel grid as the calendar divider');
assert.ok(read('pages/meal-plan/index.wxml').includes('class="meal-gap"><view class="meal-divider"'), 'day plan meal gaps must render a real divider layer');

const browsePages = [
  'pages/recipe-list/index.js',
  'pages/recipe-detail/index.js',
  'pages/meal-plan/index.js',
  'pages/shopping-list/index.js'
];
for (const file of browsePages) {
  const source = read(file);
  assert.ok(!/on(?:Load|Show)\([^)]*\)\s*\{\s*if \(!requireAuthenticated\(\)\) return;/.test(source), `${file} must allow guest browsing`);
  assert.ok(read(file).includes('requireAuthenticated'), `${file} missing auth guard`);
}
assert.ok(!read('pages/month-plan/index.js').includes('requireAuthenticated'), 'month plan browsing must not require login');

const mutationGuards = [
  ['pages/recipe-list/index.js', ['onOpenCreateSheet', 'onCategoryDialogConfirm', 'onConfirmAddPlan']],
  ['pages/recipe-detail/index.js', ['onAddToBasket', 'onBasketWeekChange', 'onEdit', 'onMoreActionAfterClose']],
  ['pages/meal-plan/index.js', ['onBasketTap', 'onPlanCreateConfirm', 'onGenerateWeekPlan']],
  ['pages/shopping-list/index.js', ['onToggleIngredient', 'onIngredientDialogConfirm', 'clearCurrentWeekBasket']]
];
for (const [file, methods] of mutationGuards) {
  const source = read(file);
  for (const method of methods) {
    const match = new RegExp(`\\n\\s+(?:async\\s+)?${method}\\([^)]*\\)\\s*\\{`).exec(source);
    const start = match ? match.index : -1;
    assert.ok(start >= 0, `${file} missing ${method}`);
    assert.ok(source.slice(start, start + 180).includes('requireAuthenticated'), `${file} ${method} missing auth guard`);
  }
}

const dangerousActions = [
  ['pages/recipe-detail/index.js', '确定删除菜谱？'],
  ['pages/meal-plan/index.js', '覆盖本周计划？'],
  ['pages/meal-plan/index.js', '清空当天计划？'],
  ['pages/meal-plan/index.js', '清空本周计划？'],
  ['pages/profile/index.js', '退出登录？'],
  ['pages/account-cancel/index.js', '确认提交注销申请？']
];
for (const [file, prompt] of dangerousActions) {
  assert.ok(read(file).includes(prompt), `${file} missing confirmation: ${prompt}`);
}

const shoppingList = read('pages/shopping-list/index.js');
assert.ok(shoppingList.includes('deleteShoppingItem'), 'shopping list must delete an item');
assert.ok(!shoppingList.includes('移除这个食材？'), 'shopping list deletion must not require confirmation');
const recipeListStyles = read('pages/recipe-list/index.wxss');
const shoppingListStyles = read('pages/shopping-list/index.wxss');
assert.ok(recipeListStyles.includes('left: 50%;') && recipeListStyles.includes('transform: translateX(-50%);'), 'recipe empty illustration must be exactly horizontally centered');
assert.ok(shoppingListStyles.includes('.basket-empty-illustration { display: block; width: 336rpx; height: 336rpx; align-self: center; }'), 'basket empty illustration must use the same centered layout rule');
const recipeSearchResultsMarkup = read('components/recipe-search-results/index.wxml');
const recipeSearchResultsStyles = read('components/recipe-search-results/index.wxss');
assert.ok(recipeSearchResultsMarkup.includes('class="search-result-image" src="{{item.coverUrl}}" mode="aspectFill" lazy-load="{{true}}"'), 'search result covers must fill the frame and defer offscreen requests');
assert.ok(!recipeSearchResultsMarkup.includes('item.crop.width'), 'search result covers must not use legacy shrunken crop dimensions');
assert.ok(recipeSearchResultsStyles.includes('width: 100%; height: 100%;'), 'search result covers must fill their cover frame');
const mealPlan = read('pages/meal-plan/index.js');
assert.ok(!mealPlan.includes('移除这条计划？'), 'plan item deletion must not require confirmation');
assert.ok(mealPlan.includes("title: '已加入本周菜篮'"), 'plan basket sync toast must match product copy');
assert.ok(!mealPlan.includes("destructive: true"), 'clear week action must use the default action-sheet color');
assert.ok(mealPlan.includes('onGridDateTap(event)'), 'weekly dates must have a date-switch handler');
assert.ok(mealPlan.includes("persistPlanViewMode('day')"), 'weekly date taps must open the corresponding daily plan and persist the selected view');
const appSource = read('app.js');
assert.ok(appSource.includes("planViewMode: 'week'"), 'plan view should default to the weekly view');
assert.ok(appSource.includes("wx.getStorageSync('cook.planViewMode')"), 'app launch should restore the saved plan view');
assert.ok(mealPlan.includes("wx.setStorageSync('cook.planViewMode', planMode)"), 'plan view changes should persist for later visits');
assert.ok(mealPlan.includes('fetchWeekDates(targetWeekOffset)'), 'weekly date taps must load the target week for the daily calendar');
assert.ok(mealPlan.includes('fetchWeeklyPlan(this.weekRangeOffset)'), 'plan drag operations must refresh the weekly view from the shared data source');
assert.ok(mealPlan.includes("const dailyRangeChanged = planMode === 'day' && this.weekOffset !== this.weekRangeOffset"), 'switching back to day mode must keep the currently viewed week');
assert.ok(mealPlan.includes("title: '菜谱已不存在'"), 'missing recipes in day plan must provide feedback');
assert.ok(mealPlan.includes('resolveWeekFoodRecipeId(recipeId, title)'), 'weekly recipe actions must resolve the saved recipe ID before relying on the catalog');
assert.ok(mealPlan.includes('weekFoodActionCanView: Boolean(resolvedRecipeId)'), 'weekly recipe actions must know when the recipe exists');
assert.ok(mealPlan.includes("{ label: '查看详情', value: 'view' }"), 'weekly recipe actions must use the Figma detail label');
const mealPlanStyles = read('pages/meal-plan/index.wxss');
assert.ok(mealPlanStyles.includes('.grid-date { display: flex; align-items: center; justify-content: center;'), 'today date circle must center its content');
const mealPlanMarkup = read('pages/meal-plan/index.wxml');
assert.ok(mealPlanMarkup.includes('actions="{{weekFoodActionActions}}"'), 'weekly recipe action must only render the available actions');
const actionSheet = read('components/action-sheet/index.wxml');
const actionSheetStyles = read('components/action-sheet/index.wxss');
assert.ok(actionSheet.includes('class="action-sheet-title"'), 'action sheet must render an optional Figma title row');
assert.ok(actionSheetStyles.includes('height: 104rpx;'), 'action sheet rows must match the 52px Figma rhythm');

const profileMarkup = read('pages/profile/index.wxml');
const profileStyles = read('pages/profile/index.wxss');
assert.ok(!profileMarkup.includes('<text>更多</text>'), 'profile menu must only contain the two Figma rows');
assert.ok(profileMarkup.includes('class="account-more-arrow"'), 'logged-in profile must retain access to account actions through the Figma account-row arrow');
assert.ok(profileStyles.includes('height: 208rpx;'), 'profile card must match the 104px Figma height');
assert.ok(profileStyles.includes('border-radius: 12rpx;'), 'profile card must match the 6px Figma radius');
assert.ok(profileStyles.includes('calc((208rpx - 1rpx) / 2)'), 'profile rows must exactly share the card height around its 0.5px divider');
const aboutPage = read('pages/about/index.js');
const aboutMarkup = read('pages/about/index.wxml');
const aboutStyles = read('pages/about/index.wxss');
assert.ok(aboutPage.includes("wx.navigateTo({ url: '/pages/account-cancel/index' })"), 'about page must retain the account cancellation entry');
assert.ok(aboutPage.includes("title: '退出登录？'"), 'about page logout must require confirmation');
assert.ok(aboutMarkup.includes('/assets/about/back.svg'), 'about page must use the Figma back icon');
assert.ok(aboutStyles.includes('height: 318rpx;') && aboutStyles.includes('height: 90rpx;'), 'about page card and logout button must match the Figma dimensions');
const feedbackPage = read('pages/feedback/index.js');
const feedbackMarkup = read('pages/feedback/index.wxml');
assert.ok(feedbackPage.includes("wx.chooseMedia"), 'feedback page must allow optional image selection');
assert.ok(feedbackPage.includes("count: remaining"), 'feedback page must limit image selection to the remaining slots');
assert.ok(feedbackPage.includes("title: '请填写反馈内容'"), 'feedback page must require feedback text before submission');
assert.ok(feedbackMarkup.includes('images.length < 3'), 'feedback page must cap image attachments at three');
const profileEditPage = read('pages/profile-edit/index.js');
const profileEditMarkup = read('pages/profile-edit/index.wxml');
assert.ok(profileEditPage.includes('readUser()'), 'profile edit page must prefill the current profile');
assert.ok(profileEditPage.includes('wx.chooseMedia'), 'profile edit page must allow a user-selected avatar');
assert.ok(profileEditPage.includes('setUser({'), 'profile edit page must persist edits to the current local profile');
assert.ok(profileEditMarkup.includes("avatarUrl || '/assets/profile/default-avatar.svg'"), 'profile edit page must render the current avatar or its default');
assert.ok(read('pages/profile/index.js').includes("wx.navigateTo({ url: '/pages/profile-edit/index' })"), 'profile account row must open profile editing');

const recipeDraft = read('utils/recipe-draft.js');
assert.ok(recipeDraft.includes('菜品名称不能超过12个字'), 'recipe validation must enforce the 12-character name limit');
const recipeDetailPage = read('pages/recipe-detail/index.js');
assert.ok(recipeDetailPage.includes("replace(/\\s*[，,]\\s*/g, '、')"), 'recipe detail ingredient displays must normalize commas to enumeration commas');

const detail = read('pages/recipe-detail/index.js');
assert.ok(detail.includes('addRecipeToShoppingList'));
assert.ok(!detail.includes('addIngredientGroupsToWeekBasket'));

const recipeListPage = read('pages/recipe-list/index.js');
const recipeListMarkup = read('pages/recipe-list/index.wxml');
assert.ok(recipeListPage.includes("onOpenCreateSheet() {\n    if (!requireAuthenticated()) return;\n    this.setData({\n      createSheetMode: 'choose',"), 'recipe list floating add must open the create recipe sheet');
assert.ok(recipeListMarkup.includes('wx:if="{{createSheetMode === \'choose\'}}"'), 'recipe list must retain the create recipe choices');
assert.ok(recipeListPage.includes("const SYSTEM_CATEGORY_NAME = '未分类'"), 'uncategorized category must be treated as a system fallback');
assert.ok(recipeListPage.includes('const manageCategories = categories.filter(isManageableCategory);'), 'category management must exclude the system fallback');
assert.ok(recipeListPage.includes('this.data.manageCategories.find'), 'rename and delete must only target manageable categories');
assert.ok(recipeListMarkup.includes('wx:for="{{manageCategories}}"'), 'category management dialog must not render uncategorized');

const tabBar = read('custom-tab-bar/index.js');
const appConfig = read('app.json');
const recipeCatalogMarkup = read('components/recipe-catalog/index.wxml');
const recipeCatalogStyles = read('components/recipe-catalog/index.wxss');
assert.ok(tabBar.includes("text: '食谱'"), 'custom tab bar must use 食谱 as the recipe label');
assert.ok(appConfig.includes('"text": "食谱"'), 'app tab configuration must use 食谱 as the recipe label');
assert.ok(recipeCatalogMarkup.includes('<image class="catalog-cover" src="{{recipe.coverUrl}}" mode="aspectFill" lazy-load="{{true}}" />'), 'recipe catalog covers must fill the square frame and defer offscreen requests');
assert.ok(!recipeCatalogMarkup.includes('class="catalog-cover" style="width: {{recipe.crop.width}}px;'), 'recipe catalog must not compress non-square covers using list crop dimensions');
assert.ok(recipeCatalogStyles.includes('.catalog-cover { position: absolute; top: 0; left: 0; display: block; width: 100%; height: 100%; }'), 'recipe catalog cover must fully occupy its square frame');

const recipeDetailStyles = read('pages/recipe-detail/index.wxss');
assert.ok(recipeDetailStyles.includes('overflow: visible;'), 'recipe detail bottom actions must not clip long labels');
assert.ok(recipeDetailStyles.includes('min-width: 84rpx;'), 'recipe detail long action labels must have enough visible width');
const recipeDetailMarkup = read('pages/recipe-detail/index.wxml');
assert.ok(recipeDetailMarkup.includes('<picker class="basket-week-picker" mode="selector"'), 'recipe detail basket entry must use the native week selector');
assert.ok(!recipeDetailMarkup.includes('range-key='), 'recipe detail basket selector must use the same plain-text native picker mode as categories');
assert.ok(!recipeDetailMarkup.includes('<week-basket-picker'), 'recipe detail basket entry must not render the custom week picker');

const weekBasketPickerMarkup = read('components/week-basket-picker/index.wxml');
const weekBasketPicker = read('components/week-basket-picker/index.js');
const wheelPickerMarkup = read('components/wheel-picker/index.wxml');
const wheelPickerStyles = read('components/wheel-picker/index.wxss');
const wheelPicker = read('components/wheel-picker/index.js');
assert.ok(weekBasketPickerMarkup.includes('<wheel-picker'), 'basket week picker must delegate to the shared wheel picker');
assert.ok(wheelPickerMarkup.includes('height="620rpx"'), 'shared wheel picker must retain the compact Figma half-screen height');
assert.ok(wheelPickerMarkup.includes('scroll-y'), 'only the shared wheel picker options should scroll');
assert.ok(wheelPickerStyles.includes('height: 380rpx;'), 'shared wheel picker must show five options per viewport');
assert.ok(!weekBasketPicker.includes('WHEEL_COPIES'), 'basket week picker must stop at its finite week range rather than repeat weeks');
assert.ok(wheelPicker.includes('EDGE_PADDING_ROWS = CENTER_ROW'), 'shared wheel picker must pad both edges so the selected option remains in the center');
assert.ok(wheelPicker.includes('CENTER_ROW = 2'), 'shared wheel picker must lock the third row as selected');
assert.ok(wheelPicker.includes('snapWheelToCenter'), 'shared wheel picker must snap after scrolling');
assert.ok(wheelPicker.includes('this.syncActiveRow(this.rowIndexForScrollTop(scrollTop))'), 'shared wheel picker must keep the middle selection in sync while scrolling');
assert.ok(wheelPickerMarkup.includes('wheel-picker-selection-slot'), 'shared wheel picker must render a fixed center selection highlight');
assert.ok(wheelPickerMarkup.includes("wheel-picker-option--selected"), 'shared wheel picker must emphasize the real option passing through the center slot');
assert.ok(wheelPickerMarkup.includes('disabled="{{item.empty}}"'), 'shared wheel picker edge padding must not be selectable');
assert.ok(wheelPickerMarkup.includes('bindtouchstart="onWheelTouchStart"'), 'shared wheel picker must release an old snap command before a new drag');
assert.ok(!wheelPickerMarkup.includes('wheel-picker-wheel" catchtouchmove'), 'shared wheel picker must not intercept its own scroll gesture');
assert.ok(!wheelPicker.includes('wheelScrollTop: null'), 'shared wheel picker must not reset scroll-top during a drag');
assert.ok(wheelPicker.includes('wheelScrollCommandVersion'), 'shared wheel picker must use one stable final alignment command');
const wheelPickerScrollHandler = wheelPicker.split('onWheelScroll(event) {')[1].split('    onWheelTouchEnd() {')[0];
assert.ok(!wheelPickerScrollHandler.includes('setData'), 'shared wheel picker must not rerender on every scroll frame');
assert.ok(!wheelPickerStyles.includes('transition: color 120ms'), 'shared wheel picker must not animate text styles while scrolling');
assert.ok(wheelPickerStyles.includes('linear-gradient(to bottom'), 'shared wheel picker must fade rows continuously above the center selection');
assert.ok(wheelPickerStyles.includes('linear-gradient(to top'), 'shared wheel picker must fade rows continuously below the center selection');

const mealPlanPage = read('pages/meal-plan/index.js');
assert.ok(mealPlanPage.includes('onFloatingAddTap()'), 'plan floating add must remain available');
assert.ok(mealPlanPage.includes('planActionVisible: true'), 'plan floating add must open the automatic-or-manual choice first');
assert.ok(mealPlanPage.includes('planDateVisible: true'), 'choosing manual planning must still open the date-and-meal picker');
assert.ok(mealPlanMarkup.includes('<plan-action-sheet'), 'plan page must render the automatic-or-manual choice sheet');

console.log('app hardening verification passed');
