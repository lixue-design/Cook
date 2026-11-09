import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { handleRecipeApiEvent, recipeApiInternals, type CoverStorage, type RpcExecutor } from '../src/recipe-api';

const identity = { userId: 'cloudbase-user-1', appId: 'wx-test-app', openId: 'openid-1' };

const covers = (): CoverStorage & {
  uploads: string[];
  objects: Array<{ path: string; bytes: Uint8Array; contentType: string }>;
} => {
  const uploads: string[] = [];
  const objects: Array<{ path: string; bytes: Uint8Array; contentType: string }> = [];
  return {
    uploads,
    objects,
    async upload(path, bytes, contentType) {
      uploads.push(path);
      objects.push({ path, bytes, contentType });
    },
    async signedUrls(paths) {
      return Object.fromEntries(paths.map((path) => [path, `https://signed.example/${path}`]));
    }
  };
};

test('recipe API uses only verified server identity and maps it before reads', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'ai_dish_library_list_recipes') return [] as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleRecipeApiEvent(
    { action: 'recipes.list', payload: { userId: 'forged-user' } },
    { getIdentity: async () => identity, rpc, covers: covers() }
  );
  assert.deepEqual(result, { ok: true, data: [] });
  assert.equal(calls[0].name, 'ai_dish_library_ensure_user');
  assert.equal(calls[0].args.p_user_id, identity.userId);
  assert.equal(calls[1].args.p_owner_id, identity.userId);
  assert.equal(calls[1].args.p_category_id, null);
  assert.equal(calls[1].args.p_offset, 0);
  assert.equal(calls[1].args.p_limit, 20);
});

test('twelve-character recipe names round-trip and keep compatibility fields', async () => {
  const longName = '家庭版秘制番茄牛腩汤菜谱';
  let capturedPayload: Record<string, unknown> | undefined;
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'ai_dish_library_create_recipe') {
        capturedPayload = args.p_payload as Record<string, unknown>;
        return {
          id: '80000000-0000-4000-8000-000000000001',
          rawName: longName,
          displayName: longName,
          canonicalDishId: '81000000-0000-4000-8000-000000000001',
          coverMode: 'FOLLOW_LIBRARY',
          categoryName: '一碗鲜汤',
          durationMinutes: 95,
          caloriesKcal: 488,
          steps: []
        } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleRecipeApiEvent(
    { action: 'recipes.create', payload: { name: longName, category: '一碗鲜汤', duration: '95', calories: '488' } },
    { getIdentity: async () => identity, rpc, covers: covers() }
  );
  assert.equal(capturedPayload?.rawName, longName);
  assert.equal(capturedPayload?.displayName, longName);
  assert.equal(result.ok, true);
  if (result.ok) {
    const recipe = result.data as Record<string, unknown>;
    assert.equal(recipe.title, longName);
    assert.equal(recipe.rawName, longName);
    assert.equal(recipe.displayName, longName);
    assert.equal(recipe.duration, '95分钟');
    assert.equal(recipe.calories, '488kcal');
  }
});

test('a caller cannot attach another users custom cover path', async () => {
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      throw new Error('create RPC must not run');
    }
  };
  const result = await handleRecipeApiEvent(
    { action: 'recipes.create', payload: {
      name: '越权封面测试', customCoverStorageKey: 'another-user/cover.jpg'
    } },
    { getIdentity: async () => identity, rpc, covers: covers() }
  );
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'FORBIDDEN', message: '不能使用其他用户的封面' }
  });
});

test('create rejects invalid recipe form fields before persistence', async () => {
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      throw new Error('create RPC must not run');
    }
  };
  const dependencies = { getIdentity: async () => identity, rpc, covers: covers() };
  for (const payload of [
    { name: '', duration: '12' },
    { name: '零耗时', duration: '0' },
    { name: '耗时过长', duration: '1000' },
    { name: '小数热量', calories: '1.5' },
    { name: '热量过高', calories: '10000' },
    { name: '菜'.repeat(13) },
    { name: '分类过长', category: '一二三四五六七八九' },
    { name: '步骤过长', steps: [{ text: '步'.repeat(501) }] }
  ]) {
    const result = await handleRecipeApiEvent({ action: 'recipes.create', payload }, dependencies);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'INVALID_ARGUMENT');
  }
});

test('custom cover upload saves an original plus a compact WebP list thumbnail', async () => {
  const coverStorage = covers();
  const original = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#f15a24' }
  }).png().toBuffer();
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleRecipeApiEvent(
    { action: 'covers.upload', payload: {
      contentType: 'image/png',
      base64: original.toString('base64')
    } },
    { getIdentity: async () => identity, rpc, covers: coverStorage }
  );
  assert.equal(result.ok, true);
  const prefix = recipeApiInternals.userStoragePrefix(identity.userId);
  assert.equal(coverStorage.uploads.length, 2);
  assert.match(coverStorage.uploads[0], new RegExp(`^${prefix}/[0-9a-f-]+\\.thumbnail\\.webp$`));
  assert.match(coverStorage.uploads[1], new RegExp(`^${prefix}/[0-9a-f-]+\\.original\\.png$`));
  assert.equal(coverStorage.objects[0].contentType, 'image/webp');
  assert.deepEqual(await sharp(coverStorage.objects[0].bytes).metadata().then((metadata) => ({
    format: metadata.format,
    width: metadata.width,
    height: metadata.height
  })), { format: 'webp', width: 480, height: 480 });
  if (result.ok) {
    const data = result.data as { storageKey: string; coverUrl: string };
    assert.equal(data.storageKey, coverStorage.uploads[1]);
    assert.equal(data.coverUrl, `https://signed.example/${data.storageKey}`);
  }
});

test('direct temporary cover upload is owner-scoped, stores the cover and clears the temporary file', async () => {
  const coverStorage = covers();
  const original = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#f15a24' }
  }).jpeg().toBuffer();
  const removed: string[] = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const dependencies = {
    getIdentity: async () => identity,
    rpc,
    covers: coverStorage,
    temporaryFiles: {
      async download(fileId: string) {
        assert.match(fileId, /^cloud:\/\/lixue-test\//);
        return original;
      },
      async remove(fileId: string) { removed.push(fileId); }
    }
  };

  const prepared = await handleRecipeApiEvent(
    { action: 'covers.upload.prepare', payload: { contentType: 'image/jpeg' } },
    dependencies
  );
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  const cloudPath = String((prepared.data as { cloudPath: string }).cloudPath);
  const prefix = recipeApiInternals.userStoragePrefix(identity.userId);
  assert.match(cloudPath, new RegExp(`^recipe-cover-uploads/${prefix}/[0-9a-f-]{36}\\.jpg$`));

  const completed = await handleRecipeApiEvent(
    {
      action: 'covers.upload.complete',
      payload: { contentType: 'image/jpeg', cloudPath, fileId: `cloud://lixue-test/${cloudPath}` }
    },
    dependencies
  );
  assert.equal(completed.ok, true);
  assert.equal(coverStorage.uploads.length, 2);
  assert.deepEqual(removed, [`cloud://lixue-test/${cloudPath}`]);
});

test('direct temporary cover upload rejects a file outside the caller path', async () => {
  const coverStorage = covers();
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleRecipeApiEvent(
    {
      action: 'covers.upload.complete',
      payload: {
        contentType: 'image/jpeg',
        cloudPath: 'recipe-cover-uploads/not-the-user/00000000-0000-4000-8000-000000000001.jpg',
        fileId: 'cloud://lixue-test/recipe-cover-uploads/not-the-user/00000000-0000-4000-8000-000000000001.jpg'
      }
    },
    {
      getIdentity: async () => identity,
      rpc,
      covers: coverStorage,
      temporaryFiles: {
        async download() { throw new Error('download must not run'); },
        async remove() { throw new Error('remove must not run'); }
      }
    }
  );
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'FORBIDDEN', message: '临时图片路径无效' }
  });
});

test('custom cover upload rejects unsupported formats and files over five megabytes', async () => {
  const coverStorage = covers();
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const unsupported = await handleRecipeApiEvent(
    { action: 'covers.upload', payload: {
      contentType: 'image/gif', base64: Buffer.from('gif').toString('base64')
    } },
    { getIdentity: async () => identity, rpc, covers: coverStorage }
  );
  assert.deepEqual(unsupported, {
    ok: false,
    error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: '只支持 JPEG、PNG 或 WebP 图片' }
  });

  const tooLarge = await handleRecipeApiEvent(
    { action: 'covers.upload', payload: {
      contentType: 'image/jpeg', base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')
    } },
    { getIdentity: async () => identity, rpc, covers: coverStorage }
  );
  assert.deepEqual(tooLarge, {
    ok: false,
    error: { code: 'UPLOAD_TOO_LARGE', message: '图片不能超过5MB' }
  });
  assert.equal(coverStorage.uploads.length, 0);
});

test('custom cover upload keeps a usable original when thumbnail generation fails', async () => {
  const coverStorage = covers();
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleRecipeApiEvent(
    { action: 'covers.upload', payload: {
      contentType: 'image/png',
      base64: Buffer.from('not-a-valid-image').toString('base64')
    } },
    { getIdentity: async () => identity, rpc, covers: coverStorage }
  );
  assert.equal(result.ok, true);
  assert.equal(coverStorage.uploads.length, 1);
  assert.match(coverStorage.uploads[0], /\/[0-9a-f-]+\.png$/);
  assert.doesNotMatch(coverStorage.uploads[0], /\.original\./);
});

test('list and detail actions return the page recipe contract with signed custom covers', async () => {
  const storageKey = `${recipeApiInternals.userStoragePrefix(identity.userId)}/cover.original.jpg`;
  const thumbnailStorageKey = `${recipeApiInternals.userStoragePrefix(identity.userId)}/cover.thumbnail.webp`;
  const row = {
    id: '80000000-0000-4000-8000-000000000010',
    rawName: '番茄炒蛋',
    displayName: '番茄炒蛋',
    canonicalDishId: '81000000-0000-4000-8000-000000000010',
    coverMode: 'CUSTOM',
    customCoverStorageKey: storageKey,
    categoryId: `${identity.userId}:category:test`,
    categoryName: '家常小炒',
    durationMinutes: 12,
    caloriesKcal: 209,
    mainIngredients: '番茄2个、鸡蛋 3 个',
    sideIngredients: '葱花、蒜末',
    seasonings: '盐、糖',
    steps: [{ id: 'step-1', text: '炒熟即可', imageUrl: 'https://cdn.example/step.jpg' }]
  };
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'ai_dish_library_list_recipes') {
        return [{ id: 'stir_fry', name: '家常小炒', recipes: [row] }] as T;
      }
      if (name === 'ai_dish_library_get_recipe') return row as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const list = await handleRecipeApiEvent(
    { action: 'recipes.list' },
    { getIdentity: async () => identity, rpc, covers: covers() }
  );
  assert.equal(list.ok, true);
  if (list.ok) {
    const groups = list.data as Array<{ recipes: Array<Record<string, unknown>> }>;
    assert.equal(groups[0].recipes[0].title, '番茄炒蛋');
    assert.equal(groups[0].recipes[0].coverUrl, `https://signed.example/${thumbnailStorageKey}`);
    assert.deepEqual(groups[0].recipes[0].crop, { width: 64, height: 64, left: 0, top: 0 });
    assert.equal('mainIngredients' in groups[0].recipes[0], false);
    assert.equal('steps' in groups[0].recipes[0], false);
  }

  const detail = await handleRecipeApiEvent(
    { action: 'recipes.detail', payload: { id: row.id } },
    { getIdentity: async () => identity, rpc, covers: covers() }
  );
  assert.equal(detail.ok, true);
  if (detail.ok) {
    const recipe = detail.data as {
      heroImage: string;
      ingredients: Array<{ group: string; items: Array<{ name: string; amount: string }> }>;
      steps: Array<{ text: string; imageUrl: string }>;
    };
    assert.equal(recipe.heroImage, `https://signed.example/${storageKey}`);
    assert.deepEqual(recipe.ingredients[0].items, [
      { name: '番茄', amount: '2个' },
      { name: '鸡蛋', amount: '3 个' }
    ]);
    assert.equal(recipe.steps[0].imageUrl, 'https://cdn.example/step.jpg');
  }
});

test('legacy custom cover keys keep using their original file in list views', () => {
  const legacyKey = `${recipeApiInternals.userStoragePrefix(identity.userId)}/cover.jpg`;
  assert.equal(recipeApiInternals.listCoverStorageKeyFor(legacyKey), legacyKey);
});

test('recipe list pages are owner-scoped, bounded and expose a category continuation', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'ai_dish_library_list_recipes') {
        return [{
          id: `${identity.userId}:category:home`,
          name: '家常小炒',
          recipeCount: 41,
          hasMore: true,
          nextOffset: 40,
          recipes: []
        }] as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleRecipeApiEvent(
    { action: 'recipes.list', payload: { categoryId: `${identity.userId}:category:home`, offset: 20 } },
    { getIdentity: async () => identity, rpc, covers: covers() }
  );
  assert.deepEqual(result, {
    ok: true,
    data: [{
      id: `${identity.userId}:category:home`,
      name: '家常小炒',
      recipeCount: 41,
      hasMore: true,
      nextOffset: 40,
      recipes: []
    }]
  });
  assert.deepEqual(calls[1], {
    name: 'ai_dish_library_list_recipes',
    args: {
      p_owner_id: identity.userId,
      p_category_id: `${identity.userId}:category:home`,
      p_offset: 20,
      p_limit: 20
    }
  });
});

test('create action persists sanitized form payload and strips temporary step images', async () => {
  const storageKey = `${recipeApiInternals.userStoragePrefix(identity.userId)}/cover.jpg`;
  let capturedPayload: Record<string, unknown> | undefined;
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'ai_dish_library_create_recipe') {
        capturedPayload = args.p_payload as Record<string, unknown>;
        return {
          id: args.p_recipe_id,
          rawName: '番茄炒蛋',
          displayName: '番茄炒蛋',
          canonicalDishId: args.p_canonical_dish_id,
          coverMode: 'CUSTOM',
          customCoverStorageKey: storageKey,
          categoryName: '家常小炒',
          durationMinutes: 12,
          caloriesKcal: 209,
          mainIngredients: '番茄2个',
          sideIngredients: '',
          seasonings: '盐少许',
          steps: capturedPayload?.steps as Array<{ id: string; text: string; imageUrl: string }>
        } as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleRecipeApiEvent(
    {
      action: 'recipes.create',
      payload: {
        name: '番茄炒蛋',
        category: '家常小炒',
        duration: '12',
        calories: '209',
        customCoverStorageKey: storageKey,
        mainIngredients: '番茄2个',
        seasonings: '盐少许',
        steps: [
          { id: 'step-1', text: '切番茄', imageUrl: 'wxfile://tmp-step.jpg' },
          { id: 'step-2', text: '下锅炒', imageUrl: 'https://cdn.example/step.jpg' }
        ]
      }
    },
    { getIdentity: async () => identity, rpc, covers: covers() }
  );
  assert.equal(result.ok, true);
  assert.equal(capturedPayload?.coverMode, 'CUSTOM');
  assert.equal(capturedPayload?.durationMinutes, 12);
  assert.deepEqual(capturedPayload?.steps, [
    { id: 'step-1', text: '切番茄', imageUrl: '' },
    { id: 'step-2', text: '下锅炒', imageUrl: 'https://cdn.example/step.jpg' }
  ]);
  if (result.ok) {
    const recipe = result.data as { heroImage: string; ingredients: Array<{ items: unknown[] }> };
    assert.equal(recipe.heroImage, `https://signed.example/${storageKey}`);
    assert.deepEqual(recipe.ingredients[0].items, [{ name: '番茄', amount: '2个' }]);
  }
});

test('update and delete actions call owner-scoped RPCs and return missing rows cleanly', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'ai_dish_library_update_recipe') return null as T;
      if (name === 'ai_dish_library_delete_recipe') return false as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const recipeId = '80000000-0000-4000-8000-000000000011';
  const updated = await handleRecipeApiEvent(
    { action: 'recipes.update', payload: { id: recipeId, name: '不存在的菜谱' } },
    { getIdentity: async () => identity, rpc, covers: covers() }
  );
  assert.deepEqual(updated, { ok: true, data: null });
  const deleted = await handleRecipeApiEvent(
    { action: 'recipes.delete', payload: { id: recipeId } },
    { getIdentity: async () => identity, rpc, covers: covers() }
  );
  assert.deepEqual(deleted, { ok: true, data: false });
  const updateCall = calls.find((call) => call.name === 'ai_dish_library_update_recipe');
  const deleteCall = calls.find((call) => call.name === 'ai_dish_library_delete_recipe');
  assert.equal(updateCall?.args.p_owner_id, identity.userId);
  assert.equal(deleteCall?.args.p_owner_id, identity.userId);
});

test('category actions use owner-scoped RPCs and return page-compatible groups', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const recipeRow = {
    id: '80000000-0000-4000-8000-000000000012',
    rawName: '手撕包菜',
    displayName: '手撕包菜',
    canonicalDishId: '81000000-0000-4000-8000-000000000012',
    coverMode: 'FOLLOW_LIBRARY',
    categoryId: `${identity.userId}:category:home`,
    categoryName: '家常菜',
    durationMinutes: 10,
    caloriesKcal: 120,
    steps: []
  };
  const rpc: RpcExecutor = {
    async call<T>(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      if (name === 'ai_dish_library_list_recipes') {
        return [{ id: `${identity.userId}:category:home`, name: '家常菜', recipes: [recipeRow] }] as T;
      }
      if (
        name === 'ai_dish_library_create_category'
        || name === 'ai_dish_library_rename_category'
        || name === 'ai_dish_library_delete_category'
        || name === 'ai_dish_library_reorder_categories'
      ) {
        return true as T;
      }
      throw new Error(`unexpected ${name}`);
    }
  };
  const dependencies = { getIdentity: async () => identity, rpc, covers: covers() };

  const listed = await handleRecipeApiEvent({ action: 'categories.list' }, dependencies);
  assert.equal(listed.ok, true);
  if (listed.ok) {
    assert.deepEqual(listed.data, [{ id: `${identity.userId}:category:home`, name: '家常菜', recipeCount: 1 }]);
  }

  for (const event of [
    { action: 'categories.create', payload: { name: '快手菜' } },
    { action: 'categories.rename', payload: { id: `${identity.userId}:category:home`, name: '家常小炒' } },
    { action: 'categories.delete', payload: { id: `${identity.userId}:category:home` } },
    { action: 'categories.reorder', payload: { orderedIds: [`${identity.userId}:category:home`] } }
  ]) {
    const result = await handleRecipeApiEvent(event, dependencies);
    assert.equal(result.ok, true);
    if (result.ok) {
      const groups = result.data as Array<{ id: string; recipes: Array<{ title: string }> }>;
      assert.equal(groups[0].id, `${identity.userId}:category:home`);
      assert.equal(groups[0].recipes[0].title, '手撕包菜');
    }
  }

  const createCall = calls.find((call) => call.name === 'ai_dish_library_create_category');
  const renameCall = calls.find((call) => call.name === 'ai_dish_library_rename_category');
  const deleteCall = calls.find((call) => call.name === 'ai_dish_library_delete_category');
  const reorderCall = calls.find((call) => call.name === 'ai_dish_library_reorder_categories');
  assert.equal(createCall?.args.p_owner_id, identity.userId);
  assert.match(String(createCall?.args.p_category_id), new RegExp(`^${identity.userId}:category:`));
  assert.equal(createCall?.args.p_name, '快手菜');
  assert.equal(renameCall?.args.p_owner_id, identity.userId);
  assert.equal(renameCall?.args.p_name, '家常小炒');
  assert.equal(deleteCall?.args.p_owner_id, identity.userId);
  assert.equal(reorderCall?.args.p_owner_id, identity.userId);
  assert.deepEqual(reorderCall?.args.p_ordered_ids, [`${identity.userId}:category:home`]);
});

test('category actions reject invalid input before write RPCs run', async () => {
  const calls: string[] = [];
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      calls.push(name);
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      throw new Error(`unexpected ${name}`);
    }
  };
  const result = await handleRecipeApiEvent(
    { action: 'categories.create', payload: { name: '   ' } },
    { getIdentity: async () => identity, rpc, covers: covers() }
  );
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'INVALID_ARGUMENT', message: '分类名称不能为空' }
  });
  assert.deepEqual(calls, ['ai_dish_library_ensure_user']);
});

test('recipe detail rejects malformed ids with a displayable error', async () => {
  const rpc: RpcExecutor = {
    async call<T>(name: string) {
      if (name === 'ai_dish_library_ensure_user') return identity.userId as T;
      throw new Error('detail RPC must not run for malformed ids');
    }
  };
  const result = await handleRecipeApiEvent(
    { action: 'recipes.detail', payload: { id: 'cabbage' } },
    { getIdentity: async () => identity, rpc, covers: covers() }
  );
  assert.deepEqual(result, {
    ok: false,
    error: { code: 'INVALID_ARGUMENT', message: '菜谱 ID 格式不正确' }
  });
});
