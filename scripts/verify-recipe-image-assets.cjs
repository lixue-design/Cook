'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const sources = [
  'services/recipe-api-mock.js',
  'src/api/recipeApi.ts'
].map((relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
const imageNames = ['beans', 'cabbage', 'cucumber', 'detail-hero', 'detail-step-1', 'enoki', 'fungus', 'potato'];

for (const imageName of imageNames) {
  const imagePath = path.join(rootDir, 'assets/recipes', `${imageName}.jpg`);
  assert.equal(fs.existsSync(imagePath), true, `${imageName}.jpg must exist`);
  assert.equal(fs.statSync(imagePath).size > 0, true, `${imageName}.jpg must not be empty`);
}

for (const source of sources) {
  assert.doesNotMatch(source, /\/assets\/recipes\/[^'" )]+\.png/);
}

console.log('recipe image asset verification passed');
