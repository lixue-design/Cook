-- Rollback restores the previous request workflow. It intentionally does not
-- recreate data deleted by a completed self-service cancellation.
DROP FUNCTION IF EXISTS cook_account_cancel_mark_retry(uuid, text);
DROP FUNCTION IF EXISTS cook_account_cancel_finalize_deletion(uuid);
DROP FUNCTION IF EXISTS cook_account_cancel_claim_due(integer);
DROP FUNCTION IF EXISTS cook_account_cancel_request_json(account_cancel_requests);
DROP FUNCTION IF EXISTS ai_dish_library_ensure_user(text, text, text, text, boolean);
DROP TABLE IF EXISTS account_cancel_tombstones;
DROP INDEX IF EXISTS account_cancel_requests_due_cleanup_idx;

ALTER TABLE account_cancel_requests
  DROP CONSTRAINT IF EXISTS account_cancel_requests_completed_at_ck,
  DROP CONSTRAINT IF EXISTS account_cancel_requests_cooling_off_schedule_ck,
  DROP CONSTRAINT IF EXISTS account_cancel_requests_status_check;

UPDATE account_cancel_requests
SET status = 'submitted'
WHERE status = 'cooling_off';
UPDATE account_cancel_requests
SET status = 'failed'
WHERE status IN ('processing', 'retrying');

ALTER TABLE account_cancel_requests
  ADD CONSTRAINT account_cancel_requests_status_check
  CHECK (status IN ('submitted', 'reviewing', 'approved', 'processing', 'completed', 'rejected', 'cancelled_by_user', 'failed'));

DROP INDEX IF EXISTS account_cancel_requests_one_active_owner_uq;
CREATE UNIQUE INDEX account_cancel_requests_one_active_owner_uq
  ON account_cancel_requests(owner_id)
  WHERE status IN ('submitted', 'reviewing', 'approved', 'processing');

ALTER TABLE account_cancel_requests
  DROP COLUMN IF EXISTS last_error_at,
  DROP COLUMN IF EXISTS last_error_code,
  DROP COLUMN IF EXISTS retry_after,
  DROP COLUMN IF EXISTS retry_count,
  DROP COLUMN IF EXISTS completed_at,
  DROP COLUMN IF EXISTS deletion_started_at,
  DROP COLUMN IF EXISTS scheduled_delete_at;
