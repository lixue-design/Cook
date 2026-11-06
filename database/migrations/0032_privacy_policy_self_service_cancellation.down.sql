UPDATE agreement_versions
SET required = false
WHERE version = '2026-11-06';

UPDATE agreement_versions
SET required = true
WHERE version = '2026-11-05';

DELETE FROM agreement_versions
WHERE version = '2026-11-06'
  AND NOT EXISTS (
    SELECT 1 FROM user_agreement_confirmations confirmation
    WHERE confirmation.agreement_version = agreement_versions.version
  );
