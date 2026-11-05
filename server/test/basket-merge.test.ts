import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePlanIngredients, type MergeableBasketItem } from '../src/basket-merge';

const item = (
  id: string,
  name: string,
  amount: string | null,
  unit: string | null,
  amountText: string,
  ref: string
): MergeableBasketItem => ({
  id,
  name,
  category: '主料',
  amount,
  unit,
  amountText,
  source: 'plan',
  sourceRefs: [{ ref }]
});

test('same normalized name and unit sum numeric amounts while preserving every source', () => {
  const result = mergePlanIngredients([
    item('1', ' 鸡蛋 ', '2', '个', '2个', 'a'),
    item('2', '鸡蛋', '3', '个', '3个', 'b'),
    item('3', '牛奶', '0.1', 'L', '0.1L', 'c'),
    item('4', '牛奶', '0.2', 'l', '0.2l', 'd')
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].amount, '5');
  assert.equal(result[0].amountText, '5个');
  assert.deepEqual(result[0].sourceRefs, [{ ref: 'a' }, { ref: 'b' }]);
  assert.equal(result[1].amount, '0.3');
  assert.equal(result[1].amountText, '0.3L');
});

test('same name with different units remains separate', () => {
  const result = mergePlanIngredients([
    item('1', '鸡蛋', '2', '个', '2个', 'a'),
    item('2', '鸡蛋', '100', 'g', '100g', 'b')
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((entry) => entry.amountText), ['2个', '100g']);
});

test('unparseable amounts remain separate', () => {
  const result = mergePlanIngredients([
    item('1', '盐', null, null, '少许', 'a'),
    item('2', '盐', null, null, '适量', 'b')
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((entry) => entry.amountText), ['少许', '适量']);
});

test('items without a unit remain separate even when names normalize identically', () => {
  const result = mergePlanIngredients([
    item('1', ' 西红柿，', '1', null, '1', 'a'),
    item('2', '西红柿', '2', '', '2', 'b'),
    item('3', '西红柿　', '1', '个', '1个', 'c')
  ]);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((entry) => entry.amountText), ['1', '2', '1个']);
});

test('an unmeasured ingredient merges with one measured unit and keeps every source', () => {
  const result = mergePlanIngredients([
    item('1', '排骨', '500', 'g', '500g', 'measured'),
    item('2', '排骨', null, null, '', 'unmeasured')
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].amountText, '无用量+500g');
  assert.deepEqual(result[0].sourceRefs, [{ ref: 'measured' }, { ref: 'unmeasured' }]);
});

test('result order follows first appearance and source references are stable', () => {
  const result = mergePlanIngredients([
    item('1', '番茄', '2', '个', '2个', 'first'),
    item('2', '鸡蛋', '3', '个', '3个', 'second'),
    item('3', '番茄', '1', '个', '1个', 'third')
  ]);
  assert.deepEqual(result.map((entry) => entry.name), ['番茄', '鸡蛋']);
  assert.deepEqual(result.map((entry) => entry.sortOrder), [0, 1]);
  assert.equal(result[0].amountText, '3个');
  assert.deepEqual(result[0].sourceRefs, [{ ref: 'first' }, { ref: 'third' }]);
});
