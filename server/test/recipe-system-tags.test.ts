import test from 'node:test';
import assert from 'node:assert/strict';
import { hasSystemTag, normalizeRecipeSystemTags } from '../src/recipe-system-tags';

test('system tag payload accepts only versioned, source-traceable tags', () => {
  const tags = normalizeRecipeSystemTags({
    tagVersion: 1,
    mealTypes: [{ value: 'breakfast', source: 'title', confidence: 'high' }],
    roles: [{ value: 'protein_dish', source: 'default_rule', confidence: 'medium' }],
    proteinTypes: [{ value: 'egg', source: 'title', confidence: 'high' }],
    vegetables: [{ value: 'tomato', source: 'title_alias', confidence: 'high' }],
    cookMethods: [{ value: 'stir_fry', source: 'title', confidence: 'high' }],
    timeLevel: { value: 'quick', source: 'duration', confidence: 'high' },
    isOneDishMeal: false
  });
  assert.ok(tags);
  assert.equal(hasSystemTag(tags, 'vegetables', 'tomato'), true);
  assert.equal(hasSystemTag(tags, 'roles', 'staple'), false);
});

test('malformed system tags cannot affect plan selection', () => {
  assert.equal(normalizeRecipeSystemTags({ tagVersion: 0, mealTypes: 'breakfast' }), null);
  assert.equal(normalizeRecipeSystemTags({
    tagVersion: 1,
    mealTypes: [{ value: 'breakfast', source: 'unknown', confidence: 'high' }]
  })?.mealTypes.length, 0);
});
