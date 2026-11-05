function getRelativeWeekLabel(offset) {
  if (offset === 0) return '本周';
  if (offset === -1) return '上周';
  if (offset === -2) return '上上周';
  if (offset === 1) return '下周';
  if (offset === 2) return '下下周';
  return '';
}

function formatWeekRange(offset = 0) {
  const start = mondayForOffset(offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const startText = `${start.getMonth() + 1}月${start.getDate()}日`;
  const endText = `${end.getMonth() + 1}月${end.getDate()}日`;
  const relativeLabel = getRelativeWeekLabel(offset);
  return `${startText} - ${endText}${relativeLabel ? `（${relativeLabel}）` : ''}`;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function mondayForOffset(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + Number(offset || 0) * 7);
  return start;
}

function weekStartForOffset(offset = 0) {
  const start = mondayForOffset(offset);
  return `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`;
}

function weekOffsetForStartDate(weekStartDate) {
  const matched = String(weekStartDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return null;
  const target = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
  if (
    Number.isNaN(target.getTime())
    || target.getFullYear() !== Number(matched[1])
    || target.getMonth() !== Number(matched[2]) - 1
    || target.getDate() !== Number(matched[3])
  ) return null;
  const current = mondayForOffset(0);
  const days = Math.round((target.getTime() - current.getTime()) / (24 * 60 * 60 * 1000));
  return days % 7 === 0 ? days / 7 : null;
}

module.exports = { formatWeekRange, getRelativeWeekLabel, weekStartForOffset, weekOffsetForStartDate };
