'use strict';

const assert = require('node:assert/strict');
const {
  validateLink,
  extractSupportedLink,
  extractPublicLinkContent
} = require('../cloudfunctions/cookRecipeTextAi/link-content');

assert.equal(validateLink('https://xhslink.com/example').hostname, 'xhslink.com');
assert.equal(validateLink('https://xhslink.cn/example').hostname, 'xhslink.cn');
assert.equal(validateLink('https://www.xiaohongshu.com/explore/example').hostname, 'www.xiaohongshu.com');
assert.throws(() => validateLink('http://www.xiaohongshu.com/explore/example'), /LINK_NOT_SUPPORTED/);
assert.throws(() => validateLink('https://example.com/recipe'), /LINK_NOT_SUPPORTED/);
assert.throws(() => validateLink('https://127.0.0.1/'), /LINK_NOT_SUPPORTED/);
assert.equal(
  extractSupportedLink('一人食｜番茄炒蛋 https://xhslink.cn/o/2XT0cQQy8Gk 存好这段口令，去【小红书】查看原文~').toString(),
  'https://xhslink.cn/o/2XT0cQQy8Gk'
);
assert.equal(
  extractSupportedLink('复制链接：https://www.xiaohongshu.com/explore/example。').toString(),
  'https://www.xiaohongshu.com/explore/example'
);

const parsed = extractPublicLinkContent(`
  <html><head>
    <meta property="og:title" content="番茄炒蛋做法 &amp; 技巧" />
    <meta name="description" content="番茄2个，鸡蛋3个。热锅炒蛋，再与番茄翻炒。" />
  </head></html>
`);
assert.equal(parsed.title, '番茄炒蛋做法 & 技巧');
assert.equal(parsed.body, '番茄2个，鸡蛋3个。热锅炒蛋，再与番茄翻炒。');
assert.throws(() => extractPublicLinkContent('<title>只有标题</title>'), /LINK_CONTENT_UNAVAILABLE/);
console.log('recipe link parser checks passed');
