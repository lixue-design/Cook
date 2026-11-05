'use strict';

const https = require('node:https');

const MAX_REDIRECTS = 4;
const MAX_RESPONSE_BYTES = 512 * 1024;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_LINK_TEXT_LENGTH = 5000;

function linkError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function isSupportedXiaohongshuHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'xiaohongshu.com'
    || host.endsWith('.xiaohongshu.com')
    || host === 'xhslink.com'
    || host.endsWith('.xhslink.com')
    || host === 'xhslink.cn'
    || host.endsWith('.xhslink.cn');
}

function validateLink(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw linkError('LINK_INVALID_URL');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !isSupportedXiaohongshuHost(url.hostname)) {
    throw linkError('LINK_NOT_SUPPORTED');
  }
  return url;
}

function extractSupportedLink(value) {
  const source = String(value || '').trim();
  const candidates = source.match(/https:\/\/[^\s]+/gi) || [];
  if (!candidates.length) return validateLink(source);
  let lastError = null;
  for (const candidate of candidates) {
    const normalized = candidate.replace(/[，。；;！!？?）)】\]}>]+$/u, '');
    try {
      return validateLink(normalized);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || linkError('LINK_INVALID_URL');
}

function requestPublicPage(url, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CookRecipeImporter/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    }, (response) => {
      const statusCode = Number(response.statusCode || 0);
      const location = String(response.headers.location || '');
      if (statusCode >= 300 && statusCode < 400 && location) {
        response.resume();
        if (redirectsLeft <= 0) return reject(linkError('LINK_TOO_MANY_REDIRECTS'));
        let redirected;
        try {
          redirected = validateLink(new URL(location, url).toString());
        } catch (error) {
          return reject(error);
        }
        return resolve(requestPublicPage(redirected, redirectsLeft - 1));
      }
      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        return reject(linkError('LINK_FETCH_FAILED'));
      }
      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      if (contentType && !contentType.includes('text/html')) {
        response.resume();
        return reject(linkError('LINK_CONTENT_UNAVAILABLE'));
      }
      const chunks = [];
      let total = 0;
      response.on('data', (chunk) => {
        total += chunk.length;
        if (total > MAX_RESPONSE_BYTES) {
          request.destroy(linkError('LINK_RESPONSE_TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      response.on('error', reject);
    });
    request.setTimeout(REQUEST_TIMEOUT_MS, () => request.destroy(linkError('LINK_FETCH_TIMEOUT')));
    request.on('error', reject);
    request.end();
  });
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, entity) => {
      const number = String(entity).toLowerCase().startsWith('x')
        ? Number.parseInt(String(entity).slice(1), 16)
        : Number.parseInt(entity, 10);
      return Number.isFinite(number) ? String.fromCodePoint(number) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAttributes(tag) {
  const attributes = {};
  String(tag || '').replace(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g, (_, key, quoted, singleQuoted, bare) => {
    attributes[String(key).toLowerCase()] = quoted ?? singleQuoted ?? bare ?? '';
    return '';
  });
  return attributes;
}

function findMeta(html, names) {
  const expected = new Set(names.map((name) => name.toLowerCase()));
  const tags = String(html || '').match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attributes = parseAttributes(tag);
    const key = String(attributes.property || attributes.name || '').toLowerCase();
    if (expected.has(key) && attributes.content) return decodeHtml(attributes.content);
  }
  return '';
}

function findJsonLdValue(html, field) {
  const scripts = String(html || '').match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const content = script.replace(/^.*?>/s, '').replace(/<\/script>$/i, '');
    try {
      const data = JSON.parse(content);
      const values = Array.isArray(data) ? data : [data];
      for (const value of values) {
        if (value && typeof value[field] === 'string' && value[field].trim()) return decodeHtml(value[field]);
      }
    } catch {
      // A malformed metadata block should not make the whole import fail.
    }
  }
  return '';
}

function extractPublicLinkContent(html) {
  const title = findMeta(html, ['og:title', 'twitter:title'])
    || findJsonLdValue(html, 'name')
    || decodeHtml((String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const body = findMeta(html, ['og:description', 'description', 'twitter:description'])
    || findJsonLdValue(html, 'description');
  const normalizedTitle = Array.from(title).slice(0, 160).join('');
  const normalizedBody = Array.from(body).slice(0, MAX_LINK_TEXT_LENGTH).join('');
  if (!normalizedTitle || !normalizedBody) throw linkError('LINK_CONTENT_UNAVAILABLE');
  return { title: normalizedTitle, body: normalizedBody };
}

async function extractXiaohongshuLinkContent(value) {
  const url = extractSupportedLink(value);
  const html = await requestPublicPage(url);
  return extractPublicLinkContent(html);
}

module.exports = {
  MAX_RESPONSE_BYTES,
  MAX_LINK_TEXT_LENGTH,
  validateLink,
  extractSupportedLink,
  extractPublicLinkContent,
  extractXiaohongshuLinkContent
};
