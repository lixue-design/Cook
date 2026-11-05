const { toRecipeListItem } = require('../../utils/recipe-list-item');

Component({
  properties: {
    recipes: { type: Array, value: [] },
    selectedIds: { type: Array, value: [] },
    showImages: { type: Boolean, value: true },
    emptyText: { type: String, value: '没有找到相关菜谱' }
  },
  data: { displayRecipes: [] },
  observers: {
    'recipes, selectedIds': function(recipes, selectedIds) {
      const selected = selectedIds || [];
      this.setData({ displayRecipes: (recipes || []).map((recipe) => {
        const item = toRecipeListItem(recipe);
        return { ...item, selected: selected.indexOf(item.id) >= 0 };
      }) });
    }
  },
  methods: {
    onRecipeTap(event) { this.triggerEvent('recipe', { id: event.currentTarget.dataset.id }); },
    onToggle(event) { this.triggerEvent('toggle', { id: event.currentTarget.dataset.id, recipe: event.currentTarget.dataset.recipe }); }
  }
});
