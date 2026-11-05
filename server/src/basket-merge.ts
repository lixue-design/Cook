export type MergeableBasketItem = {
  id: string;
  name: string;
  category: string;
  amount?: string | number | null;
  amountText?: string;
  unit?: string | null;
  source: 'plan';
  sourceRefs?: unknown[];
  checked?: boolean;
  sortOrder?: number;
  normalizedName?: string;
};

const normalizeKeyPart = (value: unknown): string => (
  String(value ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/[，,、；;。．.·•]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
);
const normalizeUnit = (value: unknown): string => String(value ?? '')
  .normalize('NFKC')
  .trim()
  .toLocaleLowerCase();

export const mergePlanIngredients = (items: MergeableBasketItem[]): MergeableBasketItem[] => {
  type WorkingItem = MergeableBasketItem & { hasUnmeasured?: boolean };
  const result: WorkingItem[] = [];
  const measuredIndexes = new Map<string, number>();
  const unmeasuredIndexes = new Map<string, number>();
  const measuredKeysByName = new Map<string, string[]>();
  const appendSourceRefs = (target: WorkingItem, source: WorkingItem): void => {
    target.sourceRefs = [...(target.sourceRefs || []), ...(source.sourceRefs || [])];
  };
  const refreshAmountText = (target: WorkingItem): void => {
    target.amountText = target.hasUnmeasured ? `无用量+${target.amount}${target.unit}` : `${target.amount}${target.unit}`;
  };
  for (const source of items || []) {
    const item: WorkingItem = {
      ...source,
      name: String(source.name || '').trim().replace(/\s+/g, ' '),
      unit: String(source.unit || '').trim(),
      amount: source.amount === undefined || source.amount === null ? null : String(source.amount).trim(),
      amountText: String(source.amountText || '').trim(),
      sourceRefs: Array.isArray(source.sourceRefs) ? [...source.sourceRefs] : []
    };
    if (!item.name) {
      item.sortOrder = result.length;
      result.push(item);
      continue;
    }
    const normalizedName = normalizeKeyPart(item.name);
    const numericAmount = /^\d+(?:\.\d+)?$/.test(String(item.amount || '')) ? Number(item.amount) : null;
    const isUnmeasured = normalizedName && numericAmount === null && !item.unit && !item.amountText;
    if (isUnmeasured) {
      const measuredKeys = measuredKeysByName.get(normalizedName) || [];
      if (measuredKeys.length === 1) {
        const existing = result[measuredIndexes.get(measuredKeys[0]) as number];
        existing.hasUnmeasured = true;
        appendSourceRefs(existing, item);
        refreshAmountText(existing);
        continue;
      }
      const existingIndex = unmeasuredIndexes.get(normalizedName);
      if (existingIndex !== undefined) {
        appendSourceRefs(result[existingIndex], item);
        continue;
      }
      item.amountText = '无用量';
      item.sortOrder = result.length;
      item.normalizedName = normalizedName;
      unmeasuredIndexes.set(normalizedName, result.length);
      result.push(item);
      continue;
    }
    // 名称相同但单位不同，或用量不能解析且已填写时仍分别保留。
    if (!normalizedName || numericAmount === null || !item.unit) {
      item.sortOrder = result.length;
      item.normalizedName = normalizedName;
      result.push(item);
      continue;
    }
    const key = `${normalizedName}\u0000${normalizeUnit(item.unit)}`;
    const existingIndex = measuredIndexes.get(key);
    if (existingIndex === undefined) {
      const unmeasuredIndex = unmeasuredIndexes.get(normalizedName);
      const measuredKeys = measuredKeysByName.get(normalizedName) || [];
      if (unmeasuredIndex !== undefined && measuredKeys.length === 0) {
        const existing = result[unmeasuredIndex];
        existing.amount = item.amount;
        existing.unit = item.unit;
        existing.hasUnmeasured = true;
        appendSourceRefs(existing, item);
        refreshAmountText(existing);
        measuredIndexes.set(key, unmeasuredIndex);
        measuredKeysByName.set(normalizedName, [key]);
        continue;
      }
      item.sortOrder = result.length;
      item.normalizedName = normalizedName;
      measuredIndexes.set(key, result.length);
      measuredKeysByName.set(normalizedName, [...measuredKeys, key]);
      result.push(item);
      continue;
    }
    const existing = result[existingIndex];
    const total = Math.round((Number(existing.amount) + Number(item.amount)) * 1000000) / 1000000;
    existing.amount = String(total);
    appendSourceRefs(existing, item);
    refreshAmountText(existing);
  }
  return result.map(({ hasUnmeasured, ...item }, index) => ({ ...item, sortOrder: index }));
};

export const basketMergeInternals = { normalizeKeyPart };
