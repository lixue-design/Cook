const QUANTITY_UNITS = [
  '千克', '公斤', '毫升', '大勺', '小勺', '茶匙', '汤匙',
  'kg', 'ml', '克', '斤', '两', '个', '颗', '根', '片', '瓣',
  '条', '块', '只', '把', '勺', '杯', '盒', '袋', '包', '瓶', '罐', 'g', 'l'
];

const quantityUnitPattern = QUANTITY_UNITS
  .slice()
  .sort((left, right) => right.length - left.length)
  .map((unit) => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
const quantitySuffixPattern = new RegExp(`^(.+?)\\s*(\\d+(?:\\.\\d+)?)\\s*(${quantityUnitPattern})$`, 'i');

function splitManualIngredientEntries(value) {
  return String(value || '').split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseManualIngredientEntry(value) {
  const input = String(value || '').trim().replace(/\s+/g, ' ');
  const matched = input.match(quantitySuffixPattern);
  if (!matched) return { name: input, amount: '', amountText: '', unit: '' };

  const name = matched[1].trim();
  const amount = matched[2];
  const unit = matched[3];
  return name
    ? { name, amount, amountText: `${amount}${unit}`, unit }
    : { name: input, amount: '', amountText: '', unit: '' };
}

function parseManualIngredientEntries(value) {
  return splitManualIngredientEntries(value)
    .map(parseManualIngredientEntry)
    .filter((item) => item.name);
}

module.exports = {
  splitManualIngredientEntries,
  parseManualIngredientEntry,
  parseManualIngredientEntries
};
