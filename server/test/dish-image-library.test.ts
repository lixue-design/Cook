import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdminDishAlias,
  createDishImageGenerationPlaceholder,
  listAdminDishImages,
  regenerateAdminDishImage,
  hasExactDishImageMatch,
  normalizeDishName,
  searchDishImages,
  standardizeDishName,
  updateAdminDishImage,
  type DishImageSearchResult,
  type ParameterizedQueryExecutor
} from '../src/dish-image-library';

test('dish image search normalizes a keyword and maps stable image URLs', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const executor: ParameterizedQueryExecutor = {
    async query(sql, values) {
      calls.push({ sql, values });
      return {
        rows: [{
          image_id: 'b1000000-0000-4000-8000-000000000001',
          dish_id: 'a1000000-0000-4000-8000-000000000001',
          dish_name: '番茄炒蛋',
          storage_key: 'tomato-scrambled-eggs.webp',
          mime_type: 'image/webp',
          width: 768,
          height: 768,
          matched_keyword: '西红柿',
          score: 1070,
          is_exact_match: true
        }]
      };
    }
  };

  const result = await searchDishImages(executor, ' 西 红 柿 ', 100);
  assert.deepEqual(calls[0].values, ['西红柿', 50]);
  assert.equal(result[0].dishName, '番茄炒蛋');
  assert.equal(result[0].matchedKeyword, '西红柿');
  assert.equal(result[0].exactMatch, true);
  assert.equal(result[0].imageUrl, '/api/dish-images/b1000000-0000-4000-8000-000000000001');
});

test('dish image search does not query for an empty keyword', async () => {
  const executor: ParameterizedQueryExecutor = {
    async query() {
      throw new Error('query must not run');
    }
  };
  assert.deepEqual(await searchDishImages(executor, '   '), []);
});

test('ingredient-only matches do not satisfy compound dish names', () => {
  const result = (dishName: string, matchedKeyword: string, exactMatch: boolean): DishImageSearchResult => ({
    imageId: 'b1000000-0000-4000-8000-000000000001',
    dishId: 'a1000000-0000-4000-8000-000000000001',
    dishName,
    storageKey: 'dish.webp',
    mimeType: 'image/webp',
    width: 768,
    height: 768,
    matchedKeyword,
    score: exactMatch ? 1100 : 200,
    exactMatch,
    imageUrl: '/api/dish-images/b1000000-0000-4000-8000-000000000001'
  });

  const compoundDishCases = [
    ['青椒香干肉丝', '青椒'],
    ['土豆牛腩煲', '土豆'],
    ['蒜蓉粉丝蒸扇贝', '蒜蓉'],
    ['香菇滑鸡', '香菇'],
    ['番茄肥牛汤', '番茄']
  ];
  for (const [dishName, ingredient] of compoundDishCases) {
    assert.equal(
      hasExactDishImageMatch([result(ingredient, ingredient, false)]),
      false,
      `${dishName} must not reuse an ingredient-only image`
    );
  }
  assert.equal(hasExactDishImageMatch([result('西红柿炒蛋', '番茄炒蛋', true)]), true);
});

test('dish name normalization removes spacing and punctuation', () => {
  assert.equal(normalizeDishName(' 西 红 柿-炒（鸡）蛋 '), '西红柿炒鸡蛋');
});

test('standardization prefers audited alias mappings', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const executor: ParameterizedQueryExecutor = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM dish_aliases')) {
        return {
          rows: [{
            dish_id: 'a1000000-0000-4000-8000-000000000001',
            display_name: '番茄炒蛋',
            matched_alias: '西红柿炒鸡蛋',
            normalized_name: '西红柿炒鸡蛋'
          }]
        };
      }
      throw new Error('canonical lookup should not run after alias hit');
    }
  };
  const result = await standardizeDishName(executor, ' 西 红 柿 炒 鸡 蛋 ');
  assert.equal(calls[0].values?.[0], '西红柿炒鸡蛋');
  assert.equal(result.displayName, '番茄炒蛋');
  assert.equal(result.canonicalDishId, 'a1000000-0000-4000-8000-000000000001');
  assert.equal(result.matchType, 'alias');
  assert.deepEqual(result.evidence, [{ type: 'dish_aliases.normalized_name', value: '西红柿炒鸡蛋' }]);
});

test('standardization can match canonical dish names directly', async () => {
  const executor: ParameterizedQueryExecutor = {
    async query(sql) {
      if (sql.includes('FROM dish_aliases')) return { rows: [] };
      return {
        rows: [{
          dish_id: 'a1000000-0000-4000-8000-000000000002',
          display_name: '凉拌黄瓜',
          normalized_name: '凉拌黄瓜'
        }]
      };
    }
  };
  const result = await standardizeDishName(executor, '凉拌黄瓜');
  assert.equal(result.matchType, 'canonical');
  assert.equal(result.displayName, '凉拌黄瓜');
});

test('standardization has explainable built-in synonym fallback', async () => {
  const executor: ParameterizedQueryExecutor = {
    async query() { return { rows: [] }; }
  };
  const result = await standardizeDishName(executor, '拍青瓜');
  assert.equal(result.matchType, 'rule');
  assert.equal(result.displayName, '凉拌黄瓜');
  assert.deepEqual(result.evidence, [{ type: 'builtin_synonym', value: '凉拌黄瓜' }]);
});

test('standardization returns normalized evidence for misses', async () => {
  const executor: ParameterizedQueryExecutor = {
    async query() { return { rows: [] }; }
  };
  const result = await standardizeDishName(executor, '神秘新菜');
  assert.equal(result.matchType, 'none');
  assert.equal(result.displayName, '神秘新菜');
  assert.deepEqual(result.evidence, [{ type: 'normalized_text', value: '神秘新菜' }]);
});

test('placeholder generation records a provisional standard dish without AI calls', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const executor: ParameterizedQueryExecutor = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM dish_aliases') || sql.includes('FROM canonical_dishes')) return { rows: [] };
      if (sql.includes('INSERT INTO canonical_dishes')) return { rows: [] };
      throw new Error(`unexpected ${sql}`);
    }
  };
  const result = await createDishImageGenerationPlaceholder(executor, '神秘新菜');
  assert.equal(result.provider, 'rules');
  assert.equal(result.generationJobId, null);
  assert.equal(result.image.status, 'pending_ops');
  assert.equal(result.image.source, 'placeholder');
  assert.equal(result.matched, false);
  const insert = calls.find((call) => call.sql.includes('INSERT INTO canonical_dishes'));
  assert.ok(insert);
  assert.equal(insert?.values?.[1], '神秘新菜');
  assert.equal(insert?.values?.[2], '神秘新菜');
});

test('placeholder generation refuses reserved ai provider', async () => {
  const executor: ParameterizedQueryExecutor = {
    async query() {
      throw new Error('query must not run');
    }
  };
  await assert.rejects(
    () => createDishImageGenerationPlaceholder(executor, '番茄炒蛋', 'ai'),
    /AI provider 暂未启用/
  );
});

const adminAssetRow = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'b1000000-0000-4000-8000-000000000001',
  canonical_dish_id: 'a1000000-0000-4000-8000-000000000001',
  dish_name: '番茄炒蛋',
  normalized_name: '番茄炒蛋',
  dish_status: 'ACTIVE',
  status: 'READY',
  provider: 'rules',
  provider_model: null,
  storage_key: 'tomato.webp',
  mime_type: 'image/webp',
  width: 768,
  height: 768,
  is_current: true,
  failure_code: null,
  failure_summary: null,
  updated_at: '2026-08-05T00:00:00.000Z',
  created_at: '2026-08-04T00:00:00.000Z',
  ...overrides
});

test('admin dish image list filters status and normalized dish query', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const executor: ParameterizedQueryExecutor = {
    async query(sql, values) {
      calls.push({ sql, values });
      return { rows: [adminAssetRow()] };
    }
  };
  const items = await listAdminDishImages(executor, { status: 'ready', q: ' 西 红 柿 ', limit: 200 });
  assert.equal(items[0].id, 'b1000000-0000-4000-8000-000000000001');
  assert.equal(items[0].status, 'READY');
  assert.deepEqual(calls[0].values, ['READY', '西红柿', '西 红 柿', 100]);
});

test('admin dish image update validates READY metadata, current asset and audit log', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const executor: ParameterizedQueryExecutor = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM dish_assets asset') && sql.includes('WHERE asset.id')) {
        return { rows: [adminAssetRow({ is_current: false, storage_key: null, mime_type: null, width: null, height: null })] };
      }
      if (sql.includes('SET is_current = false')) return { rows: [] };
      if (sql.includes('UPDATE dish_assets asset')) {
        return {
          rows: [adminAssetRow({
            storage_key: 'ops/tomato-v2.webp',
            mime_type: 'image/webp',
            width: 1024,
            height: 1024,
            is_current: true
          })]
        };
      }
      if (sql.includes('INSERT INTO admin_audit_logs')) return { rows: [] };
      throw new Error(`unexpected ${sql}`);
    }
  };

  const updated = await updateAdminDishImage(
    executor,
    'b1000000-0000-4000-8000-000000000001',
    {
      status: 'READY',
      storageKey: 'ops/tomato-v2.webp',
      mimeType: 'image/webp',
      width: 1024,
      height: 1024,
      isCurrent: true
    },
    { actorId: 'ops-user', reason: 'replace blurry image', requestId: 'req-1' }
  );
  assert.equal(updated.storageKey, 'ops/tomato-v2.webp');
  assert.equal(updated.isCurrent, true);
  assert.ok(calls.some((call) => call.sql.includes('SET is_current = false')));
  const updateCall = calls.find((call) => call.sql.includes('UPDATE dish_assets asset'));
  assert.equal(updateCall?.values?.[11], 'ops-user');
  const auditCall = calls.find((call) => call.sql.includes('INSERT INTO admin_audit_logs'));
  assert.ok(auditCall);
  assert.equal(auditCall?.values?.[2], 'dish_image.update');
});

test('admin dish image update rejects READY assets without image metadata', async () => {
  const executor: ParameterizedQueryExecutor = {
    async query(sql) {
      if (sql.includes('FROM dish_assets asset')) {
        return { rows: [adminAssetRow({ status: 'PENDING', storage_key: null, mime_type: null, width: null, height: null })] };
      }
      throw new Error('update must not run');
    }
  };
  await assert.rejects(
    () => updateAdminDishImage(
      executor,
      'b1000000-0000-4000-8000-000000000001',
      { status: 'READY' },
      { actorId: 'ops-user' }
    ),
    /READY 图片必须包含/
  );
});

test('admin dish image regenerate only marks pending with rules provider', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const executor: ParameterizedQueryExecutor = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM dish_assets asset') && sql.includes('WHERE asset.id')) {
        return { rows: [adminAssetRow()] };
      }
      if (sql.includes('UPDATE dish_assets asset')) {
        return { rows: [adminAssetRow({ status: 'PENDING', is_current: false, failure_code: null, failure_summary: null })] };
      }
      if (sql.includes('INSERT INTO admin_audit_logs')) return { rows: [] };
      throw new Error(`unexpected ${sql}`);
    }
  };
  const result = await regenerateAdminDishImage(
    executor,
    'b1000000-0000-4000-8000-000000000001',
    { actorId: 'ops-user' }
  );
  assert.equal(result.provider, 'rules');
  assert.equal(result.generationJobId, null);
  assert.equal(result.asset.status, 'PENDING');
  assert.ok(calls.some((call) => call.sql.includes("status = 'PENDING'")));
  assert.equal(calls.find((call) => call.sql.includes('INSERT INTO admin_audit_logs'))?.values?.[2], 'dish_image.regenerate_requested');
});

test('admin dish alias creation normalizes names and writes audit log', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const executor: ParameterizedQueryExecutor = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM canonical_dishes')) {
        return { rows: [{ id: 'a1000000-0000-4000-8000-000000000001', display_name: '番茄炒蛋', status: 'ACTIVE' }] };
      }
      if (sql.includes('INSERT INTO dish_aliases')) {
        return {
          rows: [{
            id: 'c1000000-0000-4000-8000-000000000001',
            canonical_dish_id: 'a1000000-0000-4000-8000-000000000001',
            raw_name: '西 红 柿 炒 鸡 蛋',
            normalized_name: '西红柿炒鸡蛋',
            locale: 'zh-CN',
            created_by: 'ops-user',
            created_at: '2026-08-05T00:00:00.000Z'
          }]
        };
      }
      if (sql.includes('INSERT INTO admin_audit_logs')) return { rows: [] };
      throw new Error(`unexpected ${sql}`);
    }
  };
  const alias = await createAdminDishAlias(
    executor,
    {
      canonicalDishId: 'a1000000-0000-4000-8000-000000000001',
      rawName: '西 红 柿 炒 鸡 蛋'
    },
    { actorId: 'ops-user' }
  );
  assert.equal(alias.normalizedName, '西红柿炒鸡蛋');
  assert.equal(calls.find((call) => call.sql.includes('INSERT INTO dish_aliases'))?.values?.[3], '西红柿炒鸡蛋');
  assert.equal(calls.find((call) => call.sql.includes('INSERT INTO admin_audit_logs'))?.values?.[2], 'dish_alias.create');
});
