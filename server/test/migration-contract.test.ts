import { promises as fs } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMigrations } from '../src/migrations';
import { EXPECTED_DATABASE_VERSION } from '../src/schema-version';

const directory = path.resolve(__dirname, '../../../database/migrations');
const requiredTables = [
  'recipes', 'canonical_dishes', 'dish_aliases', 'normalization_decisions', 'dish_assets',
  'generation_jobs', 'generation_attempts', 'asset_usage_events', 'outbox_events', 'admin_audit_logs'
];

test('every up migration has a matching rollback and unique version', async () => {
  const migrations = await loadMigrations(directory);
  assert.deepEqual(migrations.map((item) => item.version), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]);
  assert.equal(migrations.at(-1)?.version, EXPECTED_DATABASE_VERSION);
});

test('recipe list migration returns compact cards without recipe bodies', async () => {
  const up = await fs.readFile(path.join(directory, '0028_compact_recipe_list_payload.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0028_compact_recipe_list_payload.down.sql'), 'utf8');
  assert.match(up, /CREATE OR REPLACE FUNCTION ai_dish_library_list_recipes/);
  assert.doesNotMatch(up, /'mainIngredients'/);
  assert.doesNotMatch(up, /'sideIngredients'/);
  assert.doesNotMatch(up, /'seasonings'/);
  assert.doesNotMatch(up, /'steps'/);
  assert.match(down, /CREATE OR REPLACE FUNCTION ai_dish_library_list_recipes/);
  assert.match(down, /'steps'/);
});

test('recipe list pagination migration bounds list reads and adds the owner/category index', async () => {
  const up = await fs.readFile(path.join(directory, '0029_paginate_recipe_list.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0029_paginate_recipe_list.down.sql'), 'utf8');
  assert.match(up, /CREATE INDEX IF NOT EXISTS recipes_owner_category_active_updated_idx/);
  assert.match(up, /CREATE FUNCTION ai_dish_library_list_recipes\(\s*p_owner_id text,\s*p_category_id text,\s*p_offset integer,\s*p_limit integer/s);
  assert.match(up, /OFFSET params\.page_offset/);
  assert.match(up, /LIMIT params\.page_limit/);
  assert.match(up, /least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)/);
  assert.match(down, /DROP FUNCTION IF EXISTS ai_dish_library_list_recipes\(text, text, integer, integer\)/);
  assert.match(down, /DROP INDEX IF EXISTS recipes_owner_category_active_updated_idx/);
});

test('plan clear migration deletes empty plan headers atomically', async () => {
  const up = await fs.readFile(path.join(directory, '0027_atomic_plan_clear.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0027_atomic_plan_clear.down.sql'), 'utf8');
  assert.match(up, /CREATE FUNCTION cook_plan_clear_range/);
  assert.match(up, /DELETE FROM meal_plans/);
  assert.match(up, /p_start_date/);
  assert.match(down, /DROP FUNCTION IF EXISTS cook_plan_clear_range/);
});

test('breakfast inference accepts breakfast dishes but rejects generic ingredients in main-dish context', async () => {
  const up = await fs.readFile(path.join(directory, '0026_conservative_breakfast_inference.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0026_conservative_breakfast_inference.down.sql'), 'utf8');
  assert.match(up, /玉米.*食材名/);
  assert.match(up, /炒\|炖\|烧\|焖\|煲\|烩\|汤/);
  assert.match(up, /UPDATE recipes recipe/);
  assert.match(down, /CREATE OR REPLACE FUNCTION cook_recipe_build_system_tags/);
});

test('breakfast-tag correction excludes ordinary egg dishes and preserves the tag builder rollback', async () => {
  const up = await fs.readFile(path.join(directory, '0025_week_plan_breakfast_and_order.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0025_week_plan_breakfast_and_order.down.sql'), 'utf8');
  assert.match(up, /RENAME TO cook_recipe_build_system_tags_base/);
  assert.match(up, /item->>'value' <> 'breakfast'/);
  assert.match(up, /DISABLE TRIGGER recipes_set_updated_at/);
  assert.match(down, /RENAME TO cook_recipe_build_system_tags/);
});

test('recipe system tags are server-derived, persisted and supplied to weekly generation', async () => {
  const up = await fs.readFile(path.join(directory, '0024_recipe_system_tags.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0024_recipe_system_tags.down.sql'), 'utf8');
  for (const token of [
    'system_tags jsonb NOT NULL', 'cook_recipe_build_system_tags', 'recipes_assign_system_tags',
    "'title_alias'", "'default_rule'", "'tomato'", "'egg'", "'systemTags', recipe.system_tags",
    'UPDATE recipes recipe', 'REVOKE ALL ON FUNCTION cook_plan_generation_candidates'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(down, /DROP TRIGGER IF EXISTS recipes_assign_system_tags/);
  assert.match(down, /DROP COLUMN IF EXISTS system_tags/);
});

test('recipe-detail basket migration retains earlier sources and exposes unmeasured amounts', async () => {
  const up = await fs.readFile(path.join(directory, '0023_basket_recipe_amount_merge.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0023_basket_recipe_amount_merge.down.sql'), 'utf8');
  for (const token of [
    'cook_basket_add_recipe_items', 'normalized_name', '无用量+', 'source_refs = existing.source_refs ||',
    'p_owner_id', 'p_recipe_id', 'REVOKE ALL ON FUNCTION'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(down, /CREATE OR REPLACE FUNCTION cook_basket_add_recipe_items/);
});

test('default profile migration assigns a unique four-character identity and one of six avatars', async () => {
  const up = await fs.readFile(path.join(directory, '0022_default_user_profile.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0022_default_user_profile.down.sql'), 'utf8');
  for (const token of [
    'default_profile_code', 'default_avatar_preset', 'profile_initialized_at',
    'app_users_default_profile_code_uq', 'cook_auth_assign_default_profile',
    "'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'", "'食光旅人 '", 'preset-avatar-',
    'FOR UPDATE', 'pg_advisory_xact_lock', 'REVOKE ALL ON FUNCTION cook_auth_assign_default_profile'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(up, /SET search_path = pg_catalog, public, extensions/);
  assert.match(down, /DROP FUNCTION IF EXISTS cook_auth_assign_default_profile/);
  assert.match(down, /DROP COLUMN IF EXISTS default_profile_code/);
});

test('basket lifecycle migration normalizes names, preserves sources and supports owner-scoped clear actions', async () => {
  const up = await fs.readFile(path.join(directory, '0021_basket_item_lifecycle.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0021_basket_item_lifecycle.down.sql'), 'utf8');
  for (const token of [
    'normalized_name', 'pending_sort_order', 'cook_basket_toggle_item', 'cook_basket_clear_items',
    'cook_basket_create_manual_item', 'p_owner_id', 'source_refs = source_refs ||', 'REVOKE ALL ON FUNCTION'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(down, /DROP FUNCTION IF EXISTS cook_basket_toggle_item/);
  assert.match(down, /DROP COLUMN IF EXISTS normalized_name/);
});

test('latest migration hardens every current security definer RPC search path', async () => {
  const up = await fs.readFile(path.join(directory, '0014_harden_all_rpc_search_paths.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0014_harden_all_rpc_search_paths.down.sql'), 'utf8');
  for (const token of [
    'p.prosecdef',
    "p.proname LIKE 'ai_dish_library_%'",
    "p.proname LIKE 'cook_%'",
    "'pg_catalog'",
    'ALTER FUNCTION'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(up, /'\$user'/);
  assert.match(down, /'\$user'/);

  const migrationFiles = (await fs.readdir(directory))
    .filter((name) => name.endsWith('.up.sql') && name !== '0014_harden_all_rpc_search_paths.up.sql');
  for (const name of migrationFiles) {
    const source = await fs.readFile(path.join(directory, name), 'utf8');
    const functions = [...source.matchAll(/CREATE FUNCTION\s+([a-zA-Z0-9_]+)[\s\S]*?SECURITY DEFINER/g)]
      .map((match) => match[1]);
    for (const functionName of functions) {
      assert.match(functionName, /^(ai_dish_library_|cook_)/, `${name}: ${functionName} is outside hardening prefixes`);
    }
  }
});

test('recipe detail basket migration is owner-scoped, idempotent and survives plan replacement', async () => {
  const up = await fs.readFile(path.join(directory, '0013_basket_recipe_detail.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0013_basket_recipe_detail.down.sql'), 'utf8');
  for (const token of [
    'cook_basket_add_recipe_items',
    'p_owner_id',
    'p_recipe_id',
    "'source', 'recipe_detail'",
    "'manual'",
    'pg_advisory_xact_lock',
    'REVOKE ALL ON FUNCTION'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(down, /DROP FUNCTION IF EXISTS cook_basket_add_recipe_items/);
});

test('cancel request migration creates a traceable owner-scoped pending record', async () => {
  const up = await fs.readFile(path.join(directory, '0012_account_cancel_requests.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0012_account_cancel_requests.down.sql'), 'utf8');
  for (const token of [
    'CREATE TABLE account_cancel_requests',
    'owner_id text NOT NULL REFERENCES app_users',
    'account_cancel_requests_one_active_owner_uq',
    'cook_account_cancel_request_create',
    "status IN ('submitted', 'processing')",
    'REVOKE ALL ON FUNCTION'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(down, /DROP TABLE IF EXISTS account_cancel_requests/);
});

test('account cancel state migration adds state machine and audit trail', async () => {
  const up = await fs.readFile(path.join(directory, '0019_account_cancel_state.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0019_account_cancel_state.down.sql'), 'utf8');
  for (const token of [
    'account_cancel_audit_logs',
    "'reviewing'",
    "'approved'",
    "'cancelled_by_user'",
    "'failed'",
    'cook_account_cancel_request_get',
    'cook_account_cancel_request_cancel',
    'cook_account_cancel_request_transition',
    'request.owner_id = p_owner_id',
    'actor_type text NOT NULL',
    'from_status',
    'to_status',
    'REVOKE ALL ON FUNCTION cook_account_cancel_request_transition',
    'GRANT EXECUTE ON FUNCTION cook_account_cancel_request_get'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(up, /SET search_path = pg_catalog, public, extensions/);
  assert.match(down, /DROP TABLE IF EXISTS account_cancel_audit_logs/);
  assert.match(down, /status = 'cancelled'/);
  assert.match(down, /DROP FUNCTION IF EXISTS cook_account_cancel_request_cancel/);
});

test('self-service cancellation waits seven days, is timer-only and preserves no personal tombstone data', async () => {
  const up = await fs.readFile(path.join(directory, '0031_self_service_account_cancellation.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0031_self_service_account_cancellation.down.sql'), 'utf8');
  for (const token of [
    "interval '7 days'", 'cooling_off', 'cook_account_cancel_claim_due',
    'FOR UPDATE SKIP LOCKED', 'cook_account_cancel_finalize_deletion',
    'cook_account_cancel_mark_retry', 'account_cancel_tombstones',
    'DELETE FROM app_users WHERE id = target.owner_id',
    "p_create boolean", "REVOKE ALL ON FUNCTION cook_account_cancel_claim_due"
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(up, /coverStorageKeys/);
  assert.match(down, /DROP FUNCTION IF EXISTS cook_account_cancel_finalize_deletion/);
  assert.match(down, /DROP TABLE IF EXISTS account_cancel_tombstones/);
});

test('self-service cancellation policy migration makes the new policy version mandatory', async () => {
  const up = await fs.readFile(path.join(directory, '0032_privacy_policy_self_service_cancellation.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0032_privacy_policy_self_service_cancellation.down.sql'), 'utf8');
  assert.match(up, /'2026-11-06'/);
  assert.match(up, /7 天可撤回期/);
  assert.match(up, /自动删除账号、菜谱、计划、菜篮和已上传菜谱封面/);
  assert.match(down, /'2026-11-05'/);
});

test('auth migration stores public profile and agreement consent behind owner-scoped RPCs', async () => {
  const up = await fs.readFile(path.join(directory, '0011_auth_profile.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0011_auth_profile.down.sql'), 'utf8');
  for (const token of [
    'nickname', 'avatar_url', 'status', 'agreed_agreement_version',
    'cook_auth_get_user', 'cook_auth_update_profile',
    'WHERE id = p_user_id', 'REVOKE ALL ON FUNCTION'
  ]) assert.match(up, new RegExp(token));
  assert.match(down, /DROP FUNCTION IF EXISTS cook_auth_update_profile/);
  assert.match(down, /DROP COLUMN IF EXISTS nickname/);
});

test('agreement version migration creates required-version confirmations', async () => {
  const up = await fs.readFile(path.join(directory, '0020_agreement_versions.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0020_agreement_versions.down.sql'), 'utf8');
  for (const token of [
    'CREATE TABLE agreement_versions',
    'agreement_versions_one_required_uq',
    'CREATE TABLE user_agreement_confirmations',
    'cook_agreement_latest',
    'cook_agreement_get',
    'cook_agreement_status',
    'cook_agreement_confirm',
    'requiresAgreementConfirm',
    'requiredAgreementVersion',
    'agreed_agreement_version = required_version',
    'ON CONFLICT (owner_id, agreement_version)',
    'REVOKE ALL ON FUNCTION cook_agreement_confirm',
    'GRANT EXECUTE ON FUNCTION cook_agreement_status'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(up, /SET search_path = pg_catalog, public, extensions/);
  assert.match(down, /DROP TABLE IF EXISTS user_agreement_confirmations/);
  assert.match(down, /DROP TABLE IF EXISTS agreement_versions/);
  assert.match(down, /CREATE OR REPLACE FUNCTION cook_auth_get_user/);
});

test('basket migration creates owner-scoped persistent items and atomic plan replacement', async () => {
  const up = await fs.readFile(path.join(directory, '0010_shopping_baskets.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0010_shopping_baskets.down.sql'), 'utf8');
  for (const token of [
    'CREATE TABLE shopping_baskets',
    'CREATE TABLE shopping_basket_items',
    'shopping_baskets_owner_week_uq',
    'cook_basket_get_week',
    'cook_basket_plan_snapshots',
    'cook_basket_replace_plan_items',
    "source = 'plan'",
    'cook_basket_create_manual_item',
    'cook_basket_update_item',
    'cook_basket_delete_item',
    'cook_basket_check_all',
    'basket.owner_id = p_owner_id'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(down, /DROP TABLE IF EXISTS shopping_basket_items/);
  assert.match(down, /DROP TABLE IF EXISTS shopping_baskets/);
});

test('plan preferences migration stores owner-scoped generation settings with defaults', async () => {
  const up = await fs.readFile(path.join(directory, '0015_plan_preferences.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0015_plan_preferences.down.sql'), 'utf8');
  for (const token of [
    'CREATE TABLE plan_preferences',
    'owner_id text PRIMARY KEY REFERENCES app_users',
    'has_breakfast boolean NOT NULL DEFAULT true',
    'staple_foods jsonb NOT NULL',
    'disliked_ingredients jsonb NOT NULL',
    'servings integer NOT NULL DEFAULT 2',
    'cook_plan_preferences_get',
    'cook_plan_preferences_upsert',
    'p_owner_id',
    'ON CONFLICT (owner_id)',
    'REVOKE ALL ON FUNCTION',
    'GRANT EXECUTE ON FUNCTION cook_plan_preferences_upsert'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(up, /SET search_path = pg_catalog, public, extensions/);
  assert.match(down, /DROP TABLE IF EXISTS plan_preferences/);
  assert.match(down, /DROP FUNCTION IF EXISTS cook_plan_preferences_upsert/);
});

test('recipe generation jobs migration creates owner-scoped rule-provider job state', async () => {
  const up = await fs.readFile(path.join(directory, '0016_recipe_generation_jobs.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0016_recipe_generation_jobs.down.sql'), 'utf8');
  for (const token of [
    'CREATE TABLE recipe_generation_jobs',
    'owner_id text NOT NULL REFERENCES app_users',
    "source_type text NOT NULL CHECK (source_type IN ('link', 'image', 'text'))",
    "provider text NOT NULL CHECK (provider IN ('rules', 'ai'))",
    "status text NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled'))",
    'cook_recipe_generation_job_create',
    'cook_recipe_generation_job_complete',
    'cook_recipe_generation_job_get',
    'cook_recipe_generation_job_cancel',
    'p_owner_id',
    'REVOKE ALL ON FUNCTION',
    'GRANT EXECUTE ON FUNCTION cook_recipe_generation_job_create'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(up, /SET search_path = pg_catalog, public, extensions/);
  assert.match(down, /DROP TABLE IF EXISTS recipe_generation_jobs/);
  assert.match(down, /DROP FUNCTION IF EXISTS cook_recipe_generation_job_create/);
});

test('day clone migration copies owner-scoped plan snapshots with rollback', async () => {
  const up = await fs.readFile(path.join(directory, '0017_plan_day_clone.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0017_plan_day_clone.down.sql'), 'utf8');
  for (const token of [
    'cook_plan_clone_day',
    'p_owner_id text',
    "p_mode NOT IN ('replace', 'merge')",
    'p_source_date = p_target_date',
    'plan.owner_id = p_owner_id',
    'source_item.recipe_snapshot',
    'cook_plan_get_day(p_owner_id, p_target_date)',
    'REVOKE ALL ON FUNCTION cook_plan_clone_day',
    'GRANT EXECUTE ON FUNCTION cook_plan_clone_day'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(up, /SET search_path FROM CURRENT/);
  assert.match(down, /DROP FUNCTION IF EXISTS cook_plan_clone_day/);
});

test('month template migration stores snapshots and applies them to day facts', async () => {
  const up = await fs.readFile(path.join(directory, '0018_month_plan_templates.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0018_month_plan_templates.down.sql'), 'utf8');
  for (const token of [
    'CREATE TABLE month_plan_templates',
    'owner_id text NOT NULL REFERENCES app_users',
    'CREATE TABLE month_plan_template_items',
    'recipe_snapshot jsonb NOT NULL',
    'cook_month_plan_template_create',
    'cook_month_plan_template_list',
    'cook_month_plan_template_apply',
    'cook_month_plan_template_delete',
    'plan.owner_id = p_owner_id',
    'DELETE FROM meal_plans',
    'template_item.recipe_snapshot',
    'REVOKE ALL ON FUNCTION cook_month_plan_template_apply',
    'GRANT EXECUTE ON FUNCTION cook_month_plan_template_create'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(up, /SET search_path = pg_catalog, public, extensions/);
  assert.match(down, /DROP TABLE IF EXISTS month_plan_template_items/);
  assert.match(down, /DROP TABLE IF EXISTS month_plan_templates/);
  assert.match(down, /DROP FUNCTION IF EXISTS cook_month_plan_template_apply/);
});

test('plan move migration preserves snapshots while moving owner-scoped items', async () => {
  const up = await fs.readFile(path.join(directory, '0009_plan_item_move.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0009_plan_item_move.down.sql'), 'utf8');
  assert.match(up, /cook_plan_move_recipe/);
  assert.match(up, /plan\.owner_id = p_owner_id/);
  assert.match(up, /SET meal_plan_id = target_plan_id/);
  assert.doesNotMatch(up, /recipe_snapshot\s*=/);
  assert.match(up, /REVOKE ALL ON FUNCTION cook_plan_move_recipe/);
  assert.match(down, /DROP FUNCTION IF EXISTS cook_plan_move_recipe/);
});

test('week generation migration persists server snapshots atomically with overwrite protection', async () => {
  const up = await fs.readFile(path.join(directory, '0008_week_plan_generation.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0008_week_plan_generation.down.sql'), 'utf8');
  for (const token of [
    'cook_plan_generation_candidates',
    'cook_plan_generate_week',
    'pg_advisory_xact_lock',
    "'conflict', true",
    'selected_recipe.display_name',
    'selected_recipe.main_ingredients',
    'DELETE FROM meal_plans',
    'recipe_snapshot',
    'REVOKE ALL ON FUNCTION cook_plan_generate_week'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(down, /DROP FUNCTION IF EXISTS cook_plan_generate_week/);
});

test('day plan migration creates owner-scoped snapshot tables and RPCs with rollback', async () => {
  const up = await fs.readFile(path.join(directory, '0007_day_plans.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0007_day_plans.down.sql'), 'utf8');
  for (const token of [
    'CREATE TABLE meal_plans',
    'CREATE TABLE meal_plan_recipes',
    'recipe_snapshot jsonb',
    'CONSTRAINT meal_plans_owner_date_meal_uq',
    'cook_plan_get_day',
    'cook_plan_add_recipe',
    'cook_plan_remove_recipe',
    'selected_recipe.display_name',
    'selected_recipe.main_ingredients',
    'plan.owner_id = p_owner_id',
    'REVOKE ALL ON FUNCTION cook_plan_add_recipe'
  ]) assert.match(up, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(down, /DROP TABLE IF EXISTS meal_plan_recipes/);
  assert.match(down, /DROP TABLE IF EXISTS meal_plans/);
  assert.match(down, /DROP FUNCTION IF EXISTS cook_plan_add_recipe/);
});

test('local image migration creates an indexed keyword posting table', async () => {
  const up = await fs.readFile(path.join(directory, '0006_local_dish_image_search.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0006_local_dish_image_search.down.sql'), 'utf8');
  assert.match(up, /CREATE TABLE dish_asset_keywords/);
  assert.match(up, /dish_asset_keywords_inverted_idx/);
  assert.match(up, /normalized_keyword text_pattern_ops/);
  assert.match(down, /DROP TABLE IF EXISTS dish_asset_keywords/);
});

test('phase 2 hardens SECURITY DEFINER routine search paths incrementally', async () => {
  const up = await fs.readFile(path.join(directory, '0004_secure_recipe_rpc_search_path.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0004_secure_recipe_rpc_search_path.down.sql'), 'utf8');
  assert.match(up, /p\.prosecdef/);
  assert.match(up, /'pg_catalog'/);
  assert.doesNotMatch(up, /'\$user'/);
  assert.match(down, /'\$user'/);
});

test('phase 2 restricts transactional RPC execution to the server role', async () => {
  const up = await fs.readFile(path.join(directory, '0005_restrict_recipe_rpc_execution.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0005_restrict_recipe_rpc_execution.down.sql'), 'utf8');
  assert.match(up, /REVOKE ALL ON FUNCTION/);
  assert.match(up, /'anon', 'authenticated'/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION/);
  assert.match(up, /'service_role'/);
  assert.match(down, /GRANT EXECUTE ON FUNCTION/);
});

test('phase 2 API migration adds transactional RPCs and a private PG storage bucket', async () => {
  const up = await fs.readFile(path.join(directory, '0003_recipe_crud_api.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0003_recipe_crud_api.down.sql'), 'utf8');
  for (const token of [
    'ai_dish_library_ensure_user', 'ai_dish_library_list_recipes',
    'ai_dish_library_create_recipe', 'ai_dish_library_update_recipe',
    'ai_dish_library_delete_recipe', 'ai_dish_library_create_category',
    'ai_dish_library_rename_category', 'ai_dish_library_delete_category',
    'ai_dish_library_reorder_categories', "'PROVISIONAL_CREATED'", "'recipe-covers'"
  ]) assert.match(up, new RegExp(token));
  assert.match(up, /UPDATE recipes\s+SET category_id = NULL/);
  assert.match(up, /DELETE FROM recipe_categories WHERE id = p_category_id AND owner_id = p_owner_id/);
  assert.match(up, /REVOKE ALL ON FUNCTION ai_dish_library_create_recipe/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION ai_dish_library_create_recipe/);
  assert.match(down, /DROP FUNCTION ai_dish_library_create_recipe/);
});

test('recipe migration seeds the five current default categories', async () => {
  const up = await fs.readFile(path.join(directory, '0003_recipe_crud_api.up.sql'), 'utf8');
  for (const category of ['爽口凉菜', '家常小炒', '大口吃肉', '一碗鲜汤', '饱腹主食']) {
    assert.match(up, new RegExp(category));
  }
  for (const retiredCategory of ['解腻冷盘', '绿叶清爽', '荤素碰撞', '暖心鲜汤', '饭后鲜果']) {
    assert.doesNotMatch(up, new RegExp(retiredCategory));
  }
});

test('migration creates every stage 1 table and rollback removes it', async () => {
  const up = await fs.readFile(path.join(directory, '0001_ai_dish_library.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0001_ai_dish_library.down.sql'), 'utf8');
  for (const table of requiredTables) {
    assert.match(up, new RegExp(`CREATE TABLE ${table}\\b`));
    assert.match(down, new RegExp(`DROP TABLE IF EXISTS ${table}\\b`));
  }
});

test('migration declares required names, statuses, redirects, modes, jobs and audit timestamps', async () => {
  const up = await fs.readFile(path.join(directory, '0001_ai_dish_library.up.sql'), 'utf8');
  for (const token of [
    'raw_name', 'display_name', 'normalized_name', 'merged_into_id',
    'FOLLOW_LIBRARY', 'PINNED_ASSET', 'CUSTOM',
    'ACTIVE', 'PROVISIONAL', 'MERGED',
    'PENDING', 'READY', 'FAILED', 'RETIRED',
    'RUNNING', 'SUCCEEDED', 'CANCELLED',
    'created_at', 'updated_at', 'created_by', 'updated_by'
  ]) assert.match(up, new RegExp(token));
  assert.match(up, /CREATE UNIQUE INDEX generation_jobs_active_key_uq/);
  assert.match(up, /CREATE UNIQUE INDEX dish_assets_one_current_uq/);
});

test('phase 2 migration adds identity mapping and owned categories with rollback', async () => {
  const up = await fs.readFile(path.join(directory, '0002_recipe_crud_identity.up.sql'), 'utf8');
  const down = await fs.readFile(path.join(directory, '0002_recipe_crud_identity.down.sql'), 'utf8');
  for (const token of ['CREATE TABLE app_users', 'wx_appid', 'wx_openid',
    'CREATE TABLE recipe_categories', 'owner_id', 'recipes_owner_fk']) {
    assert.match(up, new RegExp(token));
  }
  assert.match(down, /DROP TABLE IF EXISTS recipe_categories/);
  assert.match(down, /DROP TABLE IF EXISTS app_users/);
});
