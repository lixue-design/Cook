const { formatWeekRange, weekStartForOffset } = require('../../utils/week-range');

const WEEK_COUNT = 9;

function createWeekOptions() {
  return Array.from({ length: WEEK_COUNT }, (_, offset) => ({
    id: `basket-week-${offset}`,
    value: offset,
    label: formatWeekRange(offset),
    weekStartDate: weekStartForOffset(offset)
  }));
}

Component({
  properties: {
    visible: { type: Boolean, value: false }
  },
  data: { options: [] },
  observers: {
    visible(visible) {
      if (visible) this.setData({ options: createWeekOptions() });
    }
  },
  methods: {
    onClose() { this.triggerEvent('close'); },
    onConfirm(event) {
      const option = event.detail.option;
      if (!option) return;
      this.triggerEvent('confirm', {
        weekOffset: option.value,
        weekStartDate: option.weekStartDate,
        weekText: option.label
      });
    }
  }
});
