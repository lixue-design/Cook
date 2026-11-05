'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const filename = path.join(rootDir, 'services/meal-plan-api-mock.js');
const moduleStub = { exports: {} };

vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  setTimeout,
  Promise,
  Date,
  JSON
}, { filename });

async function main() {
  const api = moduleStub.exports;
  const currentWeek = await api.fetchWeekDates(0);
  const targetDate = currentWeek[0].id;
  const todayId = new Date().toISOString().slice(0, 10);
  assert.ok(currentWeek.some((day) => day.id === todayId && day.today), '日计划应标记真实的今天');
  const before = await api.fetchMealPlans(targetDate);
  const weeklyBefore = await api.fetchWeeklyPlan(0);
  const weeklyDayBefore = weeklyBefore.find((day) => day.id === targetDate);
  const titlesForDay = (meals) => meals.flatMap((meal) => meal.recipes).map((item) => item.title).join('|');
  const titlesForWeek = (day) => day.meals.flatMap((meal) => meal.items).map((item) => item.title).join('|');
  assert.equal(titlesForDay(before), '', 'Mock should start with an empty daily plan');
  assert.equal(titlesForDay(before), titlesForWeek(weeklyDayBefore), '日计划与周计划必须读取同一日期数据');

  await api.addRecipeToPlan(targetDate, 'dinner', { id: 'same-source-item', title: '同源菜品' });
  const afterAddDay = await api.fetchMealPlans(targetDate);
  const afterAddWeek = (await api.fetchWeeklyPlan(0)).find((day) => day.id === targetDate);
  assert.ok(titlesForDay(afterAddDay).includes('同源菜品'));
  assert.equal(titlesForDay(afterAddDay), titlesForWeek(afterAddWeek), '日计划新增应同步至周计划');

  const addedPlanItem = afterAddDay[2].recipes.find((item) => item.recipeId === 'same-source-item');
  await api.removeRecipeFromPlan(targetDate, 'dinner', addedPlanItem.id);
  const afterRemoveDay = await api.fetchMealPlans(targetDate);
  const afterRemoveWeek = (await api.fetchWeeklyPlan(0)).find((day) => day.id === targetDate);
  assert.ok(!titlesForDay(afterRemoveDay).includes('同源菜品'));
  assert.equal(titlesForDay(afterRemoveDay), titlesForWeek(afterRemoveWeek), '日计划删除应同步至周计划');

  await api.addRecipeToPlan(targetDate, 'breakfast', { id: 'move-source-item', title: '可移动菜品' });
  const moved = (await api.fetchMealPlans(targetDate))[0].recipes[0];
  await api.movePlanRecipe(moved.id, targetDate, 'dinner', 0);
  const afterMoveDay = await api.fetchMealPlans(targetDate);
  const afterMoveWeek = (await api.fetchWeeklyPlan(0)).find((day) => day.id === targetDate);
  assert.equal(afterMoveDay[2].recipes[0].id, moved.id);
  assert.equal(titlesForDay(afterMoveDay), titlesForWeek(afterMoveWeek), '周计划拖拽应同步至日计划');

  const secondDate = currentWeek[1].id;
  await api.addRecipeToPlan(targetDate, 'breakfast', { id: 'same-recipe', title: '同一道菜' });
  await api.addRecipeToPlan(secondDate, 'breakfast', { id: 'same-recipe', title: '同一道菜' });
  const firstPlanItem = (await api.fetchMealPlans(targetDate))[0].recipes.find((item) => item.recipeId === 'same-recipe');
  const secondPlanItem = (await api.fetchMealPlans(secondDate))[0].recipes.find((item) => item.recipeId === 'same-recipe');
  assert.notEqual(firstPlanItem.id, secondPlanItem.id, '同一道菜的不同计划项必须使用不同 ID');
  await api.movePlanRecipe(secondPlanItem.id, secondDate, 'dinner', 0);
  const firstAfterSecondMove = await api.fetchMealPlans(targetDate);
  const secondAfterMove = await api.fetchMealPlans(secondDate);
  assert.ok(firstAfterSecondMove[0].recipes.some((item) => item.id === firstPlanItem.id), '拖拽一个计划项不能移动另一日的同菜谱项');
  assert.ok(secondAfterMove[2].recipes.some((item) => item.id === secondPlanItem.id), '拖拽应移动目标计划项');

  const note = await api.addNoteToPlan(targetDate, 'lunch', '随手记菜品');
  const afterNote = await api.fetchMealPlans(targetDate);
  assert.ok(afterNote[1].recipes.some((item) => item.id === note.id && item.title === '随手记菜品'), '随手记必须写入计划数据');
  await api.movePlanRecipe(note.id, targetDate, 'dinner', 0);
  const afterNoteMove = await api.fetchMealPlans(targetDate);
  assert.ok(!afterNoteMove[1].recipes.some((item) => item.id === note.id), '拖拽后随手记应从原餐段移除');
  assert.ok(afterNoteMove[2].recipes.some((item) => item.id === note.id), '拖拽后随手记应保留在目标餐段');

  await api.addRecipeToPlan(targetDate, 'lunch', { id: 'remove-scope-item', title: '删除范围菜品' });
  await api.addRecipeToPlan(targetDate, 'dinner', { id: 'remove-scope-item', title: '删除范围菜品' });
  const plansBeforeScopedRemove = await api.fetchMealPlans(targetDate);
  const lunchItem = plansBeforeScopedRemove[1].recipes.find((item) => item.recipeId === 'remove-scope-item');
  const dinnerItem = plansBeforeScopedRemove[2].recipes.find((item) => item.recipeId === 'remove-scope-item');
  await api.removeRecipeFromPlan(targetDate, 'dinner', dinnerItem.id);
  const plansAfterScopedRemove = await api.fetchMealPlans(targetDate);
  assert.ok(plansAfterScopedRemove[1].recipes.some((item) => item.id === lunchItem.id), '移除晚餐菜品不能影响午餐中的同一道菜');
  assert.ok(!plansAfterScopedRemove[2].recipes.some((item) => item.id === dinnerItem.id), '仅移除用户点击的计划项');

  const generated = await api.generateWeeklyPlan(0);
  assert.equal(generated.days.length, 7);
  assert.ok(generated.days.some((day) => day.id === targetDate));

  const after = await api.fetchMealPlans(targetDate);
  assert.deepEqual(after.map((meal) => meal.id), ['breakfast', 'lunch', 'dinner']);
  assert.ok(after[2].recipes.some((item) => item.title === '可移动菜品'), '已有菜品不应因随手记拖拽而丢失');
  assert.ok(after[2].recipes.some((item) => item.id === note.id), '随手记应在后续刷新后继续保留');

  await api.clearDayPlan(targetDate);
  const clearedSingleDay = await api.fetchMealPlans(targetDate);
  const clearedSingleWeekDay = (await api.fetchWeeklyPlan(0)).find((day) => day.id === targetDate);
  assert.equal(clearedSingleDay.reduce((sum, meal) => sum + meal.recipes.length, 0), 0, '清空当天计划只能清空目标日期');
  assert.equal(titlesForDay(clearedSingleDay), titlesForWeek(clearedSingleWeekDay), '清空当天计划应同步至周计划');

  await api.clearWeekPlan(0);
  const clearedWeek = await api.fetchWeeklyPlan(0);
  assert.ok(clearedWeek.every((day) => day.meals.every((meal) => meal.items.length === 0)));
  const clearedDay = await api.fetchMealPlans(targetDate);
  assert.equal(clearedDay.reduce((sum, meal) => sum + meal.recipes.length, 0), 0, '清空周计划应同步至日计划');

  const pageSource = fs.readFileSync(path.join(rootDir, 'pages/meal-plan/index.js'), 'utf8');
  assert.ok(
    pageSource.includes('fetchMealPlans(selectedDate)'),
    'weekly generation should refresh the selected day plan'
  );
  assert.ok(pageSource.includes('clearWeekPlan(activeWeekOffset)'), 'week clear should use the current displayed week');
  assert.ok(pageSource.includes('clearDayPlan(selectedDate)'), 'day clear should use the selected date only');
  assert.ok(pageSource.includes("isDayPlan ? '清空当天计划' : '清空本周计划'"), 'more actions should change with the plan mode');
  assert.ok(
    pageSource.includes('planDateVisible: true')
      && pageSource.includes('planDateInitialDate: this.data.selectedDate')
      && pageSource.includes("this.planFlowNext = 'recipes'"),
    'floating add should directly open the date-and-meal selector, then continue to recipe selection'
  );
  assert.ok(pageSource.includes('fetchWeeklyPlan(weekOffset)'), '加入菜篮必须读取当前周的计划快照');
  assert.ok(pageSource.includes('refreshWeeklyPlanIngredients(weeklyPlanDays)'), '加入菜篮必须使用原菜谱的最新食材刷新计划项');
  assert.ok(pageSource.includes('syncShoppingList(weekStartForOffset(weekOffset), weeklyPlanDays)'), '加入菜篮必须将本周计划快照交给菜篮汇总');
  const basketStart = pageSource.indexOf('  onBasketTap() {');
  const basketHandler = pageSource.slice(basketStart, pageSource.indexOf('  onPlanMore() {', basketStart));
  assert.ok(basketHandler.includes("title: '已加入本周菜篮'"), '加入菜篮完成后应展示统一成功提示');
  assert.doesNotMatch(basketHandler, /showModal|菜篮同步提示/, '加入菜篮不应展示同步提示弹窗');

  console.log('meal plan mock verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
