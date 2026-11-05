'use strict';

const PRESET_AVATAR_URLS = [1, 2, 3, 4, 5, 6].map((index) => `/assets/profile/preset-avatar-${index}.png`);
const DEFAULT_NAME_PREFIX = '食光旅人 ';
const DEFAULT_SUFFIX_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function pick(random, length) {
  return Math.min(length - 1, Math.max(0, Math.floor(Number(random()) * length)));
}

function generateDefaultSuffix(random = Math.random) {
  let suffix = '';
  for (let index = 0; index < 4; index += 1) {
    suffix += DEFAULT_SUFFIX_ALPHABET[pick(random, DEFAULT_SUFFIX_ALPHABET.length)];
  }
  return suffix;
}

function generateDefaultProfile(random = Math.random) {
  const suffix = generateDefaultSuffix(random);
  return {
    nickName: `${DEFAULT_NAME_PREFIX}${suffix}`,
    avatarUrl: PRESET_AVATAR_URLS[pick(random, PRESET_AVATAR_URLS.length)],
    defaultProfileCode: suffix
  };
}

module.exports = {
  PRESET_AVATAR_URLS,
  DEFAULT_NAME_PREFIX,
  DEFAULT_SUFFIX_ALPHABET,
  generateDefaultSuffix,
  generateDefaultProfile
};
