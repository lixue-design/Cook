'use strict';

const MAX_RECIPE_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_RECIPE_IMAGE_LONG_SIDE = 1280;
const COMPRESS_QUALITY = 80;
const LOCAL_RECIPE_IMAGE_PATTERN = /^(wxfile|file):/i;
const PERSISTED_RECIPE_IMAGE_PATTERN = /^wxfile:\/\/(?:store|usr)(?:[_/]|$)/i;
const TEMPORARY_REMOTE_IMAGE_PATTERN = /^https?:\/\/tmp/i;

const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};

function createImageError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isLocalRecipeImagePath(value) {
  return LOCAL_RECIPE_IMAGE_PATTERN.test(String(value || ''));
}

function isTemporaryRecipeImagePath(value) {
  const path = String(value || '');
  return TEMPORARY_REMOTE_IMAGE_PATTERN.test(path)
    || (isLocalRecipeImagePath(path) && !PERSISTED_RECIPE_IMAGE_PATTERN.test(path));
}

function callWx(method, options) {
  return new Promise((resolve, reject) => {
    if (!wx || typeof wx[method] !== 'function') {
      reject(createImageError('UNSUPPORTED_CLIENT', '当前微信版本不支持图片处理'));
      return;
    }
    wx[method]({
      ...options,
      success: resolve,
      fail: reject
    });
  });
}

function extensionFromPath(filePath) {
  const matched = String(filePath || '').toLowerCase().match(/\.([a-z0-9]+)(?:\?|#|$)/);
  return matched ? matched[1] : '';
}

function contentTypeFromImage(filePath, imageInfo) {
  const type = String((imageInfo && imageInfo.type) || '').toLowerCase();
  return CONTENT_TYPES[type] || CONTENT_TYPES[extensionFromPath(filePath)] || '';
}

function longSideOf(imageInfo) {
  return Math.max(Number(imageInfo && imageInfo.width || 0), Number(imageInfo && imageInfo.height || 0));
}

function compressedDimensions(imageInfo) {
  const width = Number(imageInfo && imageInfo.width || 0);
  const height = Number(imageInfo && imageInfo.height || 0);
  const longSide = Math.max(width, height);
  if (!width || !height || longSide <= MAX_RECIPE_IMAGE_LONG_SIDE) return {};
  const ratio = MAX_RECIPE_IMAGE_LONG_SIDE / longSide;
  return {
    compressedWidth: Math.max(1, Math.round(width * ratio)),
    compressedHeight: Math.max(1, Math.round(height * ratio))
  };
}

async function safeGetImageInfo(filePath) {
  try {
    return await callWx('getImageInfo', { src: filePath });
  } catch (error) {
    return null;
  }
}

async function safeGetFileSize(filePath, fallbackSize) {
  if (Number(fallbackSize) > 0) return Number(fallbackSize);
  try {
    const result = await callWx('getFileInfo', { filePath });
    return Number(result.size || 0);
  } catch (error) {
    return 0;
  }
}

async function compressImage(filePath, imageInfo) {
  const result = await callWx('compressImage', {
    src: filePath,
    quality: COMPRESS_QUALITY,
    ...compressedDimensions(imageInfo)
  });
  return result.tempFilePath || filePath;
}

async function prepareRecipeImage(filePath, fallbackSize = 0) {
  const sourcePath = String(filePath || '');
  if (!sourcePath) throw createImageError('INVALID_ARGUMENT', '图片路径为空');

  const sourceInfo = await safeGetImageInfo(sourcePath);
  const contentType = contentTypeFromImage(sourcePath, sourceInfo);
  if (!contentType) {
    throw createImageError('UNSUPPORTED_MEDIA_TYPE', '请选择 JPEG、PNG 或 WebP 图片');
  }

  let nextPath = sourcePath;
  let nextInfo = sourceInfo;
  let nextSize = await safeGetFileSize(nextPath, fallbackSize);
  const needsCompression = nextSize > MAX_RECIPE_IMAGE_BYTES || longSideOf(nextInfo) > MAX_RECIPE_IMAGE_LONG_SIDE;

  if (needsCompression) {
    nextPath = await compressImage(sourcePath, sourceInfo);
    nextInfo = await safeGetImageInfo(nextPath);
    nextSize = await safeGetFileSize(nextPath);
  }

  if (longSideOf(nextInfo) > MAX_RECIPE_IMAGE_LONG_SIDE) {
    throw createImageError('IMAGE_DIMENSION_TOO_LARGE', '图片最长边不能超过1280px，请压缩后重试');
  }
  if (nextSize > MAX_RECIPE_IMAGE_BYTES) {
    throw createImageError('UPLOAD_TOO_LARGE', '图片不能超过5MB，请压缩后重试');
  }

  return {
    filePath: nextPath,
    contentType,
    size: nextSize,
    width: Number(nextInfo && nextInfo.width || 0),
    height: Number(nextInfo && nextInfo.height || 0),
    compressed: nextPath !== sourcePath
  };
}

async function persistRecipeImage(filePath) {
  const sourcePath = String(filePath || '');
  if (!sourcePath) throw createImageError('INVALID_ARGUMENT', '图片路径为空');

  try {
    const result = await callWx('saveFile', { tempFilePath: sourcePath });
    const savedFilePath = String(result && result.savedFilePath || '');
    if (!savedFilePath) {
      throw createImageError('FILE_SAVE_FAILED', '图片保存失败，请重新选择');
    }
    return savedFilePath;
  } catch (error) {
    if (error && error.code) throw error;
    throw createImageError('FILE_SAVE_FAILED', '图片保存失败，请重新选择');
  }
}

module.exports = {
  MAX_RECIPE_IMAGE_BYTES,
  MAX_RECIPE_IMAGE_LONG_SIDE,
  isLocalRecipeImagePath,
  isTemporaryRecipeImagePath,
  prepareRecipeImage,
  persistRecipeImage
};
