import test from 'node:test';
import assert from 'node:assert/strict';
import {
  basketApiInternals,
  handleBasketApiEvent,
  type BasketApiDependencies
} from '../src/basket-api';
import type { RpcExecutor } from '../src/recipe-api';

const identity = { userId: 'cloud-user-a', appId: 'wx-app', openId: 'open-a' };
const itemId = 'a0000000-0000-4000-8000-000000000001';
const planRecipeId = '90000000-0000-4000-8000-000000000001';
const missingPlanRecipeId = '90000000-0000-4000-8000-000000000099';
const dependenciesWith = (rpc: RpcExecutor): BasketApiDependencies => ({
  getIdentity: async () => identity,
  rpc
});

test('basket validates Monday week starts and parses numeric amounts without conversion', () => {
  assert.equal(basketApiInternals.parseWeekStart('2026-07-27'), '2026-07-27');
  assert.throws(() => basketApiInternals.parseWeekStart('2026-07-28'));
  assert.deepEqual(basketApiInternals.parseAmount('2个'), { amount: '2', amountText: '2个', unit: '个' });
  assert.deepEqual(basketApiInternals.parseAmount('少许'), { amount: null, amountText: '少许', unit: null });
});

test('snapshot extraction uses plan snapshots and returns warnings for missing ingredients', () => {
  let counter = 0;
  const result = basketApiInternals.extractPlanItems([
    {
      planRecipeId: 'p1',
      date: '2026-07-27',
      mealType: 'lunch',
      recipeSnapshot: {
        name: '番茄炒蛋',
        cookTimeMinutes: 20,
        caloriesKcal: 260,
        ingredients: [
          { group: 'main', display: '番茄2个、鸡蛋3个' },
          { group: 'seasoning', display: '盐少许' }
        ]
      }
    },
    {
      planRecipeId: 'p2',
      date: '2026-07-28',
      mealType: 'dinner',
      recipeSnapshot: { name: '无食材菜谱', ingredients: [] }
    }
  ], () => `id-${++counter}`);
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].name, '番茄');
  assert.equal(result.items[0].amount, '2');
  assert.equal(result.items[0].unit, '个');
  assert.equal(result.items[2].category, '调料');
  assert.deepEqual(result.items[0].sourceRefs, [{
    planRecipeId: 'p1',
    date: '2026-07-27',
    mealType: 'lunch',
    recipeName: '番茄炒蛋',
    cookTimeMinutes: 20,
    caloriesKcal: 260
  }]);
  assert.equal(result.warnings[0].code, 'RECIPE_WITHOUT_INGREDIENTS');
});

test('sync uses trusted owner, replaces only generated plan payload and returns persisted manual items', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_basket_plan_snapshots') {
        return [{
          planRecipeId: 'p1',
          date: '2026-07-27',
          mealType: 'lunch',
          recipeSnapshot: {
            name: '番茄炒蛋',
            cookTimeMinutes: 20,
            caloriesKcal: 260,
            ingredients: [{ group: 'main', display: '番茄2个、番茄3个' }]
          }
        }] as T;
      }
      if (name === 'cook_basket_replace_plan_items') return true as T;
      if (name === 'cook_basket_get_week') {
        return {
          id: 'b0000000-0000-4000-8000-000000000001',
          weekStartDate: '2026-07-27',
          items: [
            { id: itemId, name: '手动水果', category: '其他', source: 'manual', checked: false },
            { id: 'a0000000-0000-4000-8000-000000000002', name: '番茄', category: '主料', source: 'plan', checked: false }
          ]
        } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleBasketApiEvent({
    action: 'baskets.week.syncFromPlan',
    payload: { weekStartDate: '2026-07-27', mode: 'replace_plan_items', userId: 'forged-user' }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  const replace = calls.find((call) => call.name === 'cook_basket_replace_plan_items');
  assert.equal(replace?.args.p_owner_id, identity.userId);
  assert.equal((replace?.args.p_items as unknown[]).length, 1);
  const merged = (replace?.args.p_items as Array<{
    amount: string;
    amountText: string;
    sourceRefs: unknown[];
  }>)[0];
  assert.equal(merged.amount, '5');
  assert.equal(merged.amountText, '5个');
  assert.equal(merged.sourceRefs.length, 2);
  assert.deepEqual(merged.sourceRefs[0], {
    planRecipeId: 'p1',
    date: '2026-07-27',
    mealType: 'lunch',
    recipeName: '番茄炒蛋',
    cookTimeMinutes: 20,
    caloriesKcal: 260
  });
  if (result.ok) {
    const basket = result.data as { items: Array<{ source: string }> };
    assert.deepEqual(basket.items.map((item) => item.source), ['manual', 'plan']);
  }
});

test('sync uses current recipe ingredients but falls back to the plan snapshot when the original recipe is deleted', async () => {
  const calls: string[] = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push(name);
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_basket_plan_snapshots') {
        return [
          {
            planRecipeId: 'p-current',
            date: '2026-07-27',
            mealType: 'lunch',
            recipeSnapshot: {
              originalRecipeId: '80000000-0000-4000-8000-000000000001',
              name: '已更新菜谱',
              ingredients: [{ group: 'main', display: '旧食材1个' }]
            }
          },
          {
            planRecipeId: 'p-deleted',
            date: '2026-07-27',
            mealType: 'dinner',
            recipeSnapshot: {
              originalRecipeId: '80000000-0000-4000-8000-000000000002',
              name: '已删除菜谱',
              ingredients: [{ group: 'main', display: '快照食材2个' }]
            }
          }
        ] as T;
      }
      if (name === 'ai_dish_library_get_recipe') {
        return calls.filter((item) => item === 'ai_dish_library_get_recipe').length === 1
          ? { id: '80000000-0000-4000-8000-000000000001', mainIngredients: '新食材3个' } as T
          : null as T;
      }
      if (name === 'cook_basket_replace_plan_items') {
        const items = (args as { p_items: Array<{ name: string; sourceRefs: Array<{ recipeId?: string }> }> }).p_items;
        assert.deepEqual(items.map((item) => item.name), ['新食材', '快照食材']);
        assert.equal(items[0].sourceRefs[0].recipeId, '80000000-0000-4000-8000-000000000001');
        return true as T;
      }
      if (name === 'cook_basket_get_week') return { weekStartDate: '2026-07-27', items: [] } as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleBasketApiEvent({
    action: 'baskets.week.syncFromPlan',
    payload: { weekStartDate: '2026-07-27' }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
});

test('selected sync rebuilds plan basket items from chosen plan snapshots only', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_basket_plan_snapshots') {
        return [
          {
            planRecipeId,
            date: '2026-07-27',
            mealType: 'lunch',
            recipeSnapshot: {
              name: '番茄炒蛋',
              ingredients: [{ group: 'main', display: '番茄2个、番茄3个' }]
            }
          },
          {
            planRecipeId: '90000000-0000-4000-8000-000000000002',
            date: '2026-07-27',
            mealType: 'dinner',
            recipeSnapshot: {
              name: '清炒西兰花',
              ingredients: [{ group: 'main', display: '西兰花1颗' }]
            }
          }
        ] as T;
      }
      if (name === 'cook_basket_replace_plan_items') return true as T;
      if (name === 'cook_basket_get_week') {
        return {
          weekStartDate: '2026-07-27',
          items: [
            { id: itemId, name: '手动水果', category: '其他', source: 'manual', checked: false },
            { id: 'a0000000-0000-4000-8000-000000000002', name: '番茄', category: '主料', source: 'plan', checked: false }
          ]
        } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleBasketApiEvent({
    action: 'baskets.week.syncSelected',
    payload: {
      weekStartDate: '2026-07-27',
      planRecipeIds: [planRecipeId, missingPlanRecipeId],
      mode: 'replace_selected_plan_items',
      userId: 'forged-user'
    }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  const replace = calls.find((call) => call.name === 'cook_basket_replace_plan_items');
  assert.equal(replace?.args.p_owner_id, identity.userId);
  const items = replace?.args.p_items as Array<{ name: string; amount: string; sourceRefs: Array<{ planRecipeId: string }> }>;
  assert.equal(items.length, 1);
  assert.equal(items[0].name, '番茄');
  assert.equal(items[0].amount, '5');
  assert.equal(items[0].sourceRefs[0].planRecipeId, planRecipeId);
  if (result.ok) {
    const basket = result.data as { items: Array<{ source: string }>; warnings: Array<{ code: string }> };
    assert.deepEqual(basket.items.map((item) => item.source), ['manual', 'plan']);
    assert.equal(basket.warnings[0].code, 'PLAN_ITEM_NOT_FOUND');
  }
});

test('selected sync does not replace plan items when no selected snapshot exists', async () => {
  let replaceCalled = false;
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_basket_plan_snapshots') return [] as T;
      if (name === 'cook_basket_replace_plan_items') replaceCalled = true;
      return null as T;
    }
  };
  const result = await handleBasketApiEvent({
    action: 'baskets.week.syncSelected',
    payload: { weekStartDate: '2026-07-27', planRecipeIds: [planRecipeId] }
  }, dependenciesWith(rpc));
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'NOT_FOUND', message: '选中的计划菜品不存在' }
  });
  assert.equal(replaceCalled, false);
});

test('snapshot read failure cannot call the destructive replace RPC', async () => {
  let replaceCalled = false;
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_basket_plan_snapshots') throw new Error('database failed');
      if (name === 'cook_basket_replace_plan_items') replaceCalled = true;
      return null as T;
    }
  };
  const result = await handleBasketApiEvent({
    action: 'baskets.week.syncFromPlan',
    payload: { weekStartDate: '2026-07-27' }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, false);
  assert.equal(replaceCalled, false);
});

test('recipe detail add reads owner recipe on server and persists idempotent manual-source items', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const recipeId = '80000000-0000-4000-8000-000000000001';
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'ai_dish_library_get_recipe') {
        return {
          id: recipeId,
          displayName: '番茄炒蛋',
          durationMinutes: 20,
          caloriesKcal: 260,
          mainIngredients: '番茄2个、鸡蛋3个',
          sideIngredients: '',
          seasonings: '盐少许'
        } as T;
      }
      if (name === 'cook_basket_add_recipe_items') return true as T;
      if (name === 'cook_basket_get_week') {
        return { weekStartDate: '2026-07-27', items: [] } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleBasketApiEvent({
    action: 'baskets.week.addRecipe',
    payload: {
      weekStartDate: '2026-07-27',
      recipeId,
      ownerId: 'forged',
      ingredients: [{ name: '伪造食材' }]
    }
  }, dependenciesWith(rpc));
  assert.equal(result.ok, true);
  const read = calls.find((call) => call.name === 'ai_dish_library_get_recipe');
  assert.equal(read?.args.p_owner_id, identity.userId);
  const add = calls.find((call) => call.name === 'cook_basket_add_recipe_items');
  assert.equal(add?.args.p_owner_id, identity.userId);
  const items = add?.args.p_items as Array<{ name: string; sourceRefs: Array<Record<string, unknown>> }>;
  assert.deepEqual(items.map((item) => item.name), ['番茄', '鸡蛋', '盐']);
  assert.equal(items[0].sourceRefs[0].recipeId, recipeId);
  assert.equal(items[0].sourceRefs[0].source, 'recipe_detail');
  assert.equal(items[0].sourceRefs[0].cookTimeMinutes, 20);
  assert.equal(items[0].sourceRefs[0].caloriesKcal, 260);
});

test('manual create, checked update, delete and check-all use owner-scoped RPCs', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'cook_basket_create_manual_item') {
        return { id: itemId, name: '猕猴桃', category: '其他', source: 'manual', checked: false } as T;
      }
      if (name === 'cook_basket_update_item') {
        return { id: itemId, name: '猕猴桃', category: '其他', source: 'manual', checked: true } as T;
      }
      if (name === 'cook_basket_delete_item') return true as T;
      if (name === 'cook_basket_check_all') return 1 as T;
      if (name === 'cook_basket_get_week') {
        return { weekStartDate: '2026-07-27', items: [] } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const dependencies = dependenciesWith(rpc);
  const create = await handleBasketApiEvent({
    action: 'baskets.items.create',
    payload: { weekStartDate: '2026-07-27', name: '猕猴桃', category: '其他' }
  }, dependencies);
  assert.equal(create.ok, true);
  const update = await handleBasketApiEvent({
    action: 'baskets.items.update',
    payload: { weekStartDate: '2026-07-27', itemId, checked: true }
  }, dependencies);
  assert.equal(update.ok, true);
  const deleted = await handleBasketApiEvent({
    action: 'baskets.items.delete',
    payload: { weekStartDate: '2026-07-27', itemId }
  }, dependencies);
  assert.deepEqual(deleted, { ok: true, data: { deleted: true } });
  const checked = await handleBasketApiEvent({
    action: 'baskets.items.checkAll',
    payload: { weekStartDate: '2026-07-27', checked: true }
  }, dependencies);
  assert.equal(checked.ok, true);
  for (const call of calls.filter((item) => item.name.startsWith('cook_basket_'))) {
    assert.equal(call.args.p_owner_id, identity.userId);
  }
});

test('invalid basket inputs are rejected before business RPCs', async () => {
  let businessCalls = 0;
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      businessCalls += 1;
      return null as T;
    }
  };
  for (const event of [
    { action: 'baskets.week.get', payload: { weekStartDate: '2026-07-28' } },
    { action: 'baskets.week.syncSelected', payload: { weekStartDate: '2026-07-27', planRecipeIds: [] } },
    { action: 'baskets.week.syncSelected', payload: { weekStartDate: '2026-07-27', planRecipeIds: ['bad'] } },
    { action: 'baskets.items.create', payload: { weekStartDate: '2026-07-27', name: '' } },
    { action: 'baskets.items.update', payload: { weekStartDate: '2026-07-27', itemId: 'bad', checked: true } },
    { action: 'baskets.items.checkAll', payload: { weekStartDate: '2026-07-27', checked: 'yes' } }
  ]) {
    const result = await handleBasketApiEvent(event, dependenciesWith(rpc));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'INVALID_ARGUMENT');
  }
  assert.equal(businessCalls, 0);
});
