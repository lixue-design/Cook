Component({
  properties: {
    text: { type: String, value: '' },
    dividerInset: { type: String, value: '48rpx' },
    showDivider: { type: Boolean, value: true }
  },
  methods: {
    onPrevious() { this.triggerEvent('change', { direction: -1 }); },
    onNext() { this.triggerEvent('change', { direction: 1 }); },
    onTitleTap() {
      const now = Date.now();
      if (this.lastTitleTapAt && now - this.lastTitleTapAt < 320) {
        this.lastTitleTapAt = 0;
        this.triggerEvent('reset');
        return;
      }
      this.lastTitleTapAt = now;
    }
  }
});
