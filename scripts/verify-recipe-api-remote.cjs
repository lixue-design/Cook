'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function loadRemoteApi(wx) {
  const filename = path.join(rootDir, 'services/recipe-api-remote.js');
  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    require(id) {
      if (id === '../config/recipe-api') {
        return { cloudFunctionName: 'cookRecipeApi' };
      }
      if (id === '../config/cloudbase-env') return { businessEnvId: 'test-env' };
      if (id === './auth-state') return { handleApiError() {} };
      if (id === './diagnostics') return { recordFailure() {}, recordSuccess() {} };
      if (id === '../utils/recipe-image') {
        return {
          isLocalRecipeImagePath(value) { return /^(wxfile|file):/i.test(String(value || '')); },
          isTemporaryRecipeImagePath(value) { return /^wxfile:\/\/tmp/i.test(String(value || '')); }
        };
      }
      throw new Error(`Unexpected require in recipe-api-remote verification: ${id}`);
    },
    wx,
    console,
    __filename: filename,
    __dirname: path.dirname(filename)
  };

  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return module.exports;
}

function ok(data) {
  return Promise.resolve({ result: { ok: true, data } });
}

async function main() {
  const actions = [];
  const coverPath = 'user-hash/cover.jpg';
  const coverFileId = 'cloud://test-env/user-hash/cover.jpg';
  const wx = {
    cloud: {
      uploadFile({ cloudPath, filePath, config }) {
        assert.equal(cloudPath, coverPath);
        assert.match(filePath, /^wxfile:/);
        assert.equal(config.env, 'test-env');
        return Promise.resolve({ fileID: coverFileId });
      },
      callFunction({ name, data }) {
        actions.push({ name, data });
        assert.equal(name, 'cookRecipeApi');
        if (data.action === 'recipes.list' || data.action === 'recipes.catalog') {
          return ok({
            groups: [{
              id: 'home',
              name: '家常菜',
              recipeCount: 21,
              hasMore: data.action === 'recipes.list',
              nextOffset: data.action === 'recipes.list' ? 20 : null,
              recipes: [{
                id: '80000000-0000-4000-8000-000000000001',
                displayName: '番茄炒蛋',
                coverImageUrl: 'https://cdn.example/cover.jpg',
                durationMinutes: 15,
                caloriesKcal: 320
              }]
            }]
          });
        }
        if (data.action === 'recipes.detail') {
          return ok({
            id: data.payload.id,
            category: '家常菜',
            displayName: '番茄炒蛋',
            coverImageUrl: 'https://cdn.example/detail.jpg',
            durationMinutes: 15,
            caloriesKcal: 320,
            ingredients: [{ group: '主料', display: '番茄2个', items: [{ name: '番茄', amount: '2个' }] }],
            steps: [{ id: 'step-1', text: '下锅翻炒', imageUrl: '' }]
          });
        }
        if (data.action === 'covers.upload.prepare') {
          assert.equal(data.payload.contentType, 'image/jpeg');
          return ok({ cloudPath: coverPath });
        }
        if (data.action === 'covers.upload.complete') {
          assert.equal(data.payload.cloudPath, coverPath);
          assert.equal(data.payload.fileId, coverFileId);
          assert.equal(data.payload.contentType, 'image/jpeg');
          return ok({ storageKey: 'user-hash/cover.jpg', coverUrl: 'https://cdn.example/uploaded.jpg' });
        }
        if (data.action === 'recipes.create' || data.action === 'recipes.update') {
          return ok({
            id: data.payload.id || '80000000-0000-4000-8000-000000000002',
            displayName: data.payload.displayName,
            coverUrl: data.payload.coverUrl,
            customCoverStorageKey: data.payload.customCoverStorageKey,
            durationMinutes: Number(data.payload.duration),
            caloriesKcal: Number(data.payload.calories),
            ingredients: [],
            steps: data.payload.steps
          });
        }
        if (data.action === 'recipes.delete') return ok(true);
        if (data.action === 'categories.list') {
          return ok({ categories: [{ id: 'home', name: '家常菜', recipeCount: 1, sortOrder: 10 }] });
        }
        if (
          data.action === 'categories.create'
          || data.action === 'categories.rename'
          || data.action === 'categories.delete'
          || data.action === 'categories.reorder'
        ) {
          return ok({ groups: [{ id: 'home', name: data.payload.name || '家常菜', recipes: [] }] });
        }
        throw new Error(`Unexpected action ${data.action}`);
      }
    }
  };

  const api = loadRemoteApi(wx);
  const groups = await api.fetchRecipeGroups();
  assert.equal(groups[0].recipes[0].title, '番茄炒蛋');
  assert.equal(groups[0].recipes[0].coverUrl, 'https://cdn.example/cover.jpg');
  assert.equal(groups[0].recipes[0].duration, '15分钟');
  assert.equal(groups[0].recipes[0].calories, '320kcal');
  assert.equal('steps' in groups[0].recipes[0], false, '列表数据不应保留详情步骤');
  assert.equal('mainIngredients' in groups[0].recipes[0], false, '列表数据不应保留详情食材');

  const firstPage = await api.fetchRecipeListPage();
  assert.equal(firstPage[0].recipeCount, 21);
  assert.equal(firstPage[0].hasMore, true);
  assert.equal(firstPage[0].nextOffset, 20);
  const pageAction = actions.find((item) => item.data.action === 'recipes.list');
  assert.equal(JSON.stringify(pageAction.data.payload), JSON.stringify({ categoryId: '', offset: 0 }));
  const catalogAction = actions.find((item) => item.data.action === 'recipes.catalog');
  assert.ok(catalogAction, '完整目录读取应使用 recipes.catalog，不复用分页列表接口');

  const detail = await api.fetchRecipeDetail('80000000-0000-4000-8000-000000000001');
  assert.equal(detail.heroImage, 'https://cdn.example/detail.jpg');
  assert.equal(detail.ingredients[0].items[0].amount, '2个');

  const created = await api.createRecipe({
    name: '番茄炒蛋',
    duration: '15',
    calories: '320',
    coverUrl: 'wxfile://tmp-cover.jpg',
    steps: [{ id: 'step-1', text: '下锅翻炒', imageUrl: 'wxfile://tmp-step.jpg' }]
  });
  assert.equal(created.customCoverStorageKey, 'user-hash/cover.jpg');
  const createAction = actions.find((item) => item.data.action === 'recipes.create');
  assert.equal(createAction.data.payload.customCoverStorageKey, 'user-hash/cover.jpg');
  assert.equal(
    JSON.stringify(createAction.data.payload.steps),
    JSON.stringify([{ id: 'step-1', text: '下锅翻炒', imageUrl: '' }])
  );

  const persistedCreated = await api.createRecipe({ name: '持久封面', coverUrl: 'wxfile://store_recipe-cover.jpg' });
  assert.equal(persistedCreated.coverUrl, 'https://cdn.example/uploaded.jpg');

  const updated = await api.updateRecipe('80000000-0000-4000-8000-000000000002', { name: '番茄炒蛋升级版' });
  assert.equal(updated.id, '80000000-0000-4000-8000-000000000002');

  const deleted = await api.deleteRecipe('80000000-0000-4000-8000-000000000002');
  assert.equal(deleted, true);

  const categories = await api.getRecipeCategories();
  assert.equal(categories[0].name, '家常菜');
  assert.equal(categories[0].recipeCount, 1);

  const createdGroups = await api.createRecipeCategory('快手菜');
  assert.equal(createdGroups[0].name, '快手菜');
  assert.deepEqual(createdGroups[0].recipes, []);

  const renamedGroups = await api.renameRecipeCategory('home', '家常小炒');
  assert.equal(renamedGroups[0].name, '家常小炒');

  const deletedGroups = await api.deleteRecipeCategory('home');
  assert.equal(deletedGroups[0].name, '家常菜');

  const reorderedGroups = await api.reorderRecipeCategories(['home']);
  assert.equal(reorderedGroups[0].id, 'home');

  const failingApi = loadRemoteApi({
    cloud: {
      callFunction() {
        return Promise.resolve({
          result: { ok: false, error: { code: 'DATABASE_UNAVAILABLE', message: '数据库就绪检查失败' } }
        });
      }
    }
  });

  await assert.rejects(
    () => failingApi.fetchRecipeGroups(),
    (error) => error.code === 'DATABASE_UNAVAILABLE' && /数据库就绪检查失败/.test(error.message)
  );

  const uploadFailingApi = loadRemoteApi({
    cloud: {
      uploadFile: wx.cloud.uploadFile,
      callFunction({ data }) {
        if (data.action === 'covers.upload.prepare') return ok({ cloudPath: coverPath });
        if (data.action === 'covers.upload.complete') {
          return Promise.resolve({
            result: { ok: false, error: { code: 'UPLOAD_TOO_LARGE', message: '图片不能超过5MB' } }
          });
        }
        return ok({});
      }
    }
  });

  await assert.rejects(
    () => uploadFailingApi.createRecipe({ name: '大图测试', coverUrl: 'wxfile://large-cover.jpg' }),
    (error) => error.code === 'UPLOAD_TOO_LARGE' && error.message === '图片不能超过5MB'
  );

  console.log('recipe-api remote verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
