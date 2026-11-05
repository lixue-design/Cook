Component({
  properties: {
    title: { type: String, value: '' },
    actions: { type: Array, value: [] },
    layout: { type: Object, value: {} },
    titleInteractive: { type: Boolean, value: false },
    showTitleIndicator: { type: Boolean, value: false },
    titleIndicatorRotated: { type: Boolean, value: false }
  },
  methods: {
    onTitleTap() {
      if (this.properties.titleInteractive) this.triggerEvent('title');
    },
    onActionTap(event) {
      const index = Number(event.currentTarget.dataset.index);
      this.triggerEvent('action', { index, action: this.properties.actions[index] });
    }
  }
});
