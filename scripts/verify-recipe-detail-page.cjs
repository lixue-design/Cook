'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(rootDir, 'pages/recipe-detail/index.js'), 'utf8');
const markup = fs.readFileSync(path.join(rootDir, 'pages/recipe-detail/index.wxml'), 'utf8');
const styles = fs.readFileSync(path.join(rootDir, 'pages/recipe-detail/index.wxss'), 'utf8');

assert.match(page, /const ingredientPreparationText = \(ingredients\)/);
assert.match(page, /DETAIL_COVER_PLACEHOLDER = '\/assets\/recipes\/detail-cover-placeholder\.svg'/);
assert.match(page, /heroImageUrl: String\(recipe\.heroImage \|\| ''\)\.trim\(\) \|\| DETAIL_COVER_PLACEHOLDER/);
assert.match(page, /onHeroImageError\(\) \{ this\.setData\(\{ 'recipe\.heroImageUrl': DETAIL_COVER_PLACEHOLDER \}\); \}/);
assert.match(markup, /src="\{\{recipe\.heroImageUrl\}\}"/);
assert.equal(markup.includes('wx:if="{{recipe.heroImage}}" class="hero-media"'), false);
assert.match(page, /ingredientPreparationText: ingredientPreparationText\(recipe\.ingredients\)/);
assert.match(markup, /<text class="section-heading">食材准备<\/text>[\s\S]*<text class="ingredient-preparation">\{\{recipe\.ingredientPreparationText\}\}<\/text>/);
assert.equal(markup.includes('ingredient-group'), false);
assert.equal(markup.includes('ingredient-value'), false);
assert.match(styles, /\.ingredient-preparation \{[\s\S]*font-size: 32rpx;[\s\S]*line-height: 52rpx;/);
assert.equal(fs.existsSync(path.join(rootDir, 'assets/recipes/detail-cover-placeholder.svg')), true);
assert.match(page, /const BASKET_WEEK_COUNT = 9;/);
assert.match(page, /const createBasketWeekOptions = \(\) => Array\.from/);
assert.match(page, /const createBasketWeekStartDates = \(\) => Array\.from/);
assert.match(page, /onBasketWeekChange\(event\) \{/);
assert.match(page, /recipeName: this\.data\.recipe\.title/);
assert.match(page, /coverUrl: this\.data\.recipe\.heroImage \|\| this\.data\.recipe\.heroImageUrl/);
assert.match(markup, /<picker class="basket-week-picker" mode="selector" range="\{\{basketWeekOptions\}\}" value="\{\{basketWeekSelectedIndex\}\}"[\s\S]*bindchange="onBasketWeekChange">/);
assert.doesNotMatch(markup, /range-key=/);
assert.doesNotMatch(markup, /<week-basket-picker/);

console.log('recipe detail page verification passed');
