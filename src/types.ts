export type Recipe = {
  id: string;
  categoryId: string;
  title: string;
  coverUrl: string;
  duration: string;
  calories: string;
  crop?: { width: number; height: number; left: number; top: number };
};

export type Category = { id: string; name: string };

export type RecipeGroup = Category & { recipes: Recipe[] };
