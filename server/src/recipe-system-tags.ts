export type SystemTagSource = 'title' | 'title_alias' | 'ingredients' | 'steps' | 'category' | 'duration' | 'default_rule';
export type SystemTagConfidence = 'high' | 'medium' | 'low';

export type SystemTag = {
  value: string;
  source: SystemTagSource;
  confidence: SystemTagConfidence;
};

export type RecipeSystemTags = {
  tagVersion: number;
  mealTypes: SystemTag[];
  roles: SystemTag[];
  proteinTypes: SystemTag[];
  vegetables: SystemTag[];
  cookMethods: SystemTag[];
  timeLevel: SystemTag | null;
  isOneDishMeal: boolean;
};

const validSources = new Set<SystemTagSource>([
  'title', 'title_alias', 'ingredients', 'steps', 'category', 'duration', 'default_rule'
]);
const validConfidence = new Set<SystemTagConfidence>(['high', 'medium', 'low']);

const normalizeTag = (value: unknown): SystemTag | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const tagValue = String(record.value || '').trim();
  const source = String(record.source || '').trim() as SystemTagSource;
  const confidence = String(record.confidence || '').trim() as SystemTagConfidence;
  if (!tagValue || !validSources.has(source) || !validConfidence.has(confidence)) return null;
  return { value: tagValue, source, confidence };
};

const normalizeList = (value: unknown): SystemTag[] => (
  (Array.isArray(value) ? value : []).map(normalizeTag).filter((item): item is SystemTag => Boolean(item))
);

export const normalizeRecipeSystemTags = (value: unknown): RecipeSystemTags | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const tagVersion = Number(record.tagVersion);
  if (!Number.isInteger(tagVersion) || tagVersion < 1) return null;
  return {
    tagVersion,
    mealTypes: normalizeList(record.mealTypes),
    roles: normalizeList(record.roles),
    proteinTypes: normalizeList(record.proteinTypes),
    vegetables: normalizeList(record.vegetables),
    cookMethods: normalizeList(record.cookMethods),
    timeLevel: normalizeTag(record.timeLevel),
    isOneDishMeal: record.isOneDishMeal === true
  };
};

export const hasSystemTag = (
  tags: RecipeSystemTags | null | undefined,
  field: 'mealTypes' | 'roles' | 'proteinTypes' | 'vegetables' | 'cookMethods',
  value: string
): boolean => Boolean(tags && tags[field].some((item) => item.value === value));
