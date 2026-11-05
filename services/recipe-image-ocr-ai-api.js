'use strict';

const cloudbaseEnv = require('../config/cloudbase-env');
const { mapDraftToForm } = require('./recipe-text-ai-api');

function fileExtension(filePath) {
  const matched = String(filePath || '').match(/\.([a-zA-Z0-9]{1,8})(?:$|[?#])/);
  return matched ? matched[1].toLowerCase() : 'jpg';
}

async function uploadTemporaryOcrImage(filePath) {
  const path = String(filePath || '').trim();
  if (!path) throw new Error('图片读取失败，请重试');
  const response = await wx.cloud.uploadFile({
    cloudPath: `recipe-ocr/${Date.now()}-${Math.random().toString(16).slice(2)}.${fileExtension(path)}`,
    filePath: path,
    config: { env: cloudbaseEnv.aiEnvId }
  });
  const fileId = String(response && response.fileID || '');
  if (!fileId) throw new Error('图片上传失败，请重试');
  return fileId;
}

async function generateRecipeDraftFromImage(filePath) {
  const imageFileId = await uploadTemporaryOcrImage(filePath);
  const response = await wx.cloud.callFunction({
    name: cloudbaseEnv.aiTextFunctionName,
    config: { env: cloudbaseEnv.aiEnvId },
    data: { imageFileId }
  });
  const result = response && response.result;
  if (!result || result.ok !== true || !result.data || !result.data.draft) {
    const error = new Error(result && result.error && result.error.message || '图片识别失败，请稍后重试');
    error.code = result && result.error && result.error.code || 'OCR_GENERATION_FAILED';
    throw error;
  }
  return { form: mapDraftToForm(result.data.draft) };
}

module.exports = { generateRecipeDraftFromImage, uploadTemporaryOcrImage };
