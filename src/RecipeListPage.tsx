import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchRecipeGroups } from './api/recipeApi';
import { CategorySidebar } from './components/CategorySidebar';
import { RecipeListView } from './components/RecipeListView';
import type { Category, Recipe, RecipeGroup } from './types';
import './styles.css';

type RestoreState = { scrollY: number; activeCategoryIndex: number };
type CategoryDialog = { mode: 'rename' | 'create' | 'delete'; targetId?: string; value: string } | null;
type CategoryDrag = { id: string; fromIndex: number; targetIndex: number; offset: number } | null;
let savedBrowseState: RestoreState | null = null;

const throttle = <T extends unknown[]>(fn: (...args: T) => void, delay: number) => {
  let last = 0;
  let timeout: number | undefined;
  return (...args: T) => {
    const now = Date.now();
    const remain = delay - (now - last);
    if (remain <= 0) {
      window.clearTimeout(timeout);
      last = now;
      fn(...args);
      return;
    }
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => { last = Date.now(); fn(...args); }, remain);
  };
};

export function RecipeListPage() {
  const [groups, setGroups] = useState<RecipeGroup[] | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const [managedCategories, setManagedCategories] = useState<Category[]>([]);
  const [manageVisible, setManageVisible] = useState(false);
  const [categoryDialog, setCategoryDialog] = useState<CategoryDialog>(null);
  const [categoryDrag, setCategoryDrag] = useState<CategoryDrag>(null);
  const scrollLocked = useRef(false);
  const categoryLongPressTimer = useRef<number | undefined>(undefined);
  const categoryDragRef = useRef({ active: false, startY: 0, fromIndex: -1, targetIndex: -1, id: '' });

  useEffect(() => {
    fetchRecipeGroups().then((nextGroups) => {
      setGroups(nextGroups);
      setManagedCategories(nextGroups.map(({ id, name }) => ({ id, name })));
    });
  }, []);
  useEffect(() => {
    if (!groups || !savedBrowseState) return;
    const state = savedBrowseState;
    savedBrowseState = null;
    setActiveIndex(state.activeCategoryIndex);
    requestAnimationFrame(() => document.getElementById('recipe-scroll')?.scrollTo({ top: state.scrollY }));
  }, [groups]);

  useEffect(() => {
    const viewport = document.getElementById('recipe-scroll');
    if (!viewport || !groups) return;
    const onScroll = throttle(() => {
      if (scrollLocked.current) return;
      const viewportTop = viewport.getBoundingClientRect().top;
      const next = groups.reduce((current, group, index) => {
        const section = document.getElementById(`category-${group.id}`);
        return section && section.getBoundingClientRect().top - viewportTop <= 24 ? index : current;
      }, 0);
      setActiveIndex(next);
    }, 80);
    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, [groups]);

  const categories = useMemo(() => groups?.map(({ id, name }) => ({ id, name })) ?? [], [groups]);
  const selectCategory = (index: number) => {
    if (!groups) return;
    setActiveIndex(index);
    scrollLocked.current = true;
    document.getElementById(`category-${groups[index].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => { scrollLocked.current = false; }, 450);
  };
  const navigateToDetail = (recipeId: string) => {
    const scrollY = document.getElementById('recipe-scroll')?.scrollTop ?? 0;
    savedBrowseState = { scrollY, activeCategoryIndex: activeIndex };
    setNotice(`已记录浏览位置，跳转至食谱详情：${recipeId}`);
  };
  const addToPlan = (recipe: Recipe) => setNotice(`已将「${recipe.title}」加入饮食计划`);
  const closeCategoryDialog = () => setCategoryDialog(null);
  const resetCategoryDrag = () => {
    window.clearTimeout(categoryLongPressTimer.current);
    categoryDragRef.current = { active: false, startY: 0, fromIndex: -1, targetIndex: -1, id: '' };
    setCategoryDrag(null);
  };
  const onCategoryPointerDown = (event: React.PointerEvent<HTMLDivElement>, category: Category, index: number) => {
    if ((event.target as HTMLElement).closest('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    categoryDragRef.current = { active: false, startY: event.clientY, fromIndex: index, targetIndex: index, id: category.id };
    window.clearTimeout(categoryLongPressTimer.current);
    categoryLongPressTimer.current = window.setTimeout(() => {
      categoryDragRef.current.active = true;
      setCategoryDrag({ id: category.id, fromIndex: index, targetIndex: index, offset: 0 });
    }, 500);
  };
  const onCategoryPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = categoryDragRef.current;
    if (drag.fromIndex < 0) return;
    const offset = event.clientY - drag.startY;
    if (!drag.active) {
      if (Math.abs(offset) > 8) window.clearTimeout(categoryLongPressTimer.current);
      return;
    }
    const targetIndex = Math.max(0, Math.min(managedCategories.length - 1, drag.fromIndex + Math.round(offset / 40)));
    drag.targetIndex = targetIndex;
    setCategoryDrag({ id: drag.id, fromIndex: drag.fromIndex, targetIndex, offset });
  };
  const onCategoryPointerUp = () => {
    window.clearTimeout(categoryLongPressTimer.current);
    const drag = categoryDragRef.current;
    if (drag.active) {
      setManagedCategories((items) => {
        const next = items.slice();
        const [moved] = next.splice(drag.fromIndex, 1);
        if (moved) next.splice(drag.targetIndex, 0, moved);
        return next;
      });
    }
    resetCategoryDrag();
  };
  const confirmCategoryDialog = () => {
    if (!categoryDialog) return;
    if (categoryDialog.mode === 'delete') {
      setManagedCategories((items) => items.filter((item) => item.id !== categoryDialog.targetId));
      closeCategoryDialog();
      return;
    }
    const value = categoryDialog.value.trim();
    if (!value) return;
    if (categoryDialog.mode === 'rename') {
      setManagedCategories((items) => items.map((item) => item.id === categoryDialog.targetId ? { ...item, name: value } : item));
    } else {
      setManagedCategories((items) => [...items, { id: `custom-${Date.now()}`, name: value }]);
    }
    closeCategoryDialog();
  };

  return <div className="app-shell">
    <header className="app-header">
      <div className="status-bar"><span>9:41</span><div className="status-icons"><img className="cellular" src="/assets/icons/status-cellular.svg" alt="" /><img className="wifi" src="/assets/icons/status-wifi.svg" alt="" /><img className="battery" src="/assets/icons/status-battery.svg" alt="" /></div></div>
      <div className="navigation-bar">
        <h1>食谱</h1>
        <button className="search-button" aria-label="搜索食谱" onClick={() => setNotice('搜索功能即将上线')}><img src="/assets/icons/search.svg" alt="" /></button>
        <button className="manage-button" onClick={() => setManageVisible(true)}>管理</button>
      </div>
    </header>

    <div className="content">
      {groups === null
        ? <div className="state"><span className="spinner" />正在加载你的食谱…</div>
        : groups.length === 0
          ? <div className="state empty">还没有食谱<small>点击右下角 + 添加第一道菜</small></div>
          : <><CategorySidebar categories={categories} activeIndex={activeIndex} onSelect={selectCategory} /><RecipeListView groups={groups} onRecipeClick={(recipe) => navigateToDetail(recipe.id)} onAddPlan={addToPlan} /></>}
    </div>

    <button className="fab" aria-label="添加食谱" onClick={() => setNotice('打开新增食谱入口')}><i /></button>
    <nav className="bottom-nav"><span className="selected">菜谱</span><span>计划</span><span>菜篮</span><span>我的</span></nav>
    {notice && <button className="toast" onClick={() => setNotice('')}>{notice}</button>}

    {manageVisible && <>
      <button className="manage-mask" aria-label="关闭分类管理" onClick={() => { resetCategoryDrag(); setCategoryDialog(null); setManageVisible(false); }} />
      <section className="manage-sheet" aria-label="分类管理">
        <h2>全部分类</h2>
        <button className="manage-sheet-close" aria-label="关闭" onClick={() => { resetCategoryDrag(); setCategoryDialog(null); setManageVisible(false); }}><img src="/assets/category/close.svg" alt="" /></button>
        <div className="manage-list">
          {managedCategories.map((category, index) => <div
            className={`manage-item ${categoryDrag?.id === category.id ? 'manage-item--dragging' : ''} ${categoryDrag && categoryDrag.targetIndex === index && categoryDrag.id !== category.id ? 'manage-item--drop-target' : ''}`}
            style={{ transform: categoryDrag?.id === category.id ? `translateY(${categoryDrag.offset}px)` : undefined }}
            key={category.id}
            onPointerDown={(event) => onCategoryPointerDown(event, category, index)}
            onPointerMove={onCategoryPointerMove}
            onPointerUp={onCategoryPointerUp}
            onPointerCancel={resetCategoryDrag}
          >
            <span className="manage-item-name"><img src="/assets/category/drag.svg" alt="" />{category.name}</span>
            <span className="manage-item-actions">
              <button aria-label={`重命名${category.name}`} onClick={() => setCategoryDialog({ mode: 'rename', targetId: category.id, value: category.name })}><img src="/assets/category/edit.svg" alt="" /></button>
              <button aria-label={`删除${category.name}`} onClick={() => setCategoryDialog({ mode: 'delete', targetId: category.id, value: '' })}><img src="/assets/category/delete.svg" alt="" /></button>
            </span>
          </div>)}
        </div>
        <footer><button onClick={() => setCategoryDialog({ mode: 'create', value: '' })}>新建分类</button></footer>
      </section>
    </>}

    {categoryDialog && <div className="category-dialog-layer" role="presentation">
      <section className={`category-dialog ${categoryDialog.mode === 'delete' ? 'category-dialog--delete' : ''}`} role="dialog" aria-modal="true">
        <h3>{categoryDialog.mode === 'rename' ? '重命名' : categoryDialog.mode === 'create' ? '新增分类' : '确定删除分类？'}</h3>
        {categoryDialog.mode === 'delete'
          ? <p>分类内现有 8 道菜谱，删除后这些菜谱会变为无分类状态</p>
          : <input autoFocus maxLength={8} value={categoryDialog.value} placeholder={categoryDialog.mode === 'create' ? '最多8个字' : ''} onChange={(event) => setCategoryDialog({ ...categoryDialog, value: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter') confirmCategoryDialog(); }} />}
        <div className="category-dialog-actions"><button className="cancel" onClick={closeCategoryDialog}>取消</button><button onClick={confirmCategoryDialog}>确定</button></div>
      </section>
    </div>}
  </div>;
}
