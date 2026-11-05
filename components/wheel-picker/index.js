const CENTER_ROW = 2;
const ROW_HEIGHT_RPX = 76;
const EDGE_PADDING_ROWS = CENTER_ROW;

function getRpxRatio() {
  try {
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    return Number(info.windowWidth || 375) / 750;
  } catch (error) {
    return 0.5;
  }
}

function normalizeOptions(options) {
  return (Array.isArray(options) ? options : []).map((option, index) => {
    if (option && typeof option === 'object') {
      return {
        id: String(option.id || `wheel-option-${index}`),
        value: Object.prototype.hasOwnProperty.call(option, 'value') ? option.value : option.label,
        label: String(option.label || option.value || ''),
        source: option
      };
    }
    return { id: `wheel-option-${index}`, value: option, label: String(option || ''), source: option };
  });
}

function createRows(options) {
  const rows = [];
  for (let index = 0; index < EDGE_PADDING_ROWS; index += 1) {
    rows.push({ id: `wheel-leading-${index}`, rowIndex: index, optionIndex: -1, empty: true, label: '' });
  }
  options.forEach((option, optionIndex) => {
    rows.push({ ...option, id: `wheel-option-row-${option.id}-${optionIndex}`, rowIndex: optionIndex + EDGE_PADDING_ROWS, optionIndex, empty: false });
  });
  for (let index = 0; index < EDGE_PADDING_ROWS; index += 1) {
    rows.push({ id: `wheel-trailing-${index}`, rowIndex: EDGE_PADDING_ROWS + options.length + index, optionIndex: -1, empty: true, label: '' });
  }
  return rows;
}

Component({
  properties: {
    visible: { type: Boolean, value: false },
    options: { type: Array, value: [] },
    selectedIndex: { type: Number, value: 0 }
  },
  data: {
    pickerRows: [],
    activeRowIndex: CENTER_ROW,
    activeOptionIndex: 0,
    wheelScrollTop: 0
  },
  lifetimes: {
    attached() {
      this.wheelRowHeight = ROW_HEIGHT_RPX * getRpxRatio();
      this.wheelSnapTimer = null;
      this.lastWheelScrollTop = 0;
      this.isWheelTouching = false;
      this.ignoreWheelScrollUntil = 0;
      this.wheelScrollCommandVersion = 0;
    },
    detached() { clearTimeout(this.wheelSnapTimer); }
  },
  observers: {
    visible(visible) {
      if (visible) this.initializeWheel();
    },
    options() {
      if (this.properties.visible) this.initializeWheel();
    }
  },
  methods: {
    initializeWheel() {
      const options = normalizeOptions(this.properties.options);
      const activeOptionIndex = Math.max(0, Math.min(options.length - 1, Number(this.properties.selectedIndex || 0)));
      const activeRowIndex = activeOptionIndex + CENTER_ROW;
      const wheelScrollTop = this.scrollTopForRowIndex(activeRowIndex);
      this.lastWheelScrollTop = wheelScrollTop;
      this.setData({ pickerRows: createRows(options), activeRowIndex, activeOptionIndex, wheelScrollTop });
    },
    scrollTopForRowIndex(rowIndex) {
      return Math.max(0, (rowIndex - CENTER_ROW) * this.wheelRowHeight);
    },
    rowIndexForScrollTop(scrollTop) {
      const optionCount = normalizeOptions(this.properties.options).length;
      const firstOptionRow = EDGE_PADDING_ROWS;
      const lastOptionRow = EDGE_PADDING_ROWS + optionCount - 1;
      const rowIndex = Math.round(Number(scrollTop || 0) / this.wheelRowHeight) + CENTER_ROW;
      return Math.max(firstOptionRow, Math.min(lastOptionRow, rowIndex));
    },
    scheduleWheelSnap(delay) {
      clearTimeout(this.wheelSnapTimer);
      if (this.isWheelTouching) return;
      this.wheelSnapTimer = setTimeout(() => {
        if (!this.isWheelTouching) this.snapWheelToCenter();
      }, delay || 160);
    },
    onWheelTouchStart() {
      clearTimeout(this.wheelSnapTimer);
      this.isWheelTouching = true;
      this.ignoreWheelScrollUntil = 0;
    },
    onWheelScroll(event) {
      const scrollTop = Number(event.detail.scrollTop || 0);
      this.lastWheelScrollTop = scrollTop;
      if (Date.now() <= this.ignoreWheelScrollUntil) return;
      this.syncActiveRow(this.rowIndexForScrollTop(scrollTop));
      this.scheduleWheelSnap(140);
    },
    onWheelTouchEnd() {
      this.isWheelTouching = false;
      this.scheduleWheelSnap(180);
    },
    syncActiveRow(rowIndex) {
      const current = this.data.pickerRows[rowIndex];
      if (!current || current.empty || this.data.activeRowIndex === rowIndex) return;
      this.setData({ activeRowIndex: rowIndex, activeOptionIndex: current.optionIndex });
    },
    onOptionTap(event) {
      this.snapWheelToCenter(Number(event.currentTarget.dataset.rowIndex));
    },
    snapWheelToCenter(preferredRowIndex) {
      clearTimeout(this.wheelSnapTimer);
      const targetRowIndex = Number.isInteger(preferredRowIndex)
        ? preferredRowIndex
        : this.rowIndexForScrollTop(this.lastWheelScrollTop);
      const current = this.data.pickerRows[targetRowIndex];
      if (!current || current.empty) return;
      const wheelScrollTop = this.scrollTopForRowIndex(targetRowIndex);
      const isAlreadyAligned = Math.abs(wheelScrollTop - this.lastWheelScrollTop) < 0.5;
      const isAlreadySelected = this.data.activeRowIndex === targetRowIndex;
      if (isAlreadyAligned && isAlreadySelected) return;
      this.lastWheelScrollTop = wheelScrollTop;
      this.ignoreWheelScrollUntil = Date.now() + 100;
      this.wheelScrollCommandVersion += 1;
      const command = wheelScrollTop + (this.wheelScrollCommandVersion % 2 ? 0.01 : 0.02);
      this.setData({ activeRowIndex: targetRowIndex, activeOptionIndex: current.optionIndex, wheelScrollTop: command });
    },
    onClose() { this.triggerEvent('close'); },
    onConfirm() {
      const row = this.data.pickerRows[this.data.activeRowIndex];
      if (!row || row.empty) return;
      this.triggerEvent('confirm', { index: row.optionIndex, value: row.value, label: row.label, option: row.source });
    },
    noop() {}
  }
});
