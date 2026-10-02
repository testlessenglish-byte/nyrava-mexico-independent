-- Nyrava Mexico: repair case_findings semantic contracts.
--
-- authority_level is an optional numeric rank (0-5).
-- NULL means no verified authority rank has been established.
-- Never invent rank 1 merely to satisfy persistence.
--
-- audit_classification remains the canonical seven-state evidentiary/legal
-- taxonomy. Party attribution and publication lifecycle belong in their
-- dedicated columns/metadata.

BEGIN;

ALTER TABLE public.case_findings
  ALTER COLUMN authority_level DROP DEFAULT,
  ALTER COLUMN authority_level DROP NOT NULL;

ALTER TABLE public.case_findings
  DROP CONSTRAINT IF EXISTS case_findings_authority_level_check;

ALTER TABLE public.case_findings
  ADD CONSTRAINT case_findings_authority_level_check
  CHECK (
    authority_level IS NULL
    OR authority_level BETWEEN 0 AND 5
  );

ALTER TABLE public.case_findings
  DROP CONSTRAINT IF EXISTS case_findings_audit_classification_check;

ALTER TABLE public.case_findings
  ADD CONSTRAINT case_findings_audit_classification_check
  CHECK (
    audit_classification IS NULL
    OR audit_classification IN (
      'VERIFIED_FACT',
      'VERIFIED_COURT_HOLDING',
      'VERIFIED_LEGAL_RULE',
      'SUPPORTED_INFERENCE',
      'POTENTIAL_ISSUE',
      'EVIDENCE_GAP',
      'NOT_FOUND'
    )
  );

COMMENT ON COLUMN public.case_findings.authority_level IS
  'Optional numeric authority rank 0-5. NULL means authority rank has not been verified; no default rank is inferred.';

COMMENT ON COLUMN public.case_findings.audit_classification IS
  'Canonical evidentiary/legal classification only: VERIFIED_FACT|VERIFIED_COURT_HOLDING|VERIFIED_LEGAL_RULE|SUPPORTED_INFERENCE|POTENTIAL_ISSUE|EVIDENCE_GAP|NOT_FOUND. Party attribution and publication lifecycle use separate fields.';

COMMIT;