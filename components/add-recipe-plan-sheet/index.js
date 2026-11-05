const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const MEALS = [
  { id: 'breakfast', name: '早餐' },
  { id: 'lunch', name: '午餐' },
  { id: 'dinner', name: '晚餐' }
];

function pad2(value) { return value < 10 ? `0${value}` : String(value); }
function toDateId(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`; }
function getToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
function fromDateId(dateId) {
  const parts = String(dateId || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return toDateId(date) === dateId ? date : null;
}

Component({
  properties: {
    visible: { type: Boolean, value: false },
    initialDate: { type: String, value: '' }
  },
  data: {
    dates: [],
    selectedDate: toDateId(getToday()),
    selectedMeal: 'dinner',
    meals: MEALS
  },
  observers: {
    'visible, initialDate'(visible, initialDate) {
      if (!visible) return;
      const today = getToday();
      const selectedDate = fromDateId(initialDate) || today;
      this.weekAnchor = selectedDate;
      this.setData({ selectedDate: toDateId(selectedDate), selectedMeal: 'dinner', dates: this.buildWeek(selectedDate) });
    }
  },
  methods: {
    buildWeek(anchor) {
      const weekStart = new Date(anchor);
      const daysAfterMonday = (weekStart.getDay() + 6) % 7;
      weekStart.setDate(weekStart.getDate() - daysAfterMonday);
      const dates = [];
      for (let index = 0; index < 7; index += 1) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + index);
        dates.push({ id: toDateId(date), weekday: WEEKDAYS[index], day: date.getDate() });
      }
      return dates;
    },
    onClose() { this.triggerEvent('close'); },
    onAfterClose() { this.triggerEvent('afterclose'); },
    onDateTap(event) { this.setData({ selectedDate: event.currentTarget.dataset.date }); },
    onMealTap(event) { this.setData({ selectedMeal: event.currentTarget.dataset.meal }); },
    onTodayTap() {
      const today = getToday();
      this.weekAnchor = today;
      this.setData({ selectedDate: toDateId(today), dates: this.buildWeek(today) });
    },
    onWeekChange(event) {
      const direction = Number(event.currentTarget.dataset.direction);
      const anchor = new Date(this.weekAnchor || getToday());
      anchor.setDate(anchor.getDate() + direction * 7);
      this.weekAnchor = anchor;
      this.setData({ selectedDate: toDateId(anchor), dates: this.buildWeek(anchor) });
    },
    onConfirm() {
      const selected = this.data.dates.find((item) => item.id === this.data.selectedDate);
      const meal = MEALS.find((item) => item.id === this.data.selectedMeal);
      if (!selected || !meal) return;
      const parts = this.data.selectedDate.split('-');
      this.triggerEvent('confirm', {
        date: this.data.selectedDate,
        dateText: `${Number(parts[1])}月${Number(parts[2])}日`,
        meal: meal.id,
        mealName: meal.name
      });
    },
    noop() {}
  }
});
