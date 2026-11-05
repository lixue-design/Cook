import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  hasExactDishImageMatch,
  searchDishImages,
  type ParameterizedQueryExecutor
} from './dish-image-library';

type TransactionClient = ParameterizedQueryExecutor & { release(): void };
type GenerationDatabase = ParameterizedQueryExecutor & { connect(): Promise<TransactionClient> };

export type ArkImageGenerationConfig = {
  apiKey: string;
  model: string;
  apiUrl: string;
  timeoutMs: number;
  imageStorageRoot: string;
};

type ArkImageData = {
  b64_json?: string;
  url?: string;
  size?: string;
};

type ArkImageResponse = {
  id?: string;
  model?: string;
  data?: ArkImageData[];
  error?: { code?: string; message?: string };
};

type FetchLike = typeof fetch;

const normalize = (value: string): string => value.trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, '');

const stableUuid = (value: string): string => {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  const joined = hex.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
};

const sleep = (milliseconds: number): Promise<void> => (
  new Promise((resolve) => setTimeout(resolve, milliseconds))
);

const promptForDish = (dishName: string): string => [
  `一道正宗的中式菜品“${dishName}”`,
  '真实专业美食摄影，准确呈现菜品和主要食材，家常但精致、自然诱人',
  '暖色中性桌面，简洁的浅色陶瓷盘或碗，45度俯拍，完整菜品居中，方形构图',
  '柔和自然窗光，真实食物纹理',
  '只出现一道成品菜，无人物、无手、无包装、无文字、无标签、无Logo、无水印、无拼图'
].join('，');

const decodeArkImage = async (
  data: ArkImageData,
  fetchImpl: FetchLike,
  signal: AbortSignal
): Promise<{ content: Buffer; mimeType: string; extension: string }> => {
  if (data.b64_json) {
    const content = Buffer.from(data.b64_json, 'base64');
    const isPng = content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    return { content, mimeType: isPng ? 'image/png' : 'image/jpeg', extension: isPng ? 'png' : 'jpg' };
  }
  if (!data.url) throw new Error('Ark response did not include image data');
  const response = await fetchImpl(data.url, { signal });
  if (!response.ok) throw new Error(`Ark image download failed with HTTP ${response.status}`);
  const mimeType = String(response.headers.get('content-type') || 'image/jpeg').split(';')[0];
  return {
    content: Buffer.from(await response.arrayBuffer()),
    mimeType,
    extension: mimeType === 'image/png' ? 'png' : 'jpg'
  };
};

const resolveCanonicalDish = async (
  database: ParameterizedQueryExecutor,
  dishName: string,
  normalizedName: string
): Promise<string> => {
  const existing = await database.query(`
    SELECT dish.id::text
    FROM canonical_dishes dish
    LEFT JOIN dish_aliases alias ON alias.canonical_dish_id = dish.id
    WHERE dish.status <> 'MERGED'
      AND (dish.normalized_name = $1 OR alias.normalized_name = $1)
    ORDER BY CASE WHEN dish.normalized_name = $1 THEN 0 ELSE 1 END, dish.created_at
    LIMIT 1
  `, [normalizedName]);
  if (existing.rows.length) return String(existing.rows[0].id);

  const dishId = stableUuid(`generated-dish:${normalizedName}`);
  await database.query(`
    INSERT INTO canonical_dishes (
      id, display_name, normalized_name, status, created_by, updated_by
    ) VALUES ($1, $2, $3, 'ACTIVE', 'ark-fallback', 'ark-fallback')
    ON CONFLICT DO NOTHING
  `, [dishId, dishName, normalizedName]);
  const resolved = await database.query(`
    SELECT id::text
    FROM canonical_dishes
    WHERE status <> 'MERGED' AND normalized_name = $1
    ORDER BY created_at
    LIMIT 1
  `, [normalizedName]);
  if (!resolved.rows.length) throw new Error('Failed to create canonical dish');
  return String(resolved.rows[0].id);
};

const waitForConcurrentGeneration = async (
  database: ParameterizedQueryExecutor,
  keyword: string,
  jobKey: string,
  timeoutMs: number
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (hasExactDishImageMatch(await searchDishImages(database, keyword, 20))) return;
    const job = await database.query(`
      SELECT status, last_error_summary
      FROM generation_jobs
      WHERE job_key = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [jobKey]);
    if (job.rows[0]?.status === 'FAILED') {
      throw new Error(String(job.rows[0].last_error_summary || 'Concurrent image generation failed'));
    }
    await sleep(750);
  }
  throw new Error('Concurrent image generation timed out');
};

export const createArkDishImageFallback = (
  database: GenerationDatabase,
  config: ArkImageGenerationConfig,
  fetchImpl: FetchLike = fetch
) => async (dishName: string): Promise<void> => {
  const normalizedName = normalize(dishName);
  if (!normalizedName) return;
  if (hasExactDishImageMatch(await searchDishImages(database, normalizedName, 20))) return;

  const canonicalDishId = await resolveCanonicalDish(database, dishName.trim(), normalizedName);
  const jobKey = `dish-image:${createHash('sha256').update(normalizedName).digest('hex')}`;
  const jobId = randomUUID();
  const leaseToken = randomUUID();
  const reserved = await database.query(`
    INSERT INTO generation_jobs (
      id, canonical_dish_id, job_key, status, prompt_version,
      attempt_count, max_attempts, lease_token, lease_expires_at, created_by, updated_by
    ) VALUES (
      $1, $2, $3, 'RUNNING', 'ark-food-photo-v1',
      1, 1, $4, clock_timestamp() + make_interval(secs => $5::double precision),
      'ark-fallback', 'ark-fallback'
    )
    ON CONFLICT DO NOTHING
    RETURNING id::text
  `, [jobId, canonicalDishId, jobKey, leaseToken, Math.ceil(config.timeoutMs / 1000) + 30]);
  if (!reserved.rows.length) {
    await waitForConcurrentGeneration(database, dishName, jobKey, config.timeoutMs);
    return;
  }

  const attemptId = randomUUID();
  const prompt = promptForDish(dishName.trim());
  const requestDigest = createHash('sha256').update(JSON.stringify({
    model: config.model, prompt, size: '2K'
  })).digest('hex');
  await database.query(`
    INSERT INTO generation_attempts (
      id, generation_job_id, attempt_number, status, provider, request_digest
    ) VALUES ($1, $2, 1, 'STARTED', 'DOUBAO_SEEDREAM', $3)
  `, [attemptId, jobId, requestDigest]);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  let savedPath = '';
  try {
    const response = await fetchImpl(config.apiUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: config.model,
        prompt,
        sequential_image_generation: 'disabled',
        size: '2K',
        stream: false,
        response_format: 'url',
        watermark: true
      }),
      signal: controller.signal
    });
    const payload = await response.json() as ArkImageResponse;
    if (!response.ok || payload.error) {
      throw new Error(payload.error?.message || `Ark image generation failed with HTTP ${response.status}`);
    }
    const imageData = payload.data?.[0];
    if (!imageData) throw new Error('Ark image generation returned no image');
    const decoded = await decodeArkImage(imageData, fetchImpl, controller.signal);
    if (!decoded.content.length) throw new Error('Ark image generation returned an empty image');

    const sizeMatch = String(imageData.size || '').match(/^(\d+)x(\d+)$/);
    const width = sizeMatch ? Number(sizeMatch[1]) : 2048;
    const height = sizeMatch ? Number(sizeMatch[2]) : 2048;
    const assetId = stableUuid(`generated-asset:${canonicalDishId}:ark-food-photo-v1`);
    const storageKey = `generated/${assetId}.${decoded.extension}`;
    savedPath = path.resolve(config.imageStorageRoot, storageKey);
    const root = path.resolve(config.imageStorageRoot);
    if (!savedPath.startsWith(`${root}${path.sep}`)) throw new Error('Invalid generated image path');
    await fs.mkdir(path.dirname(savedPath), { recursive: true });
    const temporaryPath = `${savedPath}.${randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, decoded.content);
    await fs.rename(temporaryPath, savedPath);

    const contentDigest = createHash('sha256').update(decoded.content).digest('hex');
    const responseDigest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const aliasId = stableUuid(`generated-alias:${canonicalDishId}:${normalizedName}`);
    const client = await database.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE dish_assets SET is_current = false WHERE canonical_dish_id = $1 AND is_current', [canonicalDishId]);
      await client.query(`
        INSERT INTO dish_aliases (
          id, canonical_dish_id, raw_name, normalized_name, locale, created_by
        ) VALUES ($1, $2, $3, $4, 'zh-CN', 'ark-fallback')
        ON CONFLICT (canonical_dish_id, normalized_name, locale) DO UPDATE
          SET raw_name = EXCLUDED.raw_name
      `, [aliasId, canonicalDishId, dishName.trim(), normalizedName]);
      await client.query(`
        INSERT INTO dish_assets (
          id, canonical_dish_id, status, provider, provider_model, storage_key,
          mime_type, width, height, content_digest, prompt_version, prompt_digest,
          is_current, created_by, updated_by
        ) VALUES (
          $1, $2, 'READY', 'DOUBAO_SEEDREAM', $3, $4,
          $5, $6, $7, $8, 'ark-food-photo-v1', $9,
          true, 'ark-fallback', 'ark-fallback'
        )
        ON CONFLICT (id) DO UPDATE SET
          status = 'READY', provider_model = EXCLUDED.provider_model,
          storage_key = EXCLUDED.storage_key, mime_type = EXCLUDED.mime_type,
          width = EXCLUDED.width, height = EXCLUDED.height,
          content_digest = EXCLUDED.content_digest, is_current = true,
          updated_by = 'ark-fallback'
      `, [
        assetId, canonicalDishId, payload.model || config.model, storageKey,
        decoded.mimeType, width, height, contentDigest,
        createHash('sha256').update(prompt).digest('hex')
      ]);
      await client.query(`
        INSERT INTO dish_asset_keywords (
          dish_asset_id, keyword, normalized_keyword, keyword_type, weight
        ) VALUES ($1, $2, $3, 'DISH_NAME', 100)
        ON CONFLICT (dish_asset_id, normalized_keyword) DO UPDATE
          SET keyword = EXCLUDED.keyword, keyword_type = 'DISH_NAME', weight = 100
      `, [assetId, dishName.trim(), normalizedName]);
      await client.query(`
        UPDATE generation_attempts
        SET status = 'SUCCEEDED', provider_request_id = $2,
            response_digest = $3, finished_at = clock_timestamp()
        WHERE id = $1
      `, [attemptId, payload.id || null, responseDigest]);
      await client.query(`
        UPDATE generation_jobs
        SET status = 'SUCCEEDED', asset_id = $2, lease_token = NULL,
            lease_expires_at = NULL, updated_by = 'ark-fallback'
        WHERE id = $1
      `, [jobId, assetId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if (savedPath) await fs.rm(savedPath, { force: true });
    const summary = error instanceof Error ? error.message.slice(0, 500) : 'Unknown Ark generation error';
    await database.query(`
      UPDATE generation_attempts
      SET status = 'FAILED', error_code = 'ARK_GENERATION_FAILED',
          error_summary = $2, finished_at = clock_timestamp()
      WHERE id = $1 AND status = 'STARTED'
    `, [attemptId, summary]);
    await database.query(`
      UPDATE generation_jobs
      SET status = 'FAILED', lease_token = NULL, lease_expires_at = NULL,
          last_error_code = 'ARK_GENERATION_FAILED', last_error_summary = $2,
          updated_by = 'ark-fallback'
      WHERE id = $1
    `, [jobId, summary]);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const arkDishImageInternals = { normalize, stableUuid, promptForDish };
