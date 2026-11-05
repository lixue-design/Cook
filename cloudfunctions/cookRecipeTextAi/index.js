'use strict';

const cloudbase = require('@cloudbase/node-sdk');
const { MAX_TEXT_LENGTH, parseModelJson, normalizeRecipeDraft } = require('./recipe-draft');
const { extractXiaohongshuLinkContent } = require('./link-content');

const app = cloudbase.init({ env: process.env.SCF_NAMESPACE });
const model = app.ai().createModel('cloudbase');
const MAX_OCR_TEXT_LENGTH = 20000;

const SYSTEM_PROMPT = [
  '你是中文菜谱结构化助手。根据用户提供的文本生成可编辑菜谱草稿。',
  '只返回合法 JSON，不要 Markdown、解释或其他文字。',
  'JSON 格式：{"title":"","category":"","duration":"","calories":"","mainIngredients":"","sideIngredients":"","seasonings":"","steps":[{"text":""}]}。',
  'title：简洁菜名，最多 12 个字；不加“做法”“教程”等词。',
  'category：仅可选“爽口凉菜、家常小炒、大口吃肉、一碗鲜汤、饱腹主食”；无法判断则留空。',
  '食材按主料、辅料、调味料归类，用“、”分隔；格式为“食材名称用量”，如“番茄2个”。',
  'duration 仅填分钟数字；calories 仅填千卡数字；原文没有则留空。',
  'steps：按烹饪顺序拆分，每步简洁、可执行；保留原文明确的火候、时间和状态，不补充原文没有的信息。'
].join('');

function failure(code, message) {
  return { ok: false, error: { code, message } };
}

function ocrError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function linkMessage(code) {
  const messages = {
    LINK_INVALID_URL: '请输入完整的小红书链接',
    LINK_NOT_SUPPORTED: '目前仅支持小红书公开链接',
    LINK_CONTENT_UNAVAILABLE: '未读取到笔记标题或正文，请复制正文或上传截图',
    LINK_FETCH_TIMEOUT: '链接读取超时，请稍后重试或复制正文',
    LINK_FETCH_FAILED: '链接暂时无法读取，请复制正文或上传截图',
    LINK_RESPONSE_TOO_LARGE: '链接内容过大，请复制正文或上传截图',
    LINK_TOO_MANY_REDIRECTS: '链接跳转异常，请复制正文或上传截图'
  };
  return messages[code] || '链接暂时无法读取，请复制正文或上传截图';
}

function createOcrClient() {
  // 事件云函数运行时注入的是临时凭证；不要在代码或函数配置中保存长期密钥。
  const secretId = String(process.env.TENCENTCLOUD_SECRETID || '');
  const secretKey = String(process.env.TENCENTCLOUD_SECRETKEY || '');
  const token = String(process.env.TENCENTCLOUD_SESSIONTOKEN || '');
  if (!secretId || !secretKey) throw ocrError('OCR_CREDENTIAL_UNAVAILABLE');
  const tencentcloud = require('tencentcloud-sdk-nodejs-ocr');
  return new tencentcloud.ocr.v20181119.Client({
    credential: { secretId, secretKey, token },
    region: 'ap-shanghai',
    profile: { httpProfile: { endpoint: 'ocr.tencentcloudapi.com' } }
  });
}

async function extractTextFromImage(imageFileId) {
  const urlResult = await app.getTempFileURL({ fileList: [imageFileId] });
  const temporaryUrl = String(urlResult && urlResult.fileList && urlResult.fileList[0] && urlResult.fileList[0].tempFileURL || '');
  if (!temporaryUrl) throw ocrError('OCR_IMAGE_URL_UNAVAILABLE');
  const result = await createOcrClient().GeneralBasicOCR({ ImageUrl: temporaryUrl });
  const text = (Array.isArray(result && result.TextDetections) ? result.TextDetections : [])
    .map((item) => String(item && item.DetectedText || '').trim())
    .filter(Boolean)
    .join('\n');
  if (!text) throw ocrError('OCR_EMPTY_RESULT');
  return Array.from(text).slice(0, MAX_OCR_TEXT_LENGTH).join('');
}

async function removeTemporaryImage(imageFileId) {
  try {
    await app.deleteFile({ fileList: [imageFileId] });
  } catch {
    console.error('[recipe-image-ocr]', { cleanupFailed: true });
  }
}

exports.main = async (event) => {
  const text = String(event && event.text || '').trim();
  const imageFileId = String(event && event.imageFileId || '').trim();
  const sourceUrl = String(event && event.sourceUrl || '').trim();
  const suppliedCount = [text, imageFileId, sourceUrl].filter(Boolean).length;
  if (!suppliedCount) return failure('INVALID_ARGUMENT', '请输入菜谱内容、选择菜谱图片或粘贴链接');
  if (suppliedCount > 1) return failure('INVALID_ARGUMENT', '一次只能解析文本、一张图片或一个链接');
  if (Array.from(text).length > MAX_TEXT_LENGTH) {
    return failure('INVALID_ARGUMENT', `菜谱内容不能超过 ${MAX_TEXT_LENGTH} 个字`);
  }

  try {
    const sourceType = imageFileId ? 'image' : sourceUrl ? 'link' : 'text';
    const linkContent = sourceUrl ? await extractXiaohongshuLinkContent(sourceUrl) : null;
    const sourceText = imageFileId
      ? await extractTextFromImage(imageFileId)
      : linkContent
        ? `标题：${linkContent.title}\n正文：${linkContent.body}`
        : text;
    const result = await model.generateText({
      model: 'hy3',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: sourceText }
      ]
    });
    const draft = normalizeRecipeDraft(parseModelJson(result.text), sourceType);
    console.log('[recipe-generation-ai]', { sourceType, totalTokens: Number(result.usage && result.usage.total_tokens || 0) });
    return { ok: true, data: { draft } };
  } catch (error) {
    console.error('[recipe-generation-ai]', {
      failed: true,
      sourceType: imageFileId ? 'image' : sourceUrl ? 'link' : 'text',
      errorCode: String(error && (error.code || error.name) || 'UNKNOWN')
    });
    const errorCode = String(error && error.code || '');
    if (sourceUrl && errorCode.startsWith('LINK_')) return failure(errorCode, linkMessage(errorCode));
    return failure(imageFileId ? 'OCR_GENERATION_FAILED' : 'GENERATION_FAILED', imageFileId ? '图片文字识别失败，请换清晰截图或手动填写' : 'AI 暂时无法生成菜谱，请稍后重试或手动填写');
  } finally {
    if (imageFileId) await removeTemporaryImage(imageFileId);
  }
};
