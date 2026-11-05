// 本地 Mock：页面不持有 UGC 食谱或图片数据。远程模式由 recipe-api.js 调度。
// 仅用于可用性测试：五个默认分类各预置三道菜，列表、搜索、计划和菜篮均从此处读取。
const defaultCrop = { width: 64, height: 64, left: 0, top: 0 };

function createSeedRecipe(id, title, coverUrl, mainIngredients, sideIngredients, seasonings, steps, duration, calories) {
  return {
    id,
    title,
    duration,
    calories,
    coverUrl,
    crop: { ...defaultCrop },
    mainIngredients,
    sideIngredients,
    seasonings,
    steps: steps.map((text, index) => ({ id: `${id}-step-${index + 1}`, text, imageUrl: '' }))
  };
}

const recipeGroups = [
  {
    id: 'cold',
    name: '爽口凉菜',
    recipes: [
      createSeedRecipe('cold-cucumber', '凉拌黄瓜', '/assets/recipes/usability-seeds/cold-cucumber.jpg', '黄瓜2根、蒜2瓣', '小米椒1个', '生抽1勺、香醋1勺、香油少许', ['黄瓜洗净拍裂后切成小段，放少许盐抓匀，静置五分钟逼出水分，再倒掉析出的水。', '蒜切末、小米椒切圈，和生抽、香醋、香油调成料汁；喜欢微甜可加半勺白糖。', '将料汁倒入黄瓜，充分翻拌至每块黄瓜都裹上酱汁，冷藏十分钟后食用更爽脆。'], '10分钟', '68kcal'),
      createSeedRecipe('cold-fungus', '凉拌木耳', '/assets/recipes/usability-seeds/cold-fungus.jpg', '干木耳30g、洋葱1个', '香菜1根', '生抽1勺、香醋1勺、白糖少许', ['干木耳用冷水泡发至完全舒展，去掉硬根；沸水下锅焯两分钟，捞出立刻过凉。', '洋葱切细丝后用凉水浸泡三分钟，香菜切段；木耳务必沥干，避免料汁被稀释。', '加入生抽、香醋和少许白糖拌匀，最后撒香菜和芝麻，静置五分钟入味。'], '15分钟', '75kcal'),
      createSeedRecipe('cold-potato', '炝拌土豆丝', '/assets/recipes/usability-seeds/cold-potato.jpg', '土豆2个、胡萝卜1根', '蒜2瓣、干辣椒2个', '盐少许、香醋1勺、食用油1勺', ['土豆和胡萝卜切细丝，土豆丝立即泡清水洗去淀粉，成菜才会清爽不粘。', '水沸后先下胡萝卜丝十秒，再下土豆丝焯四十秒；断生马上过冰水，沥干后放盘中。', '蒜末、干辣椒放在土豆丝上，热油浇出香味，再加盐和香醋，拌匀即可。'], '15分钟', '110kcal')
    ]
  },
  {
    id: 'vegetable',
    name: '家常小炒',
    recipes: [
      createSeedRecipe('cabbage', '手撕包菜', '/assets/recipes/usability-seeds/cabbage.jpg', '包菜1个', '蒜3瓣、干辣椒3个', '食用油1勺、生抽1勺、盐少许', ['包菜用手撕成大小均匀的片，较厚的菜帮和叶子分开放；洗后必须彻底沥干。', '锅烧到微微冒烟后下油，放蒜片和干辣椒，小火煸到蒜片边缘发黄。', '先下菜帮大火翻炒二十秒，再下菜叶，沿锅边淋生抽，炒到刚刚断生马上加盐出锅。'], '12分钟', '125kcal'),
      createSeedRecipe('vegetable-beans', '干煸豆角', '/assets/recipes/usability-seeds/vegetable-beans.jpg', '豆角300g、肉末80g', '蒜3瓣', '食用油1勺、生抽1勺、盐少许', ['豆角去筋后切五厘米长段，洗净一定擦干；肉末用半勺生抽抓匀备用。', '锅中油热后下豆角中小火慢煸，期间多翻动，直到表皮起皱、有焦斑后盛出。', '留底油炒散肉末和蒜末，倒回豆角，加生抽和盐，大火翻匀至豆角完全熟透。'], '20分钟', '185kcal'),
      createSeedRecipe('vegetable-enoki', '蒜蓉金针菇', '/assets/recipes/usability-seeds/vegetable-enoki.jpg', '金针菇300g', '蒜5瓣、小米椒1个', '生抽1勺、蚝油1勺、食用油1勺', ['金针菇切去根部，掰成小束后迅速冲洗并沥水，平铺在耐热盘中。', '蒜末用小火炒至微黄，加入生抽、蚝油和两勺清水，煮开后关火，调成蒜蓉汁。', '蒜蓉汁均匀浇在金针菇上，水开后蒸六分钟；取出撒小米椒和葱花即可。'], '15分钟', '95kcal')
    ]
  },
  {
    id: 'meat',
    name: '大口吃肉',
    recipes: [
      createSeedRecipe('meat-ribs', '糖醋小排', '/assets/recipes/usability-seeds/meat-ribs.jpg', '排骨500g', '姜3片、葱1根', '生抽1勺、香醋2勺、白糖2勺', ['排骨冷水下锅，加入姜片和葱段煮出浮沫，捞出洗净并擦干表面水分。', '锅中少油，将排骨煎至两面金黄；按一勺生抽、两勺香醋、两勺白糖调好糖醋汁。', '倒入糖醋汁和没过排骨一半的热水，小火焖三十分钟，最后转大火不断翻动收至浓亮。'], '45分钟', '420kcal'),
      createSeedRecipe('meat-chicken', '黄焖鸡', '/assets/recipes/usability-seeds/meat-chicken.jpg', '鸡腿500g、土豆2个', '青椒1个、姜3片', '生抽2勺、蚝油1勺、食用油1勺', ['鸡腿剁小块后用清水泡十分钟去血水，土豆切滚刀块并浸水防止氧化。', '热锅下油，煎鸡块至表面金黄，放姜片炒香，再加入生抽和蚝油翻匀上色。', '加热水没过鸡块，焖二十分钟后放土豆；土豆变软时加入青椒，大火收汁到浓稠。'], '35分钟', '380kcal'),
      createSeedRecipe('meat-pork', '红烧肉', '/assets/recipes/usability-seeds/meat-pork.jpg', '五花肉500g', '姜3片、葱1根', '生抽2勺、老抽1勺、冰糖20g', ['五花肉切三厘米见方，冷水下锅焯去血沫，捞出后用温水洗净并沥干。', '锅中放少许油和冰糖，小火熬成琥珀色糖色，迅速倒入五花肉翻匀，注意不要熬焦。', '加入姜葱、生抽、老抽和热水，小火炖四十五分钟；肉能被筷子轻松插入时大火收汁。'], '60分钟', '520kcal')
    ]
  },
  {
    id: 'soup',
    name: '一碗鲜汤',
    recipes: [
      createSeedRecipe('soup-tomato-egg', '番茄蛋花汤', '/assets/recipes/usability-seeds/soup-tomato-egg.jpg', '番茄2个、鸡蛋2个', '葱1根', '盐少许、香油少许', ['番茄去蒂切小块，鸡蛋加一勺清水和少许盐打散，这样蛋花会更嫩。', '锅中少油炒番茄至边缘变软、析出红色汤汁，加足量热水煮两分钟。', '转小火让汤微沸，沿锅边细细淋入蛋液，十秒后再轻推；加盐、香油和葱花出锅。'], '12分钟', '130kcal'),
      createSeedRecipe('soup-winter-melon', '冬瓜排骨汤', '/assets/recipes/usability-seeds/soup-winter-melon.jpg', '排骨400g、冬瓜300g', '姜3片', '盐少许', ['排骨冷水焯透后洗净，放入砂锅加姜片和足量热水，大火烧开后撇净浮沫。', '转小火保持微沸炖四十分钟，汤色变白后再放入去皮切块的冬瓜。', '继续煮八到十分钟，冬瓜呈半透明、可被筷子轻松穿透时，最后加盐调味。'], '55分钟', '230kcal'),
      createSeedRecipe('soup-seaweed-egg', '紫菜蛋花汤', '/assets/recipes/usability-seeds/soup-seaweed-egg.jpg', '鸡蛋1个、紫菜10g', '葱1根', '盐少许、香油少许', ['紫菜剪成小片放入汤碗，鸡蛋充分打散，葱切成细葱花备用。', '锅中清水烧至沸腾，加盐调味；若喜欢更顺滑的口感，可先淋少许水淀粉勾薄芡。', '转小火沿锅边淋蛋液，待蛋花浮起后关火，冲入装紫菜的碗中，滴香油撒葱花。'], '8分钟', '85kcal')
    ]
  },
  {
    id: 'fruit',
    name: '饱腹主食',
    recipes: [
      createSeedRecipe('staple-fried-rice', '扬州炒饭', '/assets/recipes/usability-seeds/staple-fried-rice.jpg', '米饭2碗、鸡蛋2个', '胡萝卜1根、玉米粒80g', '食用油1勺、盐少许', ['米饭最好用隔夜饭，提前用手抓散；胡萝卜切小丁，与玉米粒一同焯水半分钟。', '热锅宽油，把鸡蛋炒成小块盛出；再下配菜炒干水汽，避免炒饭变湿软。', '下米饭大火压散，沿锅边淋少许生抽，倒回鸡蛋翻炒到米粒干爽分明，最后加盐调味。'], '15分钟', '430kcal'),
      createSeedRecipe('staple-tomato-noodles', '番茄鸡蛋面', '/assets/recipes/usability-seeds/staple-tomato-noodles.jpg', '面条200g、番茄2个、鸡蛋2个', '葱1根', '盐少许、生抽1勺', ['番茄切块，鸡蛋打散；先将鸡蛋炒至八成熟盛出，保留嫩滑口感。', '锅中炒软番茄并用铲子压出汁水，加生抽和两碗热水煮开，再倒回鸡蛋。', '另锅把面条煮到无白芯，捞入番茄汤中略煮三十秒，按口味加盐，撒葱花即可。'], '20分钟', '390kcal'),
      createSeedRecipe('staple-beef-rice', '牛肉盖饭', '/assets/recipes/usability-seeds/staple-beef-rice.jpg', '牛肉200g、米饭1碗', '洋葱1个、西兰花100g', '生抽1勺、蚝油1勺、食用油1勺', ['牛肉逆纹切薄片，加半勺生抽和少许淀粉抓匀；洋葱切丝，西兰花焯熟备用。', '热锅大火快速滑散牛肉，看到边缘变色立刻盛出，避免久炒变柴。', '原锅炒软洋葱，加入生抽、蚝油和少许热水煮成酱汁，倒回牛肉翻十秒，铺在热米饭上配西兰花。'], '25分钟', '480kcal')
    ]
  }
];

const limitText = (value, maxLength) => Array.from(String(value || '')).slice(0, maxLength).join('');

function getRecipeGroupsSnapshot() {
  const groups = JSON.parse(JSON.stringify(recipeGroups));
  groups.forEach((group) => {
    group.recipes.forEach((recipe) => {
      if (!recipe.crop) recipe.crop = { ...defaultCrop };
    });
  });
  return groups;
}

function getRecipeCategories() {
  return recipeGroups.map((group) => ({ id: group.id, name: group.name, recipeCount: group.recipes.length }));
}

function reorderRecipeCategories(orderedIds) {
  const groupById = {};
  recipeGroups.forEach((group) => { groupById[group.id] = group; });
  const ordered = (orderedIds || []).map((id) => groupById[id]).filter(Boolean);
  recipeGroups.forEach((group) => {
    if (ordered.indexOf(group) === -1) ordered.push(group);
  });
  recipeGroups.splice(0, recipeGroups.length, ...ordered);
  return getRecipeGroupsSnapshot();
}

function renameRecipeCategory(id, name) {
  const group = recipeGroups.find((item) => item.id === id);
  const nextName = limitText(String(name || '').trim(), 8);
  if (!group || !nextName) return getRecipeGroupsSnapshot();
  group.name = nextName;
  return getRecipeGroupsSnapshot();
}

function createRecipeCategory(name) {
  const nextName = limitText(String(name || '').trim(), 8);
  if (!nextName) return getRecipeGroupsSnapshot();
  recipeGroups.push({ id: `custom-group-${Date.now()}`, name: nextName, recipes: [] });
  return getRecipeGroupsSnapshot();
}

function deleteRecipeCategory(id) {
  const index = recipeGroups.findIndex((group) => group.id === id);
  if (index < 0) return getRecipeGroupsSnapshot();
  const removed = recipeGroups[index];
  recipeGroups.splice(index, 1);
  if (removed.recipes.length) {
    let uncategorized = recipeGroups.find((group) => group.name === '未分类');
    if (!uncategorized) {
      uncategorized = { id: `uncategorized-${Date.now()}`, name: '未分类', recipes: [] };
      recipeGroups.push(uncategorized);
    }
    uncategorized.recipes.push(...removed.recipes);
  }
  return getRecipeGroupsSnapshot();
}

function fetchRecipeGroups() {
  return new Promise((resolve) => {
    setTimeout(() => resolve(getRecipeGroupsSnapshot()), 650);
  });
}

function fetchRecipeListPage(options) {
  const value = options || {};
  const categoryId = String(value.categoryId || '');
  const offset = Math.max(0, Number(value.offset || 0) || 0);
  const pageSize = 20;
  return new Promise((resolve) => {
    setTimeout(() => {
      const groups = getRecipeGroupsSnapshot()
        .filter((group) => !categoryId || group.id === categoryId)
        .map((group) => {
          const recipeCount = group.recipes.length;
          const recipes = group.recipes.slice(offset, offset + pageSize);
          const nextOffset = offset + recipes.length;
          return {
            ...group,
            recipes,
            recipeCount,
            hasMore: nextOffset < recipeCount,
            nextOffset: nextOffset < recipeCount ? nextOffset : null
          };
        });
      resolve(groups);
    }, 180);
  });
}

function createRecipe(form) {
  const categoryName = (form.category || '').trim() || '未分类';
  let group = recipeGroups.find((item) => item.name === categoryName);
  if (!group) {
    group = { id: `custom-group-${Date.now()}`, name: categoryName, recipes: [] };
    recipeGroups.push(group);
  }
  const recipe = {
    id: `custom-recipe-${Date.now()}`,
    title: String(form.name || '').trim(),
    duration: form.duration ? `${form.duration}分钟` : '',
    calories: form.calories ? `${form.calories}kcal` : '',
    coverUrl: form.coverUrl || '',
    crop: { ...defaultCrop },
    mainIngredients: form.mainIngredients || '',
    sideIngredients: form.sideIngredients || '',
    seasonings: form.seasonings || '',
    steps: JSON.parse(JSON.stringify(form.steps || []))
  };
  group.recipes.unshift(recipe);
  return JSON.parse(JSON.stringify(recipe));
}

function recognizeRecipeFromImage(imagePath) {
  if (!imagePath) return Promise.reject(new Error('missing image'));
  // Mock recognition boundary. Replace this payload with the OCR/vision API
  // response without changing the editing page contract.
  return new Promise((resolve) => setTimeout(() => resolve({
    name: '西红柿炒鸡蛋',
    category: '家常小炒',
    duration: '22',
    calories: '200',
    coverUrl: '',
    mainIngredients: '番茄2个、鸡蛋3个',
    sideIngredients: '葱、蒜',
    seasonings: '食用油、盐、糖、生抽、番茄酱',
    steps: [
      { id: `recognized-step-${Date.now()}-1`, text: '番茄洗净切块，鸡蛋打入碗中，加少许盐搅散。', imageUrl: '' },
      { id: `recognized-step-${Date.now()}-2`, text: '锅烧热后倒油，炒熟鸡蛋后盛出，再炒番茄并倒回鸡蛋翻炒均匀。', imageUrl: '' }
    ]
  }), 700));
}

const deletedRecipeIds = {};

function parseIngredientItems(display) {
  return (display || '').split(/[、,，]/).map((value) => value.trim()).filter(Boolean).map((value) => {
    const matched = value.match(/^(.+?)(适量|少许|\d+(?:\.\d+)?\s*(?:千克|公斤|毫升|克|斤|两|个|颗|根|片|瓣|勺|杯|盒|袋|g|kg|ml|L))$/i);
    return matched ? { name: matched[1].trim(), amount: matched[2].trim() } : { name: value, amount: '' };
  });
}

function findRecipeRecord(id) {
  for (let groupIndex = 0; groupIndex < recipeGroups.length; groupIndex += 1) {
    const recipeIndex = recipeGroups[groupIndex].recipes.findIndex((item) => item.id === id);
    if (recipeIndex >= 0) return { groupIndex, recipeIndex, group: recipeGroups[groupIndex], recipe: recipeGroups[groupIndex].recipes[recipeIndex] };
  }
  return null;
}

function normalizeRecipeDetail(detail) {
  const ingredients = (detail.ingredients || []).filter((item) => String(item.display || '').trim());
  const steps = (detail.steps || []).filter((step) => (
    String(step.text || '').trim() || String(step.imageUrl || '').trim()
  ));
  return {
    ...detail,
    duration: String(detail.duration || '').trim(),
    calories: String(detail.calories || '').trim(),
    heroImage: String(detail.heroImage || '').trim(),
    ingredients,
    steps
  };
}

function toRecipeDetail(recipe, category) {
  return normalizeRecipeDetail({
    id: recipe.id,
    category,
    title: recipe.title,
    duration: recipe.duration || '',
    calories: recipe.calories || '',
    heroImage: recipe.coverUrl || '',
    ingredients: [
      { group: '主料', display: recipe.mainIngredients || '', items: parseIngredientItems(recipe.mainIngredients) },
      { group: '辅料', display: recipe.sideIngredients || '', items: parseIngredientItems(recipe.sideIngredients) },
      { group: '调料', display: recipe.seasonings || '', items: parseIngredientItems(recipe.seasonings) }
    ],
    steps: JSON.parse(JSON.stringify(recipe.steps || []))
  });
}

function fetchRecipeDetail(id = 'cabbage') {
  if (deletedRecipeIds[id]) return new Promise((resolve) => setTimeout(() => resolve(null), 180));
  const record = findRecipeRecord(id);
  const detail = record ? toRecipeDetail(record.recipe, record.group.name) : null;
  return new Promise((resolve) => setTimeout(() => resolve(detail ? JSON.parse(JSON.stringify(detail)) : null), 450));
}

function updateRecipe(id, form) {
  const record = findRecipeRecord(id);
  if (!record) return createRecipe(form);
  const targetName = (form.category || '').trim() || record.group.name;
  let targetGroup = recipeGroups.find((group) => group.name === targetName);
  if (!targetGroup) {
    targetGroup = { id: `custom-group-${Date.now()}`, name: targetName, recipes: [] };
    recipeGroups.push(targetGroup);
  }
  const updated = {
    ...record.recipe,
    id,
    title: String(form.name || '').trim(),
    duration: form.duration ? `${form.duration}分钟` : '',
    calories: form.calories ? `${form.calories}kcal` : '',
    coverUrl: form.coverUrl || '',
    mainIngredients: form.mainIngredients || '',
    sideIngredients: form.sideIngredients || '',
    seasonings: form.seasonings || '',
    steps: JSON.parse(JSON.stringify(form.steps || []))
  };
  if (targetGroup === record.group) {
    record.group.recipes.splice(record.recipeIndex, 1, updated);
  } else {
    record.group.recipes.splice(record.recipeIndex, 1);
    const targetIndex = Math.min(record.recipeIndex, targetGroup.recipes.length);
    targetGroup.recipes.splice(targetIndex, 0, updated);
  }
  return JSON.parse(JSON.stringify(updated));
}

function deleteRecipe(id) {
  const record = findRecipeRecord(id);
  if (record) record.group.recipes.splice(record.recipeIndex, 1);
  deletedRecipeIds[id] = true;
  return Boolean(record);
}

module.exports = {
  fetchRecipeGroups,
  fetchRecipeListPage,
  getRecipeCategories,
  reorderRecipeCategories,
  renameRecipeCategory,
  createRecipeCategory,
  deleteRecipeCategory,
  fetchRecipeDetail,
  createRecipe,
  recognizeRecipeFromImage,
  updateRecipe,
  deleteRecipe
};
