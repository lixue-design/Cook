-- Keep the published agreement record for audit and any existing consent rows,
-- but restore the prior required version if this migration must be rolled back.
UPDATE agreement_versions
SET required = false
WHERE version = '2026-11-05';

UPDATE agreement_versions
SET required = true
WHERE version = '2026-07-31';
