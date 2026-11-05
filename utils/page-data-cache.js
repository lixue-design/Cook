'use strict';

// 页面缓存只用于缩短再次打开页面时的等待，不作为业务数据的唯一来源。
// 每次命中后页面仍会发起后台刷新；用户切换账号时因缓存键包含用户 ID 而不会串数据。
const STORAGE_PREFIX = 'cook.page-cache.v1';
const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;
const MAX_PERSISTED_CHARS = 512 * 1024;
const memoryEntries = new Map();

function clone(value) {
  try { return JSON.parse(JSON.stringify(value)); } catch (error) { return null; }
}

function currentUserId() {
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    const user = app && app.globalData && app.globalData.currentUser;
    const id = String(user && user.id || '').trim();
    return id || '';
  } catch (error) {
    return '';
  }
}

function storageKey(type, scope, userId) {
  return `${STORAGE_PREFIX}.${encodeURIComponent(userId)}.${encodeURIComponent(type)}.${encodeURIComponent(scope)}`;
}

function remove(key) {
  memoryEntries.delete(key);
  try {
    if (wx && wx.removeStorageSync) wx.removeStorageSync(key);
  } catch (error) {
    // 内存缓存已清理；本地持久化清理失败不影响页面读取。
  }
}

function readPageCache(type, scope, options = {}) {
  const userId = currentUserId();
  if (!userId) return null;
  const key = storageKey(String(type || ''), String(scope || ''), userId);
  let entry = memoryEntries.get(key) || null;
  if (!entry) {
    try { entry = wx && wx.getStorageSync ? wx.getStorageSync(key) : null; } catch (error) { entry = null; }
  }
  const maxAge = Number(options.maxAgeMs || DEFAULT_MAX_AGE_MS);
  if (!entry || entry.userId !== userId || !Number.isFinite(Number(entry.savedAt)) || Date.now() - Number(entry.savedAt) > maxAge) {
    if (entry) remove(key);
    return null;
  }
  const data = clone(entry.data);
  if (data === null) {
    remove(key);
    return null;
  }
  memoryEntries.set(key, entry);
  return data;
}

function writePageCache(type, scope, data) {
  const userId = currentUserId();
  const copy = clone(data);
  if (!userId || copy === null) return false;
  const key = storageKey(String(type || ''), String(scope || ''), userId);
  const entry = { userId, savedAt: Date.now(), data: copy };
  memoryEntries.set(key, entry);
  try {
    const serialized = JSON.stringify(entry);
    if (serialized.length <= MAX_PERSISTED_CHARS && wx && wx.setStorageSync) {
      wx.setStorageSync(key, entry);
    } else if (wx && wx.removeStorageSync) {
      // 大列表仅保留在内存中，不能让旧的持久化版本在下次启动时被误用。
      wx.removeStorageSync(key);
    }
  } catch (error) {
    // 内存缓存仍可在本次小程序会话中生效。
  }
  return true;
}

function clearPageCache(type, scope) {
  const userId = currentUserId();
  if (!userId) return;
  remove(storageKey(String(type || ''), String(scope || ''), userId));
}

module.exports = {
  DEFAULT_MAX_AGE_MS,
  readPageCache,
  writePageCache,
  clearPageCache
};
