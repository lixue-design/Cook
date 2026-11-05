import { RemoteImage } from './RemoteImage';
import type { Recipe, RecipeGroup } from '../types';

type Props = { groups: RecipeGroup[]; onRecipeClick: (recipe: Recipe) => void; onAddPlan: (recipe: Recipe) => void };

export function RecipeListView({ groups, onRecipeClick, onAddPlan }: Props) {
  return <main className="recipe-scroll" id="recipe-scroll">
    {groups.map((group, groupIndex) => <section className={`recipe-section ${groupIndex === 0 ? 'recipe-section--featured' : 'recipe-section--standard'}`} id={`category-${group.id}`} key={group.id}>
      <h2>{group.name}</h2>
      <div className="recipe-list">
        {group.recipes.map((recipe) => <article className="recipe-item" key={recipe.id} onClick={() => onRecipeClick(recipe)}>
          <RemoteImage src={recipe.coverUrl} alt={recipe.title} crop={recipe.crop} />
          <div className="recipe-copy"><h3>{recipe.title}</h3><p>{recipe.duration}<b />{recipe.calories}</p></div>
          <button className="add-plan" onClick={(event) => { event.stopPropagation(); onAddPlan(recipe); }}>加计划</button>
        </article>)}
      </div>
    </section>)}
  </main>;
}
