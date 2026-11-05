'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseModelJson, normalizeRecipeDraft } = require('../cloudfunctions/cookRecipeTextAi/recipe-draft');
const functionSource = fs.readFileSync(path.resolve(__dirname, '../cloudfunctions/cookRecipeTextAi/index.js'), 'utf8');

const draft = normalizeRecipeDraft(parseModelJson('```json\n{"title":"番茄炒蛋","duration":"12分钟","mainIngredients":"番茄2个、鸡蛋3个","seasonings":"盐少许","steps":[{"text":"番茄切块，鸡蛋打散。"},{"text":"炒熟鸡蛋后与番茄翻炒。"}]}\n```'));
assert.equal(draft.title, '番茄炒蛋');
assert.equal(draft.duration, '12');
assert.equal(draft.steps.length, 2);
assert.equal(draft.sourceMeta.provider, 'ai');
assert.equal(Object.hasOwn(draft.sourceMeta, 'inputSummary'), false);
assert.equal(normalizeRecipeDraft({ title: '番茄炒蛋', steps: [{ text: '翻炒。' }] }, 'image').sourceType, 'image');
assert.equal(normalizeRecipeDraft({ title: '番茄炒蛋', steps: [{ text: '翻炒。' }] }, 'link').sourceType, 'link');
assert.throws(() => normalizeRecipeDraft({ title: '无步骤', steps: [] }));
assert.match(functionSource, /category：仅可选“爽口凉菜、家常小炒、大口吃肉、一碗鲜汤、饱腹主食”/);
assert.match(functionSource, /格式为“食材名称用量”，如“番茄2个”/);
assert.match(functionSource, /GeneralBasicOCR/);
assert.match(functionSource, /removeTemporaryImage/);
assert.match(functionSource, /extractXiaohongshuLinkContent/);
assert.match(functionSource, /sourceUrl/);
assert.match(functionSource, /sourceType: imageFileId \? 'image' : sourceUrl \? 'link' : 'text'/);
console.log('recipe text AI function checks passed');
