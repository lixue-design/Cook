'use strict';

const STORAGE_KEY = 'cook.diagnostics';
const MAX_ENTRIES = 20;

function safeCode(value, fallback) {
  const code = String(value || fallback || 'UNKNOWN');
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : String(fallback || 'UNKNOWN');
}
function warningCodes(data) {
  return (Array.isArray(data && data.warnings) ? data.warnings : [])
    .map((warning) => safeCode(warning && warning.code, ''))
    .filter(Boolean);
}
function write(entry) {
  const safeEntry = {
    time: new Date().toISOString(),
    module: String(entry.module || 'unknown').slice(0, 32),
    action: String(entry.action || 'unknown').slice(0, 80),
    outcome: entry.outcome === 'failure' ? 'failure' : 'success'
  };
  if (entry.code) safeEntry.code = safeCode(entry.code);
  if (entry.requestId) safeEntry.requestId = String(entry.requestId).slice(0, 80);
  if (entry.warningCodes && entry.warningCodes.length) {
    safeEntry.warningCodes = entry.warningCodes.map((code) => safeCode(code)).slice(0, 10);
  }
  try {
    const previous = wx.getStorageSync(STORAGE_KEY);
    const entries = Array.isArray(previous) ? previous.slice(-(MAX_ENTRIES - 1)) : [];
    entries.push(safeEntry);
    wx.setStorageSync(STORAGE_KEY, entries);
  } catch (error) {
    // Diagnostics must never block the user action they describe.
  }
  if (typeof console !== 'undefined') console.warn('[cook-diagnostic]', safeEntry);
  return safeEntry;
}
function recordSuccess(module, action, data) {
  const warnings = warningCodes(data);
  if (!warnings.length) return null;
  return write({ module, action, outcome: 'success', warningCodes: warnings });
}
function recordFailure(module, action, error) {
  return write({
    module,
    action,
    outcome: 'failure',
    code: error && error.code,
    requestId: error && error.requestId
  });
}
function listDiagnostics() {
  try {
    const entries = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    return [];
  }
}

module.exports = { recordSuccess, recordFailure, listDiagnostics, STORAGE_KEY };
