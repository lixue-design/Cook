Component({
  properties: {
    visible: { type: Boolean, value: false }
  },
  methods: {
    onClose() { this.triggerEvent('close'); },
    onAfterClose() { this.triggerEvent('afterclose'); },
    onChooseAI() { this.triggerEvent('chooseai'); },
    onChooseManual() { this.triggerEvent('choosemanual'); },
    noop() {}
  }
});
