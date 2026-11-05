'use strict';

const { imageLibraryBaseUrl } = require('../config/recipe-api');

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

function absoluteImageUrl(path) {
  const value = String(path || '');
  if (/^https?:\/\//i.test(value)) return value;
  return `${trimTrailingSlash(imageLibraryBaseUrl)}${value.startsWith('/') ? value : `/${value}`}`;
}

function searchDishImages(keyword, limit = 5) {
  const query = String(keyword || '').trim();
  if (!query) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${trimTrailingSlash(imageLibraryBaseUrl)}/api/dish-images/search`,
      method: 'GET',
      data: { q: query, limit },
      timeout: 180000,
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error('图片库搜索失败'));
          return;
        }
        const items = response.data && Array.isArray(response.data.items) ? response.data.items : [];
        resolve(items.map((item) => ({
          ...item,
          imageUrl: absoluteImageUrl(item.imageUrl)
        })));
      },
      fail() {
        reject(new Error('无法连接本地图片库'));
      }
    });
  });
}

function requestDishImageGenerationPlaceholder(dishName) {
  const query = String(dishName || '').trim();
  if (!query) return Promise.reject(new Error('菜名不能为空'));
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${trimTrailingSlash(imageLibraryBaseUrl)}/api/dish-images/generate`,
      method: 'POST',
      data: { dishName: query, provider: 'rules' },
      timeout: 180000,
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const message = response.data && response.data.error ? response.data.error : '图库待补创建失败';
          reject(new Error(message));
          return;
        }
        resolve(response.data || {});
      },
      fail() {
        reject(new Error('无法连接本地图片库'));
      }
    });
  });
}

module.exports = { searchDishImages, requestDishImageGenerationPlaceholder };
