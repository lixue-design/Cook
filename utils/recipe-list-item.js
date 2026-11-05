'use strict';

const RECIPE_COVER_PLACEHOLDER = '/assets/recipes/cover-placeholder.svg';
const DEFAULT_CROP = { width: 64, height: 64, left: 0, top: 0 };

function toRecipeListItem(recipe) {
  const value = recipe || {};
  const coverUrl = String(value.coverUrl || value.heroImage || '').trim();
  return {
    ...value,
    id: String(value.id || value.recipeId || value.planRecipeId || ''),
    title: String(value.title || value.recipeName || value.name || '').trim(),
    coverUrl: coverUrl || RECIPE_COVER_PLACEHOLDER,
    crop: value.crop || DEFAULT_CROP,
    isCoverPlaceholder: !coverUrl
  };
}

function flattenRecipeGroups(groups) {
  return (Array.isArray(groups) ? groups : []).reduce(
    (recipes, group) => recipes.concat((group && group.recipes) || []),
  []
  ).map(toRecipeListItem).filter((recipe) => recipe.title);
}

function findCurrentRecipe(recipe, catalog) {
  const value = recipe || {};
  const recipes = Array.isArray(catalog) ? catalog : [];
  const recipeId = String(value.recipeId || value.originalRecipeId || '').trim();
  if (recipeId) return recipes.find((item) => String(item && item.id || '') === recipeId) || null;
  const title = String(value.title || value.recipeName || value.name || '').trim();
  return title ? recipes.find((item) => String(item && item.title || '') === title) || null : null;
}

// 计划、搜索和菜篮可保留各自的业务快照，但关联菜谱的列表展示字段始终以当前菜谱库为准。
function toCurrentRecipeListItem(recipe, catalog) {
  const canonical = findCurrentRecipe(recipe, catalog);
  if (!canonical) return toRecipeListItem(recipe);
  return toRecipeListItem({
    ...(recipe || {}),
    title: canonical.title,
    coverUrl: canonical.coverUrl,
    crop: canonical.crop
  });
}

// 菜谱列表及计划选择浮层共用：空分类不进入可选择的菜谱目录。
function toRecipeCatalogGroups(groups) {
  return (Array.isArray(groups) ? groups : []).filter((group) => (
    Array.isArray(group && group.recipes) && group.recipes.length > 0
  ));
}

module.exports = {
  RECIPE_COVER_PLACEHOLDER,
  DEFAULT_CROP,
  toRecipeListItem,
  findCurrentRecipe,
  toCurrentRecipeListItem,
  flattenRecipeGroups,
  toRecipeCatalogGroups
};
