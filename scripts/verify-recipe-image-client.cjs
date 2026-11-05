'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function loadImageUtils(wx) {
  const filename = path.join(rootDir, 'utils/recipe-image.js');
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    exports: module.exports,
    require,
    wx,
    console,
    __filename: filename,
    __dirname: path.dirname(filename)
  }, { filename });
  return module.exports;
}

function createWxStub(overrides = {}) {
  const calls = [];
  const imageInfo = {
    '/tmp/large.jpg': { width: 4000, height: 3000, type: 'jpeg' },
    '/tmp/compressed.jpg': { width: 1280, height: 960, type: 'jpeg' },
    '/tmp/large-after-compress.jpg': { width: 1280, height: 960, type: 'jpeg' },
    '/tmp/animation.gif': { width: 100, height: 100, type: 'gif' }
  };
  const fileSize = {
    '/tmp/large.jpg': 6 * 1024 * 1024,
    '/tmp/compressed.jpg': 1024 * 1024,
    '/tmp/large-after-compress.jpg': 6 * 1024 * 1024,
    '/tmp/animation.gif': 100 * 1024
  };
  return {
    calls,
    getImageInfo({ src, success, fail }) {
      const result = { ...imageInfo[src], ...(overrides.imageInfo && overrides.imageInfo[src]) };
      if (result && result.width) success(result);
      else fail(new Error('missing image info'));
    },
    getFileInfo({ filePath, success, fail }) {
      const size = overrides.fileSize && overrides.fileSize[filePath] !== undefined
        ? overrides.fileSize[filePath]
        : fileSize[filePath];
      if (size !== undefined) success({ size });
      else fail(new Error('missing file info'));
    },
    compressImage(options) {
      calls.push(options);
      const tempFilePath = overrides.compressedPath || '/tmp/compressed.jpg';
      options.success({ tempFilePath });
    },
    saveFile(options) {
      calls.push(options);
      if (overrides.saveFileError) {
        options.fail(overrides.saveFileError);
        return;
      }
      options.success({ savedFilePath: overrides.savedFilePath || '/store/recipe-image.jpg' });
    }
  };
}

async function main() {
  const wx = createWxStub();
  const {
    prepareRecipeImage,
    persistRecipeImage,
    isLocalRecipeImagePath,
    isTemporaryRecipeImagePath,
    MAX_RECIPE_IMAGE_BYTES,
    MAX_RECIPE_IMAGE_LONG_SIDE
  } = loadImageUtils(wx);

  const prepared = await prepareRecipeImage('/tmp/large.jpg');
  assert.equal(prepared.filePath, '/tmp/compressed.jpg');
  assert.equal(prepared.width, 1280);
  assert.equal(prepared.height, 960);
  assert.equal(prepared.size, 1024 * 1024);
  assert.equal(prepared.compressed, true);
  assert.equal(wx.calls[0].compressedWidth, MAX_RECIPE_IMAGE_LONG_SIDE);
  assert.equal(wx.calls[0].compressedHeight, 960);

  const persistedPath = await persistRecipeImage(prepared.filePath);
  assert.equal(persistedPath, '/store/recipe-image.jpg');
  assert.equal(wx.calls[1].tempFilePath, '/tmp/compressed.jpg');
  assert.equal(isLocalRecipeImagePath('wxfile://store_recipe-image.jpg'), true);
  assert.equal(isTemporaryRecipeImagePath('wxfile://store_recipe-image.jpg'), false);
  assert.equal(isTemporaryRecipeImagePath('wxfile://tmp/recipe-image.jpg'), true);

  await assert.rejects(
    () => loadImageUtils(createWxStub({ saveFileError: new Error('save failed') })).persistRecipeImage('/tmp/large.jpg'),
    (error) => error.code === 'FILE_SAVE_FAILED' && /保存失败/.test(error.message)
  );

  await assert.rejects(
    () => prepareRecipeImage('/tmp/animation.gif'),
    (error) => error.code === 'UNSUPPORTED_MEDIA_TYPE' && /JPEG/.test(error.message)
  );

  const largeAfterCompressWx = createWxStub({ compressedPath: '/tmp/large-after-compress.jpg' });
  const largeAfterCompress = loadImageUtils(largeAfterCompressWx);
  await assert.rejects(
    () => largeAfterCompress.prepareRecipeImage('/tmp/large.jpg'),
    (error) => error.code === 'UPLOAD_TOO_LARGE' && error.message.includes('5MB')
  );

  assert.equal(MAX_RECIPE_IMAGE_BYTES, 5 * 1024 * 1024);
  console.log('recipe image client verification passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
