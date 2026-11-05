'use strict';

const STORAGE_KEY = 'cook.planDisplaySettings';
const MEALS = [
  { id: 'breakfast', name: '早餐', setting: 'hasBreakfast' },
  { id: 'lunch', name: '午餐', setting: 'hasLunch' },
  { id: 'dinner', name: '晚餐', setting: 'hasDinner' }
];

const DEFAULT_SETTINGS = Object.freeze({ hasBreakfast: true, hasLunch: true, hasDinner: true });

function normalizePlanDisplaySettings(value) {
  const settings = value || {};
  return {
    hasBreakfast: typeof settings.hasBreakfast === 'boolean' ? settings.hasBreakfast : true,
    hasLunch: typeof settings.hasLunch === 'boolean' ? settings.hasLunch : true,
    hasDinner: typeof settings.hasDinner === 'boolean' ? settings.hasDinner : true
  };
}

function readPlanDisplaySettings() {
  try { return normalizePlanDisplaySettings(wx.getStorageSync(STORAGE_KEY)); } catch (error) { return { ...DEFAULT_SETTINGS }; }
}

function savePlanDisplaySettings(settings) {
  const normalized = normalizePlanDisplaySettings(settings);
  try { wx.setStorageSync(STORAGE_KEY, normalized); } catch (error) { /* The page state still updates when local storage is unavailable. */ }
  return normalized;
}

function getVisibleMeals(settings) {
  const normalized = normalizePlanDisplaySettings(settings);
  return MEALS.filter((meal) => normalized[meal.setting]).map((meal) => ({ id: meal.id, name: meal.name }));
}

module.exports = { DEFAULT_SETTINGS, MEALS, normalizePlanDisplaySettings, readPlanDisplaySettings, savePlanDisplaySettings, getVisibleMeals };
