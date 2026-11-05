const { weekStartForOffset, weekOffsetForStartDate } = require('./week-range');

function publishSelectedWeek(globalData, weekOffset) {
  const weekStartDate = weekStartForOffset(weekOffset);
  if (globalData) globalData.selectedWeekStartDate = weekStartDate;
  return weekStartDate;
}

function readSelectedWeekOffset(globalData, fallbackOffset = 0) {
  const weekOffset = weekOffsetForStartDate(globalData && globalData.selectedWeekStartDate);
  return Number.isInteger(weekOffset) ? weekOffset : fallbackOffset;
}

module.exports = { publishSelectedWeek, readSelectedWeekOffset };
