import { randomUUID } from 'node:crypto';

export type RecipeGenerationProvider = 'rules' | 'ai';
export type RecipeGenerationSourceType = 'link' | 'image' | 'text';

export type RecipeGenerationWarning = { code: string; message: string };
export type RecipeGenerationStep = { id: string; text: string; imageUrl: string };
export type RecipeGenerationDraft = {
  name: string;
  title: string;
  rawName: string;
  displayName: string;
  category: string;
  duration: string;
  calories: string;
  coverUrl: string;
  mainIngredients: string;
  sideIngredients: string;
  seasonings: string;
  steps: RecipeGenerationStep[];
  sourceType: RecipeGenerationSourceType;
  sourceMeta: {
    provider: RecipeGenerationProvider;
    sourceType: RecipeGenerationSourceType;
    inputSummary: string;
  };
};

export type RecipeGenerationProviderResult = {
  draft: RecipeGenerationDraft;
  warnings: RecipeGenerationWarning[];
  explanations: RecipeGenerationWarning[];
};

export type RecipeGenerationRequest = {
  sourceType?: unknown;
  provider?: unknown;
  input?: unknown;
};

export type NormalizedRecipeGenerationRequest = {
  sourceType: RecipeGenerationSourceType;
  provider: RecipeGenerationProvider;
  input: {
    url?: string;
    text?: string;
    imageFileId?: string;
  };
};

export type RecipeGenerationExecutionResult =
  | { ok: true; requestId: string; data: RecipeGenerationProviderResult }
  | { ok: false; requestId: string; error: { code: string; message: string } };

export type RecipeGenerationExecutionOptions = {
  timeoutMs?: number;
  createRequestId?: () => string;
  rulesProvider?: (request: NormalizedRecipeGenerationRequest) => Promise<RecipeGenerationProviderResult>;
};

export class GenerationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const DEFAULT_TIMEOUT_MS = 8000;
const SOURCE_TYPES = new Set(['link', 'image', 'text']);
const PROVIDERS = new Set(['rules', 'ai']);
const INGREDIENT_AMOUNT_PATTERN = /([\u4e00-\u9fa5A-Za-z]{1,16})\s*(\d+(?:\.\d+)?\s*(?:千克|公斤|毫升|克|斤|两|个|颗|根|片|瓣|勺|杯|盒|袋|g|kg|ml|l|L))/g;
const KNOWN_DISH_PATTERN = /(番茄炒蛋|西红柿炒鸡蛋|番茄菌菇汤|凉拌黄瓜|手撕包菜|家常豆腐|黄焖鸡|糖醋小排|牛肉炒饭|清炒西兰花)/;

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GenerationError('INVALID_ARGUMENT', '请求参数格式不正确');
  }
  return value as Record<string, unknown>;
};

const optionalText = (value: unknown, maximum: number): string => {
  if (value === undefined || value === null) return '';
  const text = String(value).trim();
  if (Array.from(text).length > maximum) {
    throw new GenerationError('INVALID_ARGUMENT', `输入内容不能超过 ${maximum} 个字符`);
  }
  return text;
};

const requiredText = (value: unknown, field: string, maximum: number): string => {
  const text = optionalText(value, maximum);
  if (!text) throw new GenerationError('INVALID_ARGUMENT', `${field}不能为空`);
  return text;
};

const parseUrl = (value: unknown): string => {
  const url = requiredText(value, '链接', 2000);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new GenerationError('INVALID_ARGUMENT', '链接格式不正确');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new GenerationError('INVALID_ARGUMENT', '链接必须以 http 或 https 开头');
  }
  return parsed.toString();
};

const parseProvider = (value: unknown): RecipeGenerationProvider => {
  const provider = String(value || '').trim();
  if (!PROVIDERS.has(provider)) {
    throw new GenerationError('INVALID_ARGUMENT', 'provider 必须是 rules 或 ai');
  }
  return provider as RecipeGenerationProvider;
};

const parseSourceType = (value: unknown): RecipeGenerationSourceType => {
  const sourceType = String(value || '').trim();
  if (!SOURCE_TYPES.has(sourceType)) {
    throw new GenerationError('INVALID_ARGUMENT', 'sourceType 必须是 link、image 或 text');
  }
  return sourceType as RecipeGenerationSourceType;
};

export const parseRecipeGenerationRequest = (
  request: RecipeGenerationRequest
): NormalizedRecipeGenerationRequest => {
  const payload = asObject(request);
  const sourceType = parseSourceType(payload.sourceType);
  const provider = parseProvider(payload.provider);
  const input = asObject(payload.input);
  if (sourceType === 'link') {
    return { sourceType, provider, input: { url: parseUrl(input.url), text: optionalText(input.text, 5000) } };
  }
  if (sourceType === 'text') {
    return { sourceType, provider, input: { text: requiredText(input.text, '文字描述', 5000) } };
  }
  const imageFileId = requiredText(input.imageFileId, '图片文件', 500);
  return {
    sourceType,
    provider,
    input: {
      imageFileId,
      text: optionalText(input.text ?? input.supplementalText, 5000)
    }
  };
};

const clean = (value: unknown, maximum: number): string => (
  Array.from(String(value ?? '').trim()).slice(0, maximum).join('')
);

const limitOptionalNumberText = (value: unknown, field: string, maximum: number): string => {
  const text = clean(value, 20);
  if (!text) return '';
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new GenerationError('GENERATION_OUTPUT_INVALID', `${field}格式不正确`);
  }
  return String(parsed);
};

const validateWarnings = (value: unknown): RecipeGenerationWarning[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new GenerationError('GENERATION_OUTPUT_INVALID', 'warnings 格式不正确');
  return value.map((item) => {
    const warning = asObject(item);
    const code = clean(warning.code, 64);
    const message = clean(warning.message, 200);
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(code) || !message) {
      throw new GenerationError('GENERATION_OUTPUT_INVALID', 'warning 内容不正确');
    }
    return { code, message };
  });
};

export const validateRecipeGenerationResult = (
  value: unknown,
  request: NormalizedRecipeGenerationRequest
): RecipeGenerationProviderResult => {
  const result = asObject(value);
  const draft = asObject(result.draft);
  const title = clean(draft.title ?? draft.name ?? draft.displayName, 200);
  if (!title) throw new GenerationError('GENERATION_OUTPUT_INVALID', '生成草稿缺少菜名');
  const stepsValue = draft.steps;
  if (!Array.isArray(stepsValue)) throw new GenerationError('GENERATION_OUTPUT_INVALID', '制作步骤格式不正确');
  if (stepsValue.length > 100) throw new GenerationError('GENERATION_OUTPUT_INVALID', '制作步骤不能超过 100 条');
  const steps = stepsValue.map((item, index) => {
    const step = asObject(item);
    const text = clean(step.text, 500);
    if (!text) throw new GenerationError('GENERATION_OUTPUT_INVALID', '制作步骤不能为空');
    return {
      id: clean(step.id, 80) || `generated-step-${index + 1}`,
      text,
      imageUrl: clean(step.imageUrl, 1000)
    };
  });
  return {
    draft: {
      name: title,
      title,
      rawName: clean(draft.rawName ?? title, 200) || title,
      displayName: clean(draft.displayName ?? title, 200) || title,
      category: clean(draft.category, 8),
      duration: limitOptionalNumberText(draft.duration, '用时', 999),
      calories: limitOptionalNumberText(draft.calories, '热量', 9999),
      coverUrl: clean(draft.coverUrl, 1000),
      mainIngredients: clean(draft.mainIngredients, 2000),
      sideIngredients: clean(draft.sideIngredients, 2000),
      seasonings: clean(draft.seasonings, 2000),
      steps,
      sourceType: request.sourceType,
      sourceMeta: {
        provider: request.provider,
        sourceType: request.sourceType,
        inputSummary: clean(asObject(draft.sourceMeta || {}).inputSummary, 300) || summarizeInput(request)
      }
    },
    warnings: validateWarnings(result.warnings),
    explanations: validateWarnings(result.explanations)
  };
};

const summarizeInput = (request: NormalizedRecipeGenerationRequest): string => {
  if (request.sourceType === 'link') return request.input.url || '';
  if (request.sourceType === 'image') return request.input.imageFileId || '';
  return clean(request.input.text, 80);
};

const titleFromUrl = (url: string): string => {
  const parsed = new URL(url);
  const pathParts = decodeURIComponent(parsed.pathname)
    .split('/')
    .map((part) => part.replace(/[-_]+/g, ' ').trim())
    .filter(Boolean);
  const candidate = pathParts.reverse().find((part) => /[\u4e00-\u9fa5A-Za-z]/.test(part));
  return clean(candidate || `${parsed.hostname} 菜谱草稿`, 40);
};

const titleFromText = (text: string): string => {
  const named = text.match(/(?:菜名|标题|名称)\s*[:：]\s*([^\n，。；;]+)/);
  if (named) return clean(named[1], 40);
  const known = text.match(KNOWN_DISH_PATTERN);
  if (known) return known[1];
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || '';
  if (firstLine && !/[：:]/.test(firstLine)) return clean(firstLine, 40);
  return '文字菜谱草稿';
};

const firstFieldLine = (text: string, labels: string[]): string => {
  const pattern = new RegExp(`^(?:${labels.join('|')})\\s*[:：]\\s*(.+)$`, 'm');
  const matched = text.match(pattern);
  return matched ? clean(matched[1], 2000) : '';
};

const ingredientsFromText = (text: string): string => {
  const explicit = firstFieldLine(text, ['食材', '材料', '主料']);
  if (explicit) return explicit;
  const values: string[] = [];
  for (const matched of text.matchAll(INGREDIENT_AMOUNT_PATTERN)) {
    values.push(`${matched[1].trim()}${matched[2].replace(/\s+/g, '')}`);
  }
  return [...new Set(values)].slice(0, 12).join('、');
};

const stepsFromText = (text: string): RecipeGenerationStep[] => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const stepLines = lines
    .map((line) => line.replace(/^(?:步骤\s*)?\d+[.、：:]\s*/, '').trim())
    .filter((line) => line && !/^(?:菜名|标题|名称|食材|材料|主料|辅料|调料|用时|耗时|热量)\s*[:：]/.test(line));
  const source = stepLines.length ? stepLines : text.split(/[。；;]/).map((part) => part.trim()).filter(Boolean);
  return source.slice(0, 6).map((line, index) => ({
    id: `generated-step-${index + 1}`,
    text: clean(line, 500),
    imageUrl: ''
  })).filter((step) => step.text);
};

const draftFromText = (
  text: string,
  sourceType: RecipeGenerationSourceType,
  inputSummary: string
): RecipeGenerationDraft => {
  const title = titleFromText(text);
  const steps = stepsFromText(text);
  return {
    name: title,
    title,
    rawName: title,
    displayName: title,
    category: '',
    duration: clean(firstFieldLine(text, ['用时', '耗时']).replace(/\D/g, ''), 3),
    calories: clean(firstFieldLine(text, ['热量', '卡路里']).replace(/\D/g, ''), 4),
    coverUrl: '',
    mainIngredients: ingredientsFromText(text),
    sideIngredients: firstFieldLine(text, ['辅料']),
    seasonings: firstFieldLine(text, ['调料', '调味']),
    steps: steps.length ? steps : [{ id: 'generated-step-1', text: '请补充制作步骤。', imageUrl: '' }],
    sourceType,
    sourceMeta: { provider: 'rules', sourceType, inputSummary }
  };
};

export const runRulesRecipeGenerationProvider = async (
  request: NormalizedRecipeGenerationRequest
): Promise<RecipeGenerationProviderResult> => {
  if (request.sourceType === 'link') {
    const title = titleFromUrl(request.input.url || '');
    return {
      draft: {
        name: title,
        title,
        rawName: title,
        displayName: title,
        category: '',
        duration: '',
        calories: '',
        coverUrl: '',
        mainIngredients: '',
        sideIngredients: '',
        seasonings: '',
        steps: [{ id: 'generated-step-1', text: '请根据原链接确认食材和制作步骤。', imageUrl: '' }],
        sourceType: 'link',
        sourceMeta: { provider: 'rules', sourceType: 'link', inputSummary: request.input.url || '' }
      },
      warnings: [{ code: 'LOW_CONFIDENCE', message: '链接首版仅按规则生成草稿，请确认后再保存。' }],
      explanations: [{ code: 'RULES_LINK_TITLE', message: '已从链接路径提取候选菜名。' }]
    };
  }
  if (request.sourceType === 'image') {
    if (!request.input.text) {
      throw new GenerationError('IMAGE_RULES_INPUT_INSUFFICIENT', '图片规则生成需要补充菜名或文字说明');
    }
    return {
      draft: draftFromText(request.input.text, 'image', request.input.imageFileId || ''),
      warnings: [{ code: 'LOW_CONFIDENCE', message: '图片首版未接视觉识别，已按补充说明生成草稿。' }],
      explanations: [{ code: 'RULES_IMAGE_TEXT', message: '已根据用户补充说明生成菜谱草稿。' }]
    };
  }
  return {
    draft: draftFromText(request.input.text || '', 'text', clean(request.input.text, 80)),
    warnings: [],
    explanations: [{ code: 'RULES_TEXT_PARSE', message: '已按文本中的菜名、食材和步骤线索生成草稿。' }]
  };
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new GenerationError('GENERATION_TIMEOUT', '生成超时，请稍后重试或手动录入'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export const executeRecipeGeneration = async (
  request: RecipeGenerationRequest,
  options: RecipeGenerationExecutionOptions = {}
): Promise<RecipeGenerationExecutionResult> => {
  const requestId = (options.createRequestId || randomUUID)();
  try {
    const normalized = parseRecipeGenerationRequest(request);
    if (normalized.provider === 'ai') {
      throw new GenerationError('GENERATION_PROVIDER_UNAVAILABLE', 'AI provider 暂未启用，请使用 rules');
    }
    const provider = options.rulesProvider || runRulesRecipeGenerationProvider;
    const raw = await withTimeout(provider(normalized), options.timeoutMs || DEFAULT_TIMEOUT_MS);
    return {
      ok: true,
      requestId,
      data: validateRecipeGenerationResult(raw, normalized)
    };
  } catch (error) {
    if (error instanceof GenerationError) {
      return { ok: false, requestId, error: { code: error.code, message: error.message } };
    }
    return {
      ok: false,
      requestId,
      error: { code: 'GENERATION_PROVIDER_UNAVAILABLE', message: '生成 provider 不可用' }
    };
  }
};

export const recipeGenerationEngineInternals = {
  titleFromText,
  titleFromUrl,
  ingredientsFromText,
  stepsFromText,
  draftFromText
};
