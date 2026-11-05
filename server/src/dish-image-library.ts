import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

export type ParameterizedQueryExecutor = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type DishImageSearchResult = {
  imageId: string;
  dishId: string;
  dishName: string;
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  matchedKeyword: string;
  score: number;
  exactMatch: boolean;
  imageUrl: string;
};

export type DishNameStandardization = {
  rawName: string;
  normalizedName: string;
  displayName: string;
  canonicalDishId: string | null;
  matchedAlias: string;
  matchType: 'alias' | 'canonical' | 'rule' | 'none';
  evidence: Array<{ type: string; value: string }>;
};

export type DishImageGenerationPlaceholder = {
  normalizedName: string;
  matched: boolean;
  standardDishId: string;
  provider: 'rules';
  generationJobId: null;
  image: {
    assetId: null;
    url: string;
    status: 'pending_ops';
    source: 'placeholder';
  };
  evidence: DishNameStandardization['evidence'];
};

export type AdminDishImageStatus = 'PENDING' | 'READY' | 'FAILED' | 'RETIRED';

export type AdminDishImageItem = {
  id: string;
  canonicalDishId: string;
  dishName: string;
  normalizedName: string;
  dishStatus: string;
  status: AdminDishImageStatus;
  provider: string;
  providerModel: string | null;
  storageKey: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  isCurrent: boolean;
  failureCode: string | null;
  failureSummary: string | null;
  updatedAt: string;
  createdAt: string;
};

export type AdminDishImageUpdateInput = {
  status?: AdminDishImageStatus;
  storageKey?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  provider?: string;
  providerModel?: string | null;
  isCurrent?: boolean;
  failureCode?: string | null;
  failureSummary?: string | null;
};

export type AdminOperationContext = {
  actorId: string;
  reason?: string;
  requestId?: string;
};

export type AdminDishAlias = {
  id: string;
  canonicalDishId: string;
  rawName: string;
  normalizedName: string;
  locale: string;
  createdBy: string;
  createdAt: string;
};

const BUILTIN_DISH_SYNONYMS = [
  { displayName: '番茄炒蛋', aliases: ['番茄炒蛋', '西红柿炒蛋', '西红柿炒鸡蛋', '番茄炒鸡蛋'] },
  { displayName: '凉拌黄瓜', aliases: ['凉拌黄瓜', '拍黄瓜', '拍青瓜', '凉拌青瓜'] },
  { displayName: '清炒西兰花', aliases: ['清炒西兰花', '蒜蓉西兰花', '炒西兰花'] }
];

export const normalizeDishName = (value: string): string => (
  value
    .trim()
    .toLocaleLowerCase('zh-CN')
    .replace(/[（）()【】\[\]《》<>「」『』"'“”‘’、，,。.\s-]+/g, '')
);

const normalizeKeyword = normalizeDishName;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADMIN_DISH_IMAGE_STATUSES = new Set<AdminDishImageStatus>(['PENDING', 'READY', 'FAILED', 'RETIRED']);

const assertUuid = (value: string, label: string): void => {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} 格式无效`);
};

const optionalTrimmedString = (value: string | null | undefined): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const optionalPositiveInteger = (value: number | null | undefined, label: string): number | null | undefined => {
  if (value === undefined || value === null) return value;
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} 必须是正整数`);
  return value;
};

const mapAdminDishImage = (row: Record<string, unknown>): AdminDishImageItem => ({
  id: String(row.id),
  canonicalDishId: String(row.canonical_dish_id),
  dishName: String(row.dish_name),
  normalizedName: String(row.normalized_name),
  dishStatus: String(row.dish_status),
  status: String(row.status) as AdminDishImageStatus,
  provider: String(row.provider),
  providerModel: row.provider_model === null ? null : String(row.provider_model),
  storageKey: row.storage_key === null ? null : String(row.storage_key),
  mimeType: row.mime_type === null ? null : String(row.mime_type),
  width: row.width === null ? null : Number(row.width),
  height: row.height === null ? null : Number(row.height),
  isCurrent: Boolean(row.is_current),
  failureCode: row.failure_code === null ? null : String(row.failure_code),
  failureSummary: row.failure_summary === null ? null : String(row.failure_summary),
  updatedAt: new Date(String(row.updated_at)).toISOString(),
  createdAt: new Date(String(row.created_at)).toISOString()
});

const insertAdminAuditLog = async (
  executor: ParameterizedQueryExecutor,
  context: AdminOperationContext,
  action: string,
  entityType: string,
  entityId: string | null,
  beforeState: unknown,
  afterState: unknown,
  metadata: Record<string, unknown> = {}
): Promise<void> => {
  await executor.query(`
    INSERT INTO admin_audit_logs (
      id, actor_id, action, entity_type, entity_id, request_id, reason, before_state, after_state, metadata
    ) VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb)
  `, [
    randomUUID(),
    context.actorId.trim() || 'admin-api',
    action,
    entityType,
    entityId,
    context.requestId || null,
    context.reason || null,
    beforeState === undefined ? null : JSON.stringify(beforeState),
    afterState === undefined ? null : JSON.stringify(afterState),
    JSON.stringify(metadata)
  ]);
};

const stableUuid = (value: string): string => {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  const joined = hex.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
};

const standardizationResult = (
  rawName: string,
  normalizedName: string,
  displayName: string,
  canonicalDishId: string | null,
  matchedAlias: string,
  matchType: DishNameStandardization['matchType'],
  evidence: Array<{ type: string; value: string }>
): DishNameStandardization => ({
  rawName,
  normalizedName,
  displayName,
  canonicalDishId,
  matchedAlias,
  matchType,
  evidence
});

export const standardizeDishName = async (
  executor: ParameterizedQueryExecutor,
  rawName: string
): Promise<DishNameStandardization> => {
  const normalized = normalizeDishName(rawName);
  if (!normalized) return standardizationResult(rawName, '', '', null, '', 'none', []);

  const aliasResult = await executor.query(`
    SELECT
      dish.id::text AS dish_id,
      dish.display_name AS display_name,
      alias.raw_name AS matched_alias,
      alias.normalized_name AS normalized_name
    FROM dish_aliases alias
    JOIN canonical_dishes dish ON dish.id = alias.canonical_dish_id
    WHERE alias.normalized_name = $1
      AND dish.status = 'ACTIVE'
    ORDER BY alias.raw_name
    LIMIT 1
  `, [normalized]);
  if (aliasResult.rows.length) {
    const row = aliasResult.rows[0];
    return standardizationResult(rawName, String(row.normalized_name), String(row.display_name), String(row.dish_id), String(row.matched_alias), 'alias', [
      { type: 'dish_aliases.normalized_name', value: normalized }
    ]);
  }

  const canonicalResult = await executor.query(`
    SELECT id::text AS dish_id, display_name, normalized_name
    FROM canonical_dishes
    WHERE normalized_name = $1
      AND status = 'ACTIVE'
    ORDER BY display_name
    LIMIT 1
  `, [normalized]);
  if (canonicalResult.rows.length) {
    const row = canonicalResult.rows[0];
    return standardizationResult(rawName, String(row.normalized_name), String(row.display_name), String(row.dish_id), String(row.display_name), 'canonical', [
      { type: 'canonical_dishes.normalized_name', value: normalized }
    ]);
  }

  const rule = BUILTIN_DISH_SYNONYMS.find((item) => (
    item.aliases.map(normalizeDishName).includes(normalized)
  ));
  if (rule) {
    return standardizationResult(rawName, normalizeDishName(rule.displayName), rule.displayName, null, rawName.trim(), 'rule', [
      { type: 'builtin_synonym', value: rule.displayName }
    ]);
  }

  return standardizationResult(rawName, normalized, rawName.trim(), null, rawName.trim(), 'none', [
    { type: 'normalized_text', value: normalized }
  ]);
};

export const createDishImageGenerationPlaceholder = async (
  executor: ParameterizedQueryExecutor,
  dishName: string,
  provider: 'rules' | 'ai' = 'rules'
): Promise<DishImageGenerationPlaceholder> => {
  if (provider !== 'rules') {
    throw new Error('AI provider 暂未启用，请使用 rules');
  }
  const standardized = await standardizeDishName(executor, dishName);
  if (!standardized.normalizedName) {
    throw new Error('菜名不能为空');
  }
  const standardDishId = standardized.canonicalDishId || stableUuid(`provisional-dish:${standardized.normalizedName}`);
  if (!standardized.canonicalDishId) {
    await executor.query(`
      INSERT INTO canonical_dishes (
        id, display_name, normalized_name, status, ingredient_signature, created_by, updated_by
      ) VALUES ($1::uuid, $2, $3, 'PROVISIONAL', $4::jsonb, 'rules-placeholder', 'rules-placeholder')
      ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        normalized_name = EXCLUDED.normalized_name,
        status = CASE
          WHEN canonical_dishes.status = 'ACTIVE' THEN canonical_dishes.status
          ELSE 'PROVISIONAL'
        END,
        ingredient_signature = EXCLUDED.ingredient_signature,
        updated_by = 'rules-placeholder'
    `, [
      standardDishId,
      standardized.displayName || dishName.trim(),
      standardized.normalizedName,
      JSON.stringify({ source: 'dishImages.generate', evidence: standardized.evidence })
    ]);
  }
  return {
    normalizedName: standardized.displayName || standardized.normalizedName,
    matched: Boolean(standardized.canonicalDishId),
    standardDishId,
    provider: 'rules',
    generationJobId: null,
    image: {
      assetId: null,
      url: '',
      status: 'pending_ops',
      source: 'placeholder'
    },
    evidence: standardized.evidence
  };
};

export const searchDishImages = async (
  executor: ParameterizedQueryExecutor,
  keyword: string,
  limit = 20
): Promise<DishImageSearchResult[]> => {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return [];
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 50);
  const result = await executor.query(`
    WITH keyword_matches AS (
      SELECT
        keyword.dish_asset_id,
        keyword.keyword AS matched_keyword,
        keyword.normalized_keyword = $1 AS is_exact_match,
        (
          keyword.weight
          + CASE
              WHEN keyword.normalized_keyword = $1 THEN 1000
              WHEN keyword.normalized_keyword LIKE $1 || '%' THEN 500
              WHEN keyword.normalized_keyword LIKE '%' || $1 || '%' THEN 250
              WHEN $1 LIKE '%' || keyword.normalized_keyword || '%' THEN 100
              ELSE 0
            END
        )::integer AS score
      FROM dish_asset_keywords keyword
      WHERE keyword.normalized_keyword LIKE '%' || $1 || '%'
         OR $1 LIKE '%' || keyword.normalized_keyword || '%'
    ),
    ranked_matches AS (
      SELECT DISTINCT ON (dish_asset_id)
        dish_asset_id, matched_keyword, is_exact_match, score
      FROM keyword_matches
      ORDER BY dish_asset_id, score DESC, matched_keyword
    )
    SELECT
      asset.id::text AS image_id,
      dish.id::text AS dish_id,
      dish.display_name AS dish_name,
      asset.storage_key,
      asset.mime_type,
      asset.width,
      asset.height,
      match.matched_keyword,
      match.score,
      match.is_exact_match
    FROM ranked_matches match
    JOIN dish_assets asset ON asset.id = match.dish_asset_id
    JOIN canonical_dishes dish ON dish.id = asset.canonical_dish_id
    WHERE asset.status = 'READY' AND asset.is_current
    ORDER BY match.score DESC, dish.display_name, asset.id
    LIMIT $2
  `, [normalized, safeLimit]);

  return result.rows.map((row) => ({
    imageId: String(row.image_id),
    dishId: String(row.dish_id),
    dishName: String(row.dish_name),
    storageKey: String(row.storage_key),
    mimeType: String(row.mime_type),
    width: Number(row.width),
    height: Number(row.height),
    matchedKeyword: String(row.matched_keyword),
    score: Number(row.score),
    exactMatch: Boolean(row.is_exact_match),
    imageUrl: `/api/dish-images/${String(row.image_id)}`
  }));
};

export const hasExactDishImageMatch = (items: DishImageSearchResult[]): boolean =>
  items.some((item) => item.exactMatch);

export const listAdminDishImages = async (
  executor: ParameterizedQueryExecutor,
  filters: { status?: string; q?: string; limit?: number } = {}
): Promise<AdminDishImageItem[]> => {
  const status = filters.status?.trim().toUpperCase();
  if (status && !ADMIN_DISH_IMAGE_STATUSES.has(status as AdminDishImageStatus)) {
    throw new Error('图片状态无效');
  }
  const rawQuery = filters.q?.trim() || '';
  const normalizedQuery = rawQuery ? normalizeDishName(rawQuery) : '';
  const safeLimit = Math.min(Math.max(Math.trunc(filters.limit || 50), 1), 100);

  const result = await executor.query(`
    SELECT
      asset.id::text AS id,
      asset.canonical_dish_id::text AS canonical_dish_id,
      dish.display_name AS dish_name,
      dish.normalized_name AS normalized_name,
      dish.status AS dish_status,
      asset.status,
      asset.provider,
      asset.provider_model,
      asset.storage_key,
      asset.mime_type,
      asset.width,
      asset.height,
      asset.is_current,
      asset.failure_code,
      asset.failure_summary,
      asset.updated_at,
      asset.created_at
    FROM dish_assets asset
    JOIN canonical_dishes dish ON dish.id = asset.canonical_dish_id
    WHERE ($1::text IS NULL OR asset.status = $1)
      AND (
        $2::text IS NULL
        OR dish.normalized_name LIKE '%' || $2 || '%'
        OR lower(dish.display_name) LIKE '%' || lower($3) || '%'
      )
    ORDER BY asset.updated_at DESC, asset.created_at DESC, asset.id
    LIMIT $4
  `, [
    status || null,
    normalizedQuery || null,
    rawQuery || null,
    safeLimit
  ]);

  return result.rows.map(mapAdminDishImage);
};

const getAdminDishImage = async (
  executor: ParameterizedQueryExecutor,
  assetId: string
): Promise<AdminDishImageItem | null> => {
  const result = await executor.query(`
    SELECT
      asset.id::text AS id,
      asset.canonical_dish_id::text AS canonical_dish_id,
      dish.display_name AS dish_name,
      dish.normalized_name AS normalized_name,
      dish.status AS dish_status,
      asset.status,
      asset.provider,
      asset.provider_model,
      asset.storage_key,
      asset.mime_type,
      asset.width,
      asset.height,
      asset.is_current,
      asset.failure_code,
      asset.failure_summary,
      asset.updated_at,
      asset.created_at
    FROM dish_assets asset
    JOIN canonical_dishes dish ON dish.id = asset.canonical_dish_id
    WHERE asset.id = $1::uuid
  `, [assetId]);
  return result.rows.length ? mapAdminDishImage(result.rows[0]) : null;
};

export const updateAdminDishImage = async (
  executor: ParameterizedQueryExecutor,
  assetId: string,
  input: AdminDishImageUpdateInput,
  context: AdminOperationContext
): Promise<AdminDishImageItem> => {
  assertUuid(assetId, '图片资产 ID');
  const before = await getAdminDishImage(executor, assetId);
  if (!before) throw new Error('图片资产不存在');

  const status = input.status === undefined ? before.status : input.status;
  if (!ADMIN_DISH_IMAGE_STATUSES.has(status)) throw new Error('图片状态无效');

  const storageKeyValue = optionalTrimmedString(input.storageKey);
  const mimeTypeValue = optionalTrimmedString(input.mimeType);
  const widthValue = optionalPositiveInteger(input.width, 'width');
  const heightValue = optionalPositiveInteger(input.height, 'height');
  const providerValue = optionalTrimmedString(input.provider);
  const providerModelValue = optionalTrimmedString(input.providerModel);
  const failureCodeValue = optionalTrimmedString(input.failureCode);
  const failureSummaryValue = optionalTrimmedString(input.failureSummary);
  const storageKey = storageKeyValue === undefined ? before.storageKey : storageKeyValue;
  const mimeType = mimeTypeValue === undefined ? before.mimeType : mimeTypeValue;
  const width = widthValue === undefined ? before.width : widthValue;
  const height = heightValue === undefined ? before.height : heightValue;
  const provider = providerValue === undefined ? before.provider : providerValue;
  const providerModel = providerModelValue === undefined ? before.providerModel : providerModelValue;
  const failureCode = failureCodeValue === undefined ? before.failureCode : failureCodeValue;
  const failureSummary = failureSummaryValue === undefined ? before.failureSummary : failureSummaryValue;
  const requestedCurrent = input.isCurrent === undefined ? before.isCurrent : input.isCurrent;
  const isCurrent = status === 'READY' ? requestedCurrent : false;

  if (input.isCurrent === true && status !== 'READY') {
    throw new Error('只有 READY 图片可以设为当前图');
  }
  if (status === 'READY' && (!storageKey || !mimeType || !width || !height)) {
    throw new Error('READY 图片必须包含 storageKey、mimeType、width 和 height');
  }
  if (!provider) throw new Error('provider 不能为空');

  if (isCurrent) {
    await executor.query(`
      UPDATE dish_assets
      SET is_current = false, updated_by = $2
      WHERE canonical_dish_id = $1::uuid AND is_current
    `, [before.canonicalDishId, context.actorId]);
  }

  const updated = await executor.query(`
    UPDATE dish_assets asset
    SET
      status = $2,
      storage_key = $3,
      mime_type = $4,
      width = $5,
      height = $6,
      provider = $7,
      provider_model = $8,
      is_current = $9,
      failure_code = $10,
      failure_summary = $11,
      updated_by = $12
    FROM canonical_dishes dish
    WHERE asset.id = $1::uuid
      AND dish.id = asset.canonical_dish_id
    RETURNING
      asset.id::text AS id,
      asset.canonical_dish_id::text AS canonical_dish_id,
      dish.display_name AS dish_name,
      dish.normalized_name AS normalized_name,
      dish.status AS dish_status,
      asset.status,
      asset.provider,
      asset.provider_model,
      asset.storage_key,
      asset.mime_type,
      asset.width,
      asset.height,
      asset.is_current,
      asset.failure_code,
      asset.failure_summary,
      asset.updated_at,
      asset.created_at
  `, [
    assetId,
    status,
    storageKey,
    mimeType,
    width,
    height,
    provider,
    providerModel,
    isCurrent,
    failureCode,
    failureSummary,
    context.actorId
  ]);
  const after = mapAdminDishImage(updated.rows[0]);
  await insertAdminAuditLog(executor, context, 'dish_image.update', 'dish_asset', assetId, before, after);
  return after;
};

export const regenerateAdminDishImage = async (
  executor: ParameterizedQueryExecutor,
  assetId: string,
  context: AdminOperationContext
): Promise<{
  asset: AdminDishImageItem;
  provider: 'rules';
  generationJobId: null;
  message: string;
}> => {
  assertUuid(assetId, '图片资产 ID');
  const before = await getAdminDishImage(executor, assetId);
  if (!before) throw new Error('图片资产不存在');

  const updated = await executor.query(`
    UPDATE dish_assets asset
    SET
      status = 'PENDING',
      is_current = false,
      failure_code = NULL,
      failure_summary = NULL,
      updated_by = $2
    FROM canonical_dishes dish
    WHERE asset.id = $1::uuid
      AND dish.id = asset.canonical_dish_id
    RETURNING
      asset.id::text AS id,
      asset.canonical_dish_id::text AS canonical_dish_id,
      dish.display_name AS dish_name,
      dish.normalized_name AS normalized_name,
      dish.status AS dish_status,
      asset.status,
      asset.provider,
      asset.provider_model,
      asset.storage_key,
      asset.mime_type,
      asset.width,
      asset.height,
      asset.is_current,
      asset.failure_code,
      asset.failure_summary,
      asset.updated_at,
      asset.created_at
  `, [assetId, context.actorId]);
  const after = mapAdminDishImage(updated.rows[0]);
  await insertAdminAuditLog(executor, context, 'dish_image.regenerate_requested', 'dish_asset', assetId, before, after, {
    provider: 'rules',
    generationJobId: null
  });
  return {
    asset: after,
    provider: 'rules',
    generationJobId: null,
    message: '已进入运营待补状态，首版不调用 AI 生图'
  };
};

export const createAdminDishAlias = async (
  executor: ParameterizedQueryExecutor,
  input: { canonicalDishId: string; rawName: string; locale?: string },
  context: AdminOperationContext
): Promise<AdminDishAlias> => {
  assertUuid(input.canonicalDishId, '标准菜品 ID');
  const rawName = input.rawName.trim();
  const normalizedName = normalizeDishName(rawName);
  const locale = (input.locale || 'zh-CN').trim() || 'zh-CN';
  if (!normalizedName) throw new Error('同义词不能为空');

  const dish = await executor.query(`
    SELECT id::text AS id, display_name, status
    FROM canonical_dishes
    WHERE id = $1::uuid
  `, [input.canonicalDishId]);
  if (!dish.rows.length) throw new Error('标准菜品不存在');
  if (String(dish.rows[0].status) === 'MERGED') throw new Error('已合并菜品不能新增同义词');

  const aliasId = randomUUID();
  const result = await executor.query(`
    INSERT INTO dish_aliases (
      id, canonical_dish_id, raw_name, normalized_name, locale, created_by
    ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
    RETURNING
      id::text AS id,
      canonical_dish_id::text AS canonical_dish_id,
      raw_name,
      normalized_name,
      locale,
      created_by,
      created_at
  `, [
    aliasId,
    input.canonicalDishId,
    rawName,
    normalizedName,
    locale,
    context.actorId
  ]);
  const alias = {
    id: String(result.rows[0].id),
    canonicalDishId: String(result.rows[0].canonical_dish_id),
    rawName: String(result.rows[0].raw_name),
    normalizedName: String(result.rows[0].normalized_name),
    locale: String(result.rows[0].locale),
    createdBy: String(result.rows[0].created_by),
    createdAt: new Date(String(result.rows[0].created_at)).toISOString()
  };
  await insertAdminAuditLog(executor, context, 'dish_alias.create', 'dish_alias', alias.id, null, alias, {
    canonicalDishId: input.canonicalDishId,
    dishName: String(dish.rows[0].display_name)
  });
  return alias;
};

export const readDishImage = async (
  executor: ParameterizedQueryExecutor,
  imageId: string,
  storageRoot: string
): Promise<{ content: Buffer; mimeType: string } | null> => {
  if (!UUID_PATTERN.test(imageId)) {
    return null;
  }
  const result = await executor.query(`
    SELECT storage_key, mime_type
    FROM dish_assets
    WHERE id = $1::uuid AND status = 'READY'
  `, [imageId]);
  if (!result.rows.length) return null;

  const root = path.resolve(storageRoot);
  const filePath = path.resolve(root, String(result.rows[0].storage_key));
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error('Invalid image storage key');
  }
  try {
    return {
      content: await fs.readFile(filePath),
      mimeType: String(result.rows[0].mime_type)
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
};
