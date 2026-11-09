import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import {
  adoptExistingMigration,
  migrateUp,
  renderAdoptExistingMigrationSql,
  rollbackLatest,
  verifyMigrations
} from '../src/migrations';
import { EXPECTED_DATABASE_VERSION } from '../src/schema-version';
import { loadTestDatabaseConfig, quoteIdentifier } from './support/test-database';

const testDatabase = loadTestDatabaseConfig();
const expectedVersions = Array.from({ length: EXPECTED_DATABASE_VERSION }, (_, index) => index + 1);
const controlPool = new Pool({ connectionString: testDatabase.connectionString, max: 1 });
const pool = new Pool({
  connectionString: testDatabase.connectionString,
  max: 4,
  options: `-c search_path=${testDatabase.schemaName},pg_catalog`
});
const sourceMigrations = path.resolve(__dirname, '../../../database/migrations');
let isolatedMigrations: string | undefined;
let publicObjectsBefore: { migration_table: string | null; recipes_table: string | null };

const ids = {
  dishA: '00000000-0000-4000-8000-000000000001',
  dishB: '00000000-0000-4000-8000-000000000002',
  dishC: '00000000-0000-4000-8000-000000000003',
  dishMerged: '00000000-0000-4000-8000-000000000004',
  assetA: '10000000-0000-4000-8000-000000000001',
  assetB: '10000000-0000-4000-8000-000000000002',
  recipe: '20000000-0000-4000-8000-000000000001',
  jobA: '30000000-0000-4000-8000-000000000001',
  jobB: '30000000-0000-4000-8000-000000000002',
  attemptA: '40000000-0000-4000-8000-000000000001',
  attemptB: '40000000-0000-4000-8000-000000000002',
  outboxA: '50000000-0000-4000-8000-000000000001',
  outboxB: '50000000-0000-4000-8000-000000000002'
};

const expectPgError = async (work: Promise<unknown>, code: string): Promise<void> => {
  await assert.rejects(work, (error: unknown) => (
    typeof error === 'object' && error !== null && 'code' in error && error.code === code
  ));
};

before(async () => {
  isolatedMigrations = await fs.mkdtemp(path.join(os.tmpdir(), 'cook-test-migrations-'));
  for (const name of await fs.readdir(sourceMigrations)) {
    if (!name.endsWith('.sql')) continue;
    const sql = await fs.readFile(path.join(sourceMigrations, name), 'utf8');
    // Keep deployed migration files and their checksums intact. Legacy RPCs
    // explicitly pin public, so redirect only that clause in the test copies.
    await fs.writeFile(path.join(isolatedMigrations, name), sql.replace(
      /^SET search_path = pg_catalog, public, extensions$/gm,
      `SET search_path = pg_catalog, ${quoteIdentifier(testDatabase.schemaName)}, extensions`
    ));
  }
  const publicState = await controlPool.query<{
    migration_table: string | null;
    recipes_table: string | null;
  }>(`SELECT
       to_regclass('public.schema_migrations')::text AS migration_table,
       to_regclass('public.recipes')::text AS recipes_table`);
  publicObjectsBefore = publicState.rows[0];
  await controlPool.query(`CREATE SCHEMA ${quoteIdentifier(testDatabase.schemaName)}`);
});

after(async () => {
  try {
    await pool.end();
    await controlPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(testDatabase.schemaName)} CASCADE`);
  } finally {
    await controlPool.end();
    if (isolatedMigrations) await fs.rm(isolatedMigrations, { recursive: true });
  }
});

test('integration run uses a unique non-public schema without changing public objects', async () => {
  const schema = await pool.query<{ current_schema: string }>('SELECT current_schema()');
  assert.equal(schema.rows[0].current_schema, testDatabase.schemaName);
  const publicState = await controlPool.query<{
    migration_table: string | null;
    recipes_table: string | null;
  }>(`SELECT
       to_regclass('public.schema_migrations')::text AS migration_table,
       to_regclass('public.recipes')::text AS recipes_table`);
  assert.deepEqual(publicState.rows[0], publicObjectsBefore);
});

test('rendered CloudBase adoption is atomic and rejects schema drift', async () => {
  const renderedSchema = `${testDatabase.schemaName}_rendered`;
  const renderedPool = new Pool({
    connectionString: testDatabase.connectionString,
    max: 1,
    options: `-c search_path=${renderedSchema},pg_catalog`
  });
  const up = await fs.readFile(path.join(sourceMigrations, '0001_ai_dish_library.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(sourceMigrations, '0001_ai_dish_library.down.sql'), 'utf8');
  try {
    await controlPool.query(`CREATE SCHEMA ${quoteIdentifier(renderedSchema)}`);
    await renderedPool.query(up);
    await renderedPool.query('ALTER TABLE recipes DROP COLUMN raw_name');
    const adoptionSql = await renderAdoptExistingMigrationSql(1, renderedSchema);
    await assert.rejects(renderedPool.query(adoptionSql), /existing schema does not match/);
    assert.equal(
      (await controlPool.query<{ table_name: string | null }>(
        'SELECT to_regclass($1)::text AS table_name', [`${renderedSchema}.schema_migrations`]
      )).rows[0].table_name,
      null
    );
    await renderedPool.query(down);
    await renderedPool.query(up);
    await renderedPool.query(adoptionSql);
    assert.deepEqual(await verifyMigrations(renderedPool), {
      currentVersion: 1, appliedVersions: [1], availableVersions: expectedVersions
    });
  } finally {
    await renderedPool.end();
    await controlPool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(renderedSchema)} CASCADE`);
  }
});

test('adopt rejects drift, then records an exact existing 0001 and migrates through phase 2', async () => {
  const up = await fs.readFile(path.join(sourceMigrations, '0001_ai_dish_library.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(sourceMigrations, '0001_ai_dish_library.down.sql'), 'utf8');
  await pool.query(up);
  await pool.query('ALTER TABLE recipes DROP COLUMN raw_name');
  await assert.rejects(adoptExistingMigration(pool, 1, isolatedMigrations), /existing schema does not match/);
  await pool.query(down);
  await pool.query(up);
  const adopted = await Promise.all([adoptExistingMigration(pool, 1, isolatedMigrations), adoptExistingMigration(pool, 1, isolatedMigrations)]);
  assert.deepEqual(adopted.sort(), [false, true]);
  assert.deepEqual(await verifyMigrations(pool, isolatedMigrations), {
    currentVersion: 1, appliedVersions: [1], availableVersions: expectedVersions
  });
  assert.deepEqual(await migrateUp(pool, isolatedMigrations), expectedVersions.slice(1));
  assert.equal((await verifyMigrations(pool, isolatedMigrations)).currentVersion, EXPECTED_DATABASE_VERSION);
});

test('all requested tables exist', async () => {
  const required = [
    'recipes', 'canonical_dishes', 'dish_aliases', 'normalization_decisions', 'dish_assets',
    'generation_jobs', 'generation_attempts', 'asset_usage_events', 'outbox_events', 'admin_audit_logs',
    'app_users', 'recipe_categories', 'dish_asset_keywords', 'meal_plans', 'meal_plan_recipes',
    'shopping_baskets', 'shopping_basket_items', 'plan_preferences', 'recipe_generation_jobs',
    'month_plan_templates', 'month_plan_template_items', 'account_cancel_requests',
    'account_cancel_audit_logs', 'agreement_versions', 'user_agreement_confirmations',
    'account_cancel_tombstones'
  ];
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [required]
  );
  assert.deepEqual(result.rows.map((row) => row.table_name).sort(), required.sort());
});

test('schema 33 retains the latest recipe tags, cancellation workflow and required policy', async () => {
  const columns = await pool.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND (
        (table_name = 'recipes' AND column_name = 'system_tags')
        OR (table_name = 'account_cancel_requests'
          AND column_name = ANY(ARRAY['scheduled_delete_at', 'retry_count', 'retry_after', 'completed_at']))
      )
    ORDER BY table_name, column_name
  `);
  assert.deepEqual(columns.rows, [
    { table_name: 'account_cancel_requests', column_name: 'completed_at' },
    { table_name: 'account_cancel_requests', column_name: 'retry_after' },
    { table_name: 'account_cancel_requests', column_name: 'retry_count' },
    { table_name: 'account_cancel_requests', column_name: 'scheduled_delete_at' },
    { table_name: 'recipes', column_name: 'system_tags' }
  ]);

  const requiredPolicy = await pool.query<{ version: string }>(
    'SELECT version FROM agreement_versions WHERE required ORDER BY effective_at DESC LIMIT 1'
  );
  assert.equal(requiredPolicy.rows[0]?.version, '2026-11-06');
});

test('canonical dish status, active-name uniqueness and merge redirect constraints work', async () => {
  await pool.query(
    `INSERT INTO canonical_dishes(id, display_name, normalized_name, status)
     VALUES ($1, '红烧肉', '红烧肉', 'ACTIVE'),
            ($2, '家常豆腐', '家常豆腐', 'PROVISIONAL'),
            ($3, '糖醋排骨', '糖醋排骨', 'ACTIVE')`,
    [ids.dishA, ids.dishB, ids.dishC]
  );
  await pool.query(
    `INSERT INTO canonical_dishes(id, display_name, normalized_name, status, merged_into_id)
     VALUES ($1, '旧红烧肉', '旧红烧肉', 'MERGED', $2)`,
    [ids.dishMerged, ids.dishA]
  );
  await expectPgError(
    pool.query(`INSERT INTO canonical_dishes(id, display_name, normalized_name, status)
                VALUES ('00000000-0000-4000-8000-000000000099', '错误合并', '错误合并', 'MERGED')`),
    '23503'
  );
  await expectPgError(
    pool.query(`INSERT INTO canonical_dishes(id, display_name, normalized_name, status)
                VALUES ('00000000-0000-4000-8000-000000000098', '重复红烧肉', '红烧肉', 'ACTIVE')`),
    '23505'
  );
  await expectPgError(
    pool.query(
      `UPDATE canonical_dishes SET status = 'MERGED', merged_into_id = $1 WHERE id = $2`,
      [ids.dishC, ids.dishA]
    ),
    '23514'
  );
});

test('dish alias uniqueness works', async () => {
  await pool.query(
    `INSERT INTO dish_aliases(id, canonical_dish_id, raw_name, normalized_name)
     VALUES ('01000000-0000-4000-8000-000000000001', $1, '红烧肉', '红烧肉')`,
    [ids.dishA]
  );
  await expectPgError(
    pool.query(
      `INSERT INTO dish_aliases(id, canonical_dish_id, raw_name, normalized_name)
       VALUES ('01000000-0000-4000-8000-000000000002', $1, '紅燒肉', '红烧肉')`,
      [ids.dishA]
    ),
    '23505'
  );
});

test('asset readiness and one-current-image constraints work', async () => {
  await pool.query(
    `INSERT INTO dish_assets(
       id, canonical_dish_id, status, storage_key, mime_type, width, height, is_current
     ) VALUES ($1, $2, 'READY', 'library/red-braised-pork.webp', 'image/webp', 1024, 1024, true),
              ($3, $4, 'READY', 'library/tofu.webp', 'image/webp', 1024, 1024, true)`,
    [ids.assetA, ids.dishA, ids.assetB, ids.dishB]
  );
  await expectPgError(
    pool.query(
      `INSERT INTO dish_assets(id, canonical_dish_id, status, is_current)
       VALUES ('10000000-0000-4000-8000-000000000099', $1, 'PENDING', true)`,
      [ids.dishC]
    ),
    '23514'
  );
  await expectPgError(
    pool.query(
      `INSERT INTO dish_assets(id, canonical_dish_id, status, storage_key, mime_type, width, height, is_current)
       VALUES ('10000000-0000-4000-8000-000000000098', $1, 'READY', 'library/duplicate.webp', 'image/webp', 512, 512, true)`,
      [ids.dishA]
    ),
    '23505'
  );
});

test('recipe name fields and cover-mode exclusivity work', async () => {
  await pool.query(
    `INSERT INTO app_users(id, wx_appid, wx_openid) VALUES ('user-1', 'wx-test-app', 'openid-user-1')`
  );
  await pool.query(
    `INSERT INTO recipes(
       id, owner_id, raw_name, display_name, normalized_name, canonical_dish_id,
       cover_mode, created_by, updated_by
     ) VALUES ($1, 'user-1', '秘制红烧肉家庭版', '秘制红烧肉家庭版', '秘制红烧肉家庭版', $2,
       'FOLLOW_LIBRARY', 'user-1', 'user-1')`,
    [ids.recipe, ids.dishA]
  );
  const recipe = await pool.query<{ raw_name: string; display_name: string }>(
    'SELECT raw_name, display_name FROM recipes WHERE id = $1', [ids.recipe]
  );
  assert.equal(recipe.rows[0].raw_name, '秘制红烧肉家庭版');
  await expectPgError(
    pool.query(
      `INSERT INTO recipes(
         id, owner_id, raw_name, display_name, normalized_name, canonical_dish_id,
         cover_mode, created_by, updated_by
       ) VALUES ('20000000-0000-4000-8000-000000000099', 'user-1', '坏封面', '坏封面', '坏封面', $1,
         'CUSTOM', 'user-1', 'user-1')`,
      [ids.dishA]
    ),
    '23514'
  );
  await expectPgError(
    pool.query(
      `INSERT INTO recipes(
         id, owner_id, raw_name, display_name, normalized_name, canonical_dish_id,
         cover_mode, pinned_asset_id, created_by, updated_by
       ) VALUES ('20000000-0000-4000-8000-000000000098', 'user-1', '错菜图', '错菜图', '错菜图', $1,
         'PINNED_ASSET', $2, 'user-1', 'user-1')`,
      [ids.dishA, ids.assetB]
    ),
    '23503'
  );
});

test('normalization confidence and candidate constraints work', async () => {
  await pool.query(
    `INSERT INTO normalization_decisions(
       id, recipe_id, raw_name, normalized_name, decision, selected_canonical_dish_id,
       top_candidate_id, top_confidence, score_margin, rule_version
     ) VALUES ('21000000-0000-4000-8000-000000000001', $1, '秘制红烧肉家庭版',
       '秘制红烧肉家庭版', 'REUSED', $2, $2, 0.98000, 0.30000, 'v1')`,
    [ids.recipe, ids.dishA]
  );
  await expectPgError(
    pool.query(
      `INSERT INTO normalization_decisions(
         id, recipe_id, raw_name, normalized_name, decision, selected_canonical_dish_id,
         top_confidence, rule_version
       ) VALUES ('21000000-0000-4000-8000-000000000099', $1, '坏分数', '坏分数',
         'REUSED', $2, 1.20000, 'v1')`,
      [ids.recipe, ids.dishA]
    ),
    '23514'
  );
});

test('generation job active-key, lease and success-asset constraints work', async () => {
  await pool.query(
    `INSERT INTO generation_jobs(id, canonical_dish_id, job_key, status, prompt_version)
     VALUES ($1, $2, 'dish-a:prompt-v1', 'PENDING', 'v1')`,
    [ids.jobA, ids.dishA]
  );
  await expectPgError(
    pool.query(
      `INSERT INTO generation_jobs(id, canonical_dish_id, job_key, status, prompt_version)
       VALUES ($1, $2, 'dish-a:prompt-v1', 'PENDING', 'v1')`,
      [ids.jobB, ids.dishA]
    ),
    '23505'
  );
  await expectPgError(
    pool.query(
      `INSERT INTO generation_jobs(id, canonical_dish_id, job_key, status, prompt_version)
       VALUES ('30000000-0000-4000-8000-000000000098', $1, 'dish-b:running', 'RUNNING', 'v1')`,
      [ids.dishB]
    ),
    '23514'
  );
  await expectPgError(
    pool.query(
      `INSERT INTO generation_jobs(id, canonical_dish_id, job_key, status, prompt_version)
       VALUES ('30000000-0000-4000-8000-000000000099', $1, 'dish-b:success', 'SUCCEEDED', 'v1')`,
      [ids.dishB]
    ),
    '23514'
  );
});

test('concurrent active jobs with the same key allow exactly one winner', async () => {
  const insert = (id: string) => pool.query(
    `INSERT INTO generation_jobs(id, canonical_dish_id, job_key, status, prompt_version)
     VALUES ($1, $2, 'dish-c:concurrent-prompt-v1', 'PENDING', 'v1')`,
    [id, ids.dishC]
  );
  const results = await Promise.allSettled([
    insert('30000000-0000-4000-8000-000000000011'),
    insert('30000000-0000-4000-8000-000000000012')
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  assert.ok(rejected);
  assert.equal((rejected.reason as { code?: string }).code, '23505');
  const count = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM generation_jobs
     WHERE job_key = 'dish-c:concurrent-prompt-v1'`
  );
  assert.equal(count.rows[0].count, 1);
});

test('generation attempt uniqueness and completion constraints work', async () => {
  await pool.query(
    `INSERT INTO generation_attempts(id, generation_job_id, attempt_number, status)
     VALUES ($1, $2, 1, 'STARTED')`,
    [ids.attemptA, ids.jobA]
  );
  await expectPgError(
    pool.query(
      `INSERT INTO generation_attempts(id, generation_job_id, attempt_number, status)
       VALUES ($1, $2, 1, 'STARTED')`,
      [ids.attemptB, ids.jobA]
    ),
    '23505'
  );
  await expectPgError(
    pool.query(
      `INSERT INTO generation_attempts(id, generation_job_id, attempt_number, status)
       VALUES ('40000000-0000-4000-8000-000000000099', $1, 2, 'FAILED')`,
      [ids.jobA]
    ),
    '23514'
  );
});

test('outbox idempotency and published timestamp constraints work', async () => {
  await pool.query(
    `INSERT INTO outbox_events(id, event_key, aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1, 'recipe-created:1', 'recipe', $2, 'RECIPE_CREATED', '{}'::jsonb)`,
    [ids.outboxA, ids.recipe]
  );
  await expectPgError(
    pool.query(
      `INSERT INTO outbox_events(id, event_key, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, 'recipe-created:1', 'recipe', $2, 'RECIPE_CREATED', '{}'::jsonb)`,
      [ids.outboxB, ids.recipe]
    ),
    '23505'
  );
  await expectPgError(
    pool.query(
      `INSERT INTO outbox_events(id, event_key, aggregate_type, aggregate_id, event_type, payload, status)
       VALUES ('50000000-0000-4000-8000-000000000099', 'bad-published', 'recipe', $1,
         'RECIPE_CREATED', '{}'::jsonb, 'PUBLISHED')`,
      [ids.recipe]
    ),
    '23514'
  );
});

test('audit and asset usage tables accept traceable events', async () => {
  await pool.query(
    `INSERT INTO asset_usage_events(
       id, recipe_id, canonical_dish_id, asset_id, event_type, cover_mode, actor_id
     ) VALUES ('60000000-0000-4000-8000-000000000001', $1, $2, $3,
       'RESOLVED', 'FOLLOW_LIBRARY', 'user-1')`,
    [ids.recipe, ids.dishA, ids.assetA]
  );
  await pool.query(
    `INSERT INTO admin_audit_logs(id, actor_id, action, entity_type, entity_id, reason)
     VALUES ('70000000-0000-4000-8000-000000000001', 'admin-1', 'MERGE_DISH',
       'canonical_dish', $1, 'duplicate')`,
    [ids.dishMerged]
  );
  const counts = await pool.query<{ usage_count: number; audit_count: number }>(
    `SELECT
       (SELECT count(*)::int FROM asset_usage_events) AS usage_count,
       (SELECT count(*)::int FROM admin_audit_logs) AS audit_count`
  );
  assert.deepEqual(counts.rows[0], { usage_count: 1, audit_count: 1 });
});

test('phase 2 RPCs preserve long names, persist across connections and enforce ownership', async () => {
  const rpcRecipeId = '80000000-0000-4000-8000-000000000001';
  const rpcCanonicalId = '81000000-0000-4000-8000-000000000001';
  const rpcDecisionId = '82000000-0000-4000-8000-000000000001';
  const rpcAliasId = '83000000-0000-4000-8000-000000000001';
  await pool.query(
    `SELECT ai_dish_library_ensure_user('rpc-user-a', 'wx-rpc-app', 'wx-rpc-openid-a', NULL),
            ai_dish_library_ensure_user('rpc-user-b', 'wx-rpc-app', 'wx-rpc-openid-b', NULL)`
  );
  const longName = '祖传秘制番茄牛腩家庭宴客加强版';
  const created = await pool.query<{ recipe: { displayName: string; canonicalDishId: string } }>(
    `SELECT ai_dish_library_create_recipe($1, $2, $3, $4, $5, $6::jsonb) AS recipe`,
    ['rpc-user-a', rpcRecipeId, rpcCanonicalId, rpcDecisionId, rpcAliasId, JSON.stringify({
      rawName: longName,
      displayName: longName,
      category: '一碗鲜汤',
      durationMinutes: 95,
      caloriesKcal: 488,
      coverMode: 'FOLLOW_LIBRARY',
      customCoverStorageKey: null,
      mainIngredients: '牛腩500克、番茄4个',
      sideIngredients: '洋葱半个',
      seasonings: '盐、生抽',
      steps: [{ id: 'step-1', text: '慢炖至软烂', imageUrl: '' }]
    })]
  );
  assert.equal(created.rows[0].recipe.displayName, longName);
  assert.equal(created.rows[0].recipe.canonicalDishId, rpcCanonicalId);

  const restartedPool = new Pool({
    connectionString: testDatabase.connectionString,
    max: 1,
    options: `-c search_path=${testDatabase.schemaName},pg_catalog`
  });
  try {
    const persisted = await restartedPool.query<{ recipe: { displayName: string } | null }>(
      `SELECT ai_dish_library_get_recipe('rpc-user-a', $1) AS recipe`, [rpcRecipeId]
    );
    assert.equal(persisted.rows[0].recipe?.displayName, longName);
  } finally {
    await restartedPool.end();
  }

  const forbiddenRead = await pool.query<{ recipe: unknown }>(
    `SELECT ai_dish_library_get_recipe('rpc-user-b', $1) AS recipe`, [rpcRecipeId]
  );
  assert.equal(forbiddenRead.rows[0].recipe, null);
  const forbiddenDelete = await pool.query<{ deleted: boolean }>(
    `SELECT ai_dish_library_delete_recipe('rpc-user-b', $1) AS deleted`, [rpcRecipeId]
  );
  assert.equal(forbiddenDelete.rows[0].deleted, false);

  const decision = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM normalization_decisions
     WHERE recipe_id = $1 AND decision = 'PROVISIONAL_CREATED'`, [rpcRecipeId]
  );
  assert.equal(decision.rows[0].count, 1);
});

test('day plan RPC snapshots survive recipe deletion and enforce owner isolation', async () => {
  const rpcRecipeId = '80000000-0000-4000-8000-000000000001';
  const planRecipeId = '90000000-0000-4000-8000-000000000001';
  const added = await pool.query<{
    item: { id: string; recipeSnapshot: { name: string; originalRecipeId: string; ingredients: unknown[] } };
  }>(
    `SELECT cook_plan_add_recipe(
       'rpc-user-a', '2026-07-31', 'lunch', $1, $2, 0
     ) AS item`,
    [rpcRecipeId, planRecipeId]
  );
  assert.equal(added.rows[0].item.id, planRecipeId);
  assert.equal(added.rows[0].item.recipeSnapshot.originalRecipeId, rpcRecipeId);
  assert.equal(added.rows[0].item.recipeSnapshot.name, '祖传秘制番茄牛腩家庭宴客加强版');
  assert.equal(added.rows[0].item.recipeSnapshot.ingredients.length, 3);

  const repeated = await pool.query(
    `SELECT cook_plan_add_recipe('rpc-user-a', '2026-07-31', 'lunch', $1, gen_random_uuid(), 1) AS item`,
    [rpcRecipeId]
  );
  assert.deepEqual(repeated.rows[0].item, added.rows[0].item);

  const otherUserDay = await pool.query<{ day: Array<{ recipes: unknown[] }> }>(
    `SELECT cook_plan_get_day('rpc-user-b', '2026-07-31') AS day`
  );
  assert.deepEqual(otherUserDay.rows[0].day.flatMap((meal) => meal.recipes), []);
  const otherUserRemove = await pool.query<{ deleted: boolean }>(
    `SELECT cook_plan_remove_recipe('rpc-user-b', '2026-07-31', 'lunch', $1) AS deleted`,
    [planRecipeId]
  );
  assert.equal(otherUserRemove.rows[0].deleted, false);

  await pool.query(`SELECT ai_dish_library_delete_recipe('rpc-user-a', $1)`, [rpcRecipeId]);
  const afterDelete = await pool.query<{
    day: Array<{ id: string; recipes: Array<{ id: string; recipeSnapshot: { name: string } }> }>;
  }>(`SELECT cook_plan_get_day('rpc-user-a', '2026-07-31') AS day`);
  assert.deepEqual(afterDelete.rows[0].day.map((meal) => meal.id), ['breakfast', 'lunch', 'dinner']);
  assert.equal(afterDelete.rows[0].day[1].recipes[0].id, planRecipeId);
  assert.equal(afterDelete.rows[0].day[1].recipes[0].recipeSnapshot.name, '祖传秘制番茄牛腩家庭宴客加强版');

  const ownerRemove = await pool.query<{ deleted: boolean }>(
    `SELECT cook_plan_remove_recipe('rpc-user-a', '2026-07-31', 'lunch', $1) AS deleted`,
    [planRecipeId]
  );
  assert.equal(ownerRemove.rows[0].deleted, true);
});

test('basket RPC replacement preserves manual items and enforces owner isolation', async () => {
  const basketId = 'b0000000-0000-4000-8000-000000000001';
  const manualItemId = 'a0000000-0000-4000-8000-000000000001';
  const planItemId = 'a0000000-0000-4000-8000-000000000002';
  const created = await pool.query<{ item: { id: string; name: string } }>(
    `SELECT cook_basket_create_manual_item(
       'rpc-user-a', '2026-07-27', $1, $2,
       '{"name":"猕猴桃","normalizedName":"猕猴桃"}'::jsonb
     ) AS item`,
    [basketId, manualItemId]
  );
  assert.equal(created.rows[0].item.id, manualItemId);
  assert.equal(created.rows[0].item.name, '猕猴桃');
  const planItems = JSON.stringify([{
    id: planItemId,
    name: '番茄',
    category: '主料',
    amount: '2',
    amountText: '2个',
    unit: '个',
    sourceRefs: [{ planRecipeId: 'p1' }],
    sortOrder: 0
  }]);
  await pool.query(
    `SELECT cook_basket_replace_plan_items('rpc-user-a', '2026-07-27', $1, $2::jsonb)`,
    [basketId, planItems]
  );
  await pool.query(
    `SELECT cook_basket_replace_plan_items('rpc-user-a', '2026-07-27', $1, $2::jsonb)`,
    [basketId, planItems]
  );
  const basket = await pool.query<{
    value: { items: Array<{ source: string; name: string }> };
  }>(`SELECT cook_basket_get_week('rpc-user-a', '2026-07-27') AS value`);
  assert.equal(basket.rows[0].value.items.filter((item) => item.source === 'manual').length, 1);
  assert.equal(basket.rows[0].value.items.filter((item) => item.source === 'plan').length, 1);
  const other = await pool.query<{ value: { items: unknown[] } }>(
    `SELECT cook_basket_get_week('rpc-user-b', '2026-07-27') AS value`
  );
  assert.deepEqual(other.rows[0].value.items, []);
  const forbidden = await pool.query<{ value: unknown }>(
    `SELECT cook_basket_update_item(
       'rpc-user-b', $1, '{"checked":true}'::jsonb
     ) AS value`,
    [manualItemId]
  );
  assert.equal(forbidden.rows[0].value, null);
});

test('concurrent phase 2 recipe creation leaves no orphan rows from the loser', async () => {
  const recipeId = '80000000-0000-4000-8000-000000000002';
  const payload = JSON.stringify({
    rawName: '并发测试菜', displayName: '并发测试菜', category: '家常小炒',
    coverMode: 'FOLLOW_LIBRARY', steps: []
  });
  const create = (suffix: string) => pool.query(
    `SELECT ai_dish_library_create_recipe('rpc-user-a', $1, $2, $3, $4, $5::jsonb)`,
    [
      recipeId,
      `84000000-0000-4000-8000-0000000000${suffix}`,
      `85000000-0000-4000-8000-0000000000${suffix}`,
      `86000000-0000-4000-8000-0000000000${suffix}`,
      payload
    ]
  );
  const results = await Promise.allSettled([create('11'), create('12')]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  const counts = await pool.query<{ recipes: number; canonicals: number; decisions: number }>(
    `SELECT
       (SELECT count(*)::int FROM recipes WHERE id = $1) AS recipes,
       (SELECT count(*)::int FROM canonical_dishes WHERE id IN ($2, $3)) AS canonicals,
       (SELECT count(*)::int FROM normalization_decisions WHERE recipe_id = $1) AS decisions`,
    [recipeId, '84000000-0000-4000-8000-000000000011', '84000000-0000-4000-8000-000000000012']
  );
  assert.deepEqual(counts.rows[0], { recipes: 1, canonicals: 1, decisions: 1 });
});

test('system tags retain their source and confidence for a minimal recipe title', async () => {
  const result = await pool.query<{ tags: {
    mealTypes: Array<{ value: string }>;
    vegetables: Array<{ value: string; source: string; confidence: string }>;
    proteinTypes: Array<{ value: string; source: string; confidence: string }>;
    roles: Array<{ value: string }>;
    timeLevel: { value: string; source: string; confidence: string };
  } }>(`
    SELECT cook_recipe_build_system_tags(
      '西红柿炒鸡蛋', '', '', '', '[]'::jsonb, '家常小炒', 15
    ) AS tags
  `);
  const tags = result.rows[0].tags;
  assert.equal(tags.mealTypes.some((item) => item.value === 'breakfast'), false);
  assert.deepEqual(tags.vegetables, [{ value: 'tomato', source: 'title_alias', confidence: 'high' }]);
  assert.deepEqual(tags.proteinTypes, [{ value: 'egg', source: 'title', confidence: 'high' }]);
  assert.deepEqual(tags.roles.map((item) => item.value).sort(), ['protein_dish', 'vegetable_dish']);
  assert.deepEqual(tags.timeLevel, { value: 'quick', source: 'duration', confidence: 'high' });
});

test('latest migration rollback and reapply preserve recipe, plan and basket records', async () => {
  const readCoreCounts = async () => (await pool.query<{
    recipes: number;
    plans: number;
    planRecipes: number;
    baskets: number;
    basketItems: number;
  }>(`
    SELECT
      (SELECT count(*)::int FROM recipes) AS recipes,
      (SELECT count(*)::int FROM meal_plans) AS plans,
      (SELECT count(*)::int FROM meal_plan_recipes) AS "planRecipes",
      (SELECT count(*)::int FROM shopping_baskets) AS baskets,
      (SELECT count(*)::int FROM shopping_basket_items) AS "basketItems"
  `)).rows[0];

  const before = await readCoreCounts();
  assert.ok(before.recipes > 0);
  assert.ok(before.plans > 0);
  assert.ok(before.baskets > 0);

  assert.equal(await rollbackLatest(pool, isolatedMigrations), EXPECTED_DATABASE_VERSION);
  assert.equal((await verifyMigrations(pool, isolatedMigrations)).currentVersion, EXPECTED_DATABASE_VERSION - 1);
  assert.deepEqual(await readCoreCounts(), before);

  assert.deepEqual(await migrateUp(pool, isolatedMigrations), [EXPECTED_DATABASE_VERSION]);
  assert.equal((await verifyMigrations(pool, isolatedMigrations)).currentVersion, EXPECTED_DATABASE_VERSION);
  assert.deepEqual(await readCoreCounts(), before);
});

test('schema 33 through 0001 rollbacks remove business tables and return version 0', async () => {
  for (let version = EXPECTED_DATABASE_VERSION; version >= 1; version -= 1) {
    assert.equal(await rollbackLatest(pool, isolatedMigrations), version);
    assert.equal((await verifyMigrations(pool, isolatedMigrations)).currentVersion, version - 1);
  }
  assert.deepEqual(await verifyMigrations(pool, isolatedMigrations), {
    currentVersion: 0, appliedVersions: [], availableVersions: expectedVersions
  });
  const result = await pool.query<{ exists: string | null }>("SELECT to_regclass('recipes')::text AS exists");
  assert.equal(result.rows[0].exists, null);
});

test('migration reapplies cleanly after rollback', async () => {
  assert.deepEqual(await migrateUp(pool, isolatedMigrations), expectedVersions);
  assert.equal((await verifyMigrations(pool, isolatedMigrations)).currentVersion, EXPECTED_DATABASE_VERSION);
});

test('completed isolated run leaves public migration and recipe objects unchanged', async () => {
  const publicState = await controlPool.query<{
    migration_table: string | null;
    recipes_table: string | null;
  }>(`SELECT
       to_regclass('public.schema_migrations')::text AS migration_table,
       to_regclass('public.recipes')::text AS recipes_table`);
  assert.deepEqual(publicState.rows[0], publicObjectsBefore);
});
