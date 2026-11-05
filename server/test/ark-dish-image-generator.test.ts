import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  arkDishImageInternals,
  createArkDishImageFallback,
  type ArkImageGenerationConfig
} from '../src/ark-dish-image-generator';
import type { ParameterizedQueryExecutor } from '../src/dish-image-library';

type FakeDatabase = ParameterizedQueryExecutor & {
  connect(): Promise<ParameterizedQueryExecutor & { release(): void }>;
};

test('Ark fallback persists once and reuses the generated image on the next request', async () => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-ark-image-'));
  let canonicalCreated = false;
  let imageReady = false;
  let arkCalls = 0;
  const queries: string[] = [];
  const dishId = arkDishImageInternals.stableUuid('generated-dish:青椒炒蛋');
  const imageRow = {
    image_id: arkDishImageInternals.stableUuid(`generated-asset:${dishId}:ark-food-photo-v1`),
    dish_id: dishId,
    dish_name: '青椒炒蛋',
    storage_key: '',
    mime_type: 'image/png',
    width: 1,
    height: 1,
    matched_keyword: '青椒炒蛋',
    score: 1100,
    is_exact_match: true
  };

  const query = async (sql: string): Promise<{ rows: Array<Record<string, unknown>> }> => {
    queries.push(sql);
    if (sql.includes('WITH keyword_matches')) return { rows: imageReady ? [imageRow] : [] };
    if (sql.includes('LEFT JOIN dish_aliases')) return { rows: canonicalCreated ? [{ id: dishId }] : [] };
    if (sql.includes('INSERT INTO canonical_dishes')) {
      canonicalCreated = true;
      return { rows: [] };
    }
    if (sql.includes('SELECT id::text') && sql.includes('FROM canonical_dishes')) return { rows: [{ id: dishId }] };
    if (sql.includes('INSERT INTO generation_jobs')) return { rows: [{ id: 'job-1' }] };
    if (sql.includes('INSERT INTO dish_asset_keywords')) imageReady = true;
    return { rows: [] };
  };
  const client = { query, release() {} };
  const database: FakeDatabase = { query, async connect() { return client; } };
  const config: ArkImageGenerationConfig = {
    apiKey: 'test-key',
    model: 'ep-test',
    apiUrl: 'https://ark.example/images/generations',
    timeoutMs: 5000,
    imageStorageRoot: storageRoot
  };
  const fetchMock = async () => {
    arkCalls += 1;
    return new Response(JSON.stringify({
      id: 'ark-request-1',
      model: 'ep-test',
      data: [{ b64_json: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64'), size: '1x1' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const fallback = createArkDishImageFallback(database, config, fetchMock);
    await fallback('青椒炒蛋');
    await fallback('青椒炒蛋');
    assert.equal(arkCalls, 1);
    assert.equal(imageReady, true);
    const generatedFiles = await fs.readdir(path.join(storageRoot, 'generated'));
    assert.equal(generatedFiles.length, 1);
    assert.match(generatedFiles[0], /\.png$/);
    assert.ok(queries.some((sql) => sql.includes("status = 'SUCCEEDED'")));
  } finally {
    await fs.rm(storageRoot, { recursive: true, force: true });
  }
});

test('Ark prompt keeps the requested dish and food-photo safety constraints', () => {
  const prompt = arkDishImageInternals.promptForDish('青椒炒蛋');
  assert.match(prompt, /青椒炒蛋/);
  assert.match(prompt, /只出现一道成品菜/);
  assert.match(prompt, /无文字/);
  assert.match(prompt, /无水印/);
});
