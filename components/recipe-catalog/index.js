const { toRecipeListItem } = require('../../utils/recipe-list-item');

Component({
  properties: {
    groups: { type: Array, value: [] },
    selectedIds: { type: Array, value: [] },
    selectionMode: { type: Boolean, value: false }
  },
  data: { displayGroups: [], activeIndex: 0, activeIndicatorTop: 0, scrollIntoView: '', scrollTop: 0 },
  observers: {
    'groups, selectedIds': function(groups, selectedIds) {
      const selected = selectedIds || [];
      const displayGroups = (groups || []).map((group) => ({
        ...group,
        nameLines: (() => {
          const characters = Array.from(String(group.name || '')).slice(0, 8);
          return [characters.slice(0, 4).join(''), characters.slice(4, 8).join('')].filter(Boolean);
        })(),
        recipes: (group.recipes || []).map((recipe) => {
          const item = toRecipeListItem(recipe);
          return { ...item, selected: selected.indexOf(item.id) >= 0 };
        })
      }));
      this.setData({ displayGroups });
    }
  },
  lifetimes: { detached() { clearTimeout(this.scrollTimer); clearTimeout(this.scrollFrame); } },
  methods: {
    onCategoryTap(event) {
      const index = Number(event.currentTarget.dataset.index);
      const group = this.data.displayGroups[index];
      if (!group) return;
      this.programmatic = true;
      this.setData({ activeIndex: index, activeIndicatorTop: index * 112, scrollIntoView: `catalog-${group.id}` });
      clearTimeout(this.scrollTimer);
      this.scrollTimer = setTimeout(() => { this.programmatic = false; }, 420);
    },
    onScroll(event) {
      this.currentScrollTop = event.detail.scrollTop;
      this.triggerEvent('scroll', { scrollTop: this.currentScrollTop });
      if (this.programmatic || this.scrollFrame) return;
      this.scrollFrame = setTimeout(() => {
        this.scrollFrame = null;
        const query = wx.createSelectorQuery().in(this);
        query.select('.catalog-recipes').boundingClientRect();
        query.selectAll('.catalog-section').boundingClientRect();
        query.exec((result) => {
          const viewport = result[0]; const sections = result[1] || [];
          if (!viewport) return;
          let activeIndex = 0;
          sections.forEach((section, index) => { if (section.top - viewport.top <= 24) activeIndex = index; });
          if (activeIndex !== this.data.activeIndex) this.setData({ activeIndex, activeIndicatorTop: activeIndex * 112 });
          const preloadBoundary = viewport.bottom + 96;
          const nextGroupIndex = sections.findIndex((section, index) => {
            const group = this.data.displayGroups[index];
            return group && group.hasMore && !group.loadingMore && section.bottom <= preloadBoundary;
          });
          if (nextGroupIndex >= 0) {
            const group = this.data.displayGroups[nextGroupIndex];
            this.triggerEvent('loadmore', { id: group.id, offset: group.nextOffset });
          }
        });
      }, 16);
    },
    onRecipeTap(event) { this.triggerEvent('recipe', { id: event.currentTarget.dataset.id }); },
    onActionTap(event) { this.triggerEvent('toggle', { id: event.currentTarget.dataset.id, recipe: event.currentTarget.dataset.recipe }); }
  }
});
