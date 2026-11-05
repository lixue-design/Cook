'use strict';

const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Client } = require('pg');

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const storageRoot = path.resolve(__dirname, '../../storage/dish-images');
const normalize = (value) => String(value).trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, '');
const stableUuid = (value) => {
  const hex = createHash('sha256').update(value).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  const joined = hex.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
};

const run = async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(storageRoot, 'manifest.json'), 'utf8'));
  const client = new Client({ connectionString: databaseUrl, application_name: 'cook-local-image-seed' });
  await client.connect();
  try {
    await client.query('BEGIN');
    const version = await client.query('SELECT coalesce(max(version), 0)::int AS version FROM schema_migrations');
    if (Number(version.rows[0].version) < 6) throw new Error('Database migration 6 is required');

    for (const item of manifest) {
      const imagePath = path.join(storageRoot, item.file);
      const content = await fs.readFile(imagePath);
      const digest = createHash('sha256').update(content).digest('hex');
      await client.query(`
        INSERT INTO canonical_dishes (
          id, display_name, normalized_name, status, ingredient_signature, created_by, updated_by
        ) VALUES ($1, $2, $3, 'ACTIVE', $4::jsonb, 'local-seed', 'local-seed')
        ON CONFLICT (id) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          normalized_name = EXCLUDED.normalized_name,
          status = 'ACTIVE',
          ingredient_signature = EXCLUDED.ingredient_signature,
          updated_by = 'local-seed'
      `, [item.dishId, item.name, normalize(item.name), JSON.stringify({ keywords: item.keywords })]);

      const aliasNames = [item.name, ...item.aliases];
      for (const aliasName of aliasNames) {
        const normalizedAlias = normalize(aliasName);
        const aliasId = stableUuid(`dish-alias:${item.dishId}:${normalizedAlias}`);
        await client.query(`
          INSERT INTO dish_aliases (
            id, canonical_dish_id, raw_name, normalized_name, locale, created_by
          ) VALUES ($1, $2, $3, $4, 'zh-CN', 'local-seed')
          ON CONFLICT (canonical_dish_id, normalized_name, locale) DO UPDATE
            SET raw_name = EXCLUDED.raw_name
        `, [aliasId, item.dishId, aliasName, normalizedAlias]);
      }

      await client.query(`
        INSERT INTO dish_assets (
          id, canonical_dish_id, status, provider, storage_key, mime_type,
          width, height, content_digest, is_current, created_by, updated_by
        ) VALUES (
          $1, $2, 'READY', 'LOCAL_IMAGEGEN', $3, 'image/webp',
          768, 768, $4, true, 'local-seed', 'local-seed'
        )
        ON CONFLICT (id) DO UPDATE SET
          status = 'READY',
          provider = 'LOCAL_IMAGEGEN',
          storage_key = EXCLUDED.storage_key,
          mime_type = 'image/webp',
          width = 768,
          height = 768,
          content_digest = EXCLUDED.content_digest,
          is_current = true,
          updated_by = 'local-seed'
      `, [item.imageId, item.dishId, item.file, digest]);

      await client.query('DELETE FROM dish_asset_keywords WHERE dish_asset_id = $1', [item.imageId]);
      const keywordRows = [
        { value: item.name, type: 'DISH_NAME', weight: 100 },
        ...item.aliases.map((value) => ({ value, type: 'ALIAS', weight: 90 })),
        ...item.keywords.map((value) => ({ value, type: 'INGREDIENT', weight: 70 }))
      ];
      const uniqueKeywords = new Map();
      for (const keyword of keywordRows) {
        const normalized = normalize(keyword.value);
        const existing = uniqueKeywords.get(normalized);
        if (!existing || existing.weight < keyword.weight) uniqueKeywords.set(normalized, keyword);
      }
      for (const [normalized, keyword] of uniqueKeywords) {
        await client.query(`
          INSERT INTO dish_asset_keywords (
            dish_asset_id, keyword, normalized_keyword, keyword_type, weight
          ) VALUES ($1, $2, $3, $4, $5)
        `, [item.imageId, keyword.value, normalized, keyword.type, keyword.weight]);
      }
    }
    await client.query('COMMIT');
    process.stdout.write(`${JSON.stringify({ seeded: manifest.length, imageIds: manifest.map((item) => item.imageId) }, null, 2)}\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  process.stderr.write(`local image seed failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
  process.exitCode = 1;
});
