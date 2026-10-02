-- Nyrava Mexico
-- Comprehensive Care lifecycle and identifier-trigger repair.

BEGIN;

-- Add soft-delete support while preserving immutable audit history.
ALTER TABLE public.social_cases
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.social_people
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_social_cases_active_records
  ON public.social_cases (org_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_social_people_active_records
  ON public.social_people (org_id, record_status)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.social_cases.deleted_at IS
  'Soft-deletion timestamp. Non-NULL records are excluded from normal operational Comprehensive Care surfaces while immutable audit history remains preserved.';

COMMENT ON COLUMN public.social_people.deleted_at IS
  'Soft-deletion timestamp. Non-NULL records are excluded from normal operational Comprehensive Care surfaces while immutable audit history remains preserved.';


-- Repair shared immutable-identifier trigger.
-- Branch by table BEFORE referencing table-specific columns.
CREATE OR REPLACE FUNCTION public.prevent_social_identifier_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'social_people' THEN
    IF NEW.person_number IS DISTINCT FROM OLD.person_number THEN
      RAISE EXCEPTION 'Social identifier is immutable';
    END IF;

  ELSIF TG_TABLE_NAME = 'social_families' THEN
    IF NEW.family_number IS DISTINCT FROM OLD.family_number THEN
      RAISE EXCEPTION 'Social identifier is immutable';
    END IF;

  ELSIF TG_TABLE_NAME = 'social_referrals' THEN
    IF NEW.referral_number IS DISTINCT FROM OLD.referral_number THEN
      RAISE EXCEPTION 'Social identifier is immutable';
    END IF;

  ELSE
    RAISE EXCEPTION
      'prevent_social_identifier_change attached to unexpected table: %',
      TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;