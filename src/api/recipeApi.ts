import type { RecipeGroup } from '../types';

// This is deliberately shaped like a server response. Replace only this module
// with real requests; UI components never own recipe or image data.
const mockRecipeGroups: RecipeGroup[] = [
  {
    id: 'cold', name: '爽口凉菜', recipes: [
      { id: 'cucumber', categoryId: 'cold', title: '凉拌黄瓜', coverUrl: '/assets/recipes/cucumber.jpg', duration: '30分钟', calories: '125kcal', crop: { width: 177, height: 133, left: -56, top: -33 } },
      { id: 'fungus', categoryId: 'cold', title: '凉拌木耳', coverUrl: '/assets/recipes/fungus.jpg', duration: '30分钟', calories: '125kcal', crop: { width: 160, height: 160, left: -45, top: -48 } },
      { id: 'potato', categoryId: 'cold', title: '炝拌土豆丝', coverUrl: '/assets/recipes/potato.jpg', duration: '30分钟', calories: '125kcal', crop: { width: 160, height: 160, left: -45, top: -48 } }
    ]
  },
  {
    id: 'vegetable', name: '家常小炒', recipes: [
      { id: 'cabbage', categoryId: 'vegetable', title: '手撕包菜', coverUrl: '/assets/recipes/cabbage.jpg', duration: '30分钟', calories: '125kcal', crop: { width: 160, height: 160, left: -45, top: -48 } },
      { id: 'enoki', categoryId: 'vegetable', title: '蒜蓉娃娃菜', coverUrl: '/assets/recipes/enoki.jpg', duration: '30分钟', calories: '125kcal', crop: { width: 165, height: 165, left: -50, top: -48 } },
      { id: 'beans', categoryId: 'vegetable', title: '干煸豆角', coverUrl: '/assets/recipes/beans.jpg', duration: '30分钟', calories: '125kcal', crop: { width: 160, height: 160, left: -45, top: -48 } },
      { id: 'egg-tomato', categoryId: 'vegetable', title: '番茄炒蛋', coverUrl: 'https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?auto=format&fit=crop&w=240&q=80', duration: '12分钟', calories: '209kcal' },
      { id: 'tofu', categoryId: 'vegetable', title: '家常豆腐', coverUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=240&q=80', duration: '25分钟', calories: '231kcal' }
    ]
  },
  {
    id: 'meat', name: '大口吃肉', recipes: [
      { id: 'ribs', categoryId: 'meat', title: '糖醋小排', coverUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=240&q=80', duration: '45分钟', calories: '386kcal' },
      { id: 'chicken', categoryId: 'meat', title: '黄焖鸡', coverUrl: 'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?auto=format&fit=crop&w=240&q=80', duration: '40分钟', calories: '424kcal' }
    ]
  },
  {
    id: 'soup', name: '一碗鲜汤', recipes: [
      { id: 'tomato-soup', categoryId: 'soup', title: '番茄菌菇汤', coverUrl: 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=240&q=80', duration: '30分钟', calories: '112kcal' }
    ]
  },
  {
    id: 'fruit', name: '饱腹主食', recipes: [
      { id: 'yogurt', categoryId: 'fruit', title: '莓果酸奶碗', coverUrl: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=240&q=80', duration: '8分钟', calories: '178kcal' }
    ]
  }
];

export function fetchRecipeGroups(): Promise<RecipeGroup[]> {
  return new Promise((resolve) => setTimeout(() => resolve(mockRecipeGroups), 650));
}
