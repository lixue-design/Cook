import type { Category } from '../types';

type Props = { categories: Category[]; activeIndex: number; onSelect: (index: number) => void };

export function CategorySidebar({ categories, activeIndex, onSelect }: Props) {
  return <aside className="category-sidebar" aria-label="食谱分类">
    {categories.map((category, index) => (
      <button className={`category-tab ${index === activeIndex ? 'active' : ''}`} key={category.id} onClick={() => onSelect(index)}>
        <span>{category.name}</span><i />
      </button>
    ))}
  </aside>;
}
