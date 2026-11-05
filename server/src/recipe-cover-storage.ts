/**
 * Storage-key conventions for user-uploaded recipe covers.
 *
 * New uploads use an explicit `.original.` marker. It lets card-style
 * consumers select the matching thumbnail without adding another field to a
 * recipe or changing existing cover keys. Older keys deliberately stay on the
 * original file as a safe compatibility fallback.
 */
const ORIGINAL_MARKER = '.original.';
const THUMBNAIL_MARKER = '.thumbnail.webp';

export const createCustomCoverStorageKeys = (prefix: string, id: string, extension: string): {
  original: string;
  thumbnail: string;
} => ({
  original: `${prefix}/${id}${ORIGINAL_MARKER}${extension}`,
  thumbnail: `${prefix}/${id}${THUMBNAIL_MARKER}`
});

export const thumbnailStorageKeyFor = (originalKey: string | null | undefined): string => {
  const key = String(originalKey || '');
  const markerIndex = key.lastIndexOf(ORIGINAL_MARKER);
  if (markerIndex <= 0) return '';

  const extension = key.slice(markerIndex + ORIGINAL_MARKER.length);
  if (!/^(?:jpe?g|png|webp)$/i.test(extension)) return '';
  return `${key.slice(0, markerIndex)}${THUMBNAIL_MARKER}`;
};

export const listCoverStorageKeyFor = (originalKey: string | null | undefined): string => (
  thumbnailStorageKeyFor(originalKey) || String(originalKey || '')
);
