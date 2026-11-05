Component({
  properties: {
    text: { type: String, value: '确定' },
    disabled: { type: Boolean, value: false }
  },
  methods: {
    onPress() { if (!this.properties.disabled) this.triggerEvent('press'); }
  }
});
