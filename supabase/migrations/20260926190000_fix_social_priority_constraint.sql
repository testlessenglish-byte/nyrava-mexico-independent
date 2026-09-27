BEGIN;

-- Forward-only migration to ensure the live database aligns with the expected repository schema
-- This will update any legacy priority values and enforce the correct constraint.

ALTER TABLE public.social_cases DROP CONSTRAINT IF EXISTS social_cases_priority_check;

UPDATE public.social_cases
SET priority = CASE
  WHEN priority IN ('low', 'normal') THEN 'standard'
  WHEN priority IN ('high', 'urgent') THEN 'urgent'
  ELSE priority
END
WHERE priority IN ('low', 'normal', 'high', 'urgent');

ALTER TABLE public.social_cases ALTER COLUMN priority SET DEFAULT 'standard';

ALTER TABLE public.social_cases ADD CONSTRAINT social_cases_priority_check
  CHECK(priority IN ('standard', 'urgent', 'emergency'));

-- Also ensure service_role has privileges on social_cases to resolve the permission denied error
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role;

COMMIT;
