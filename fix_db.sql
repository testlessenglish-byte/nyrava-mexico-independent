-- Fix the split-brain priority constraint
ALTER TABLE public.social_cases DROP CONSTRAINT IF EXISTS social_cases_priority_check;

UPDATE public.social_cases
SET priority = CASE
  WHEN priority IN ('low','normal') THEN 'standard'
  WHEN priority IN ('high','urgent') THEN 'urgent'
  ELSE priority
END
WHERE priority IN ('low','normal','high','urgent');

ALTER TABLE public.social_cases ALTER COLUMN priority SET DEFAULT 'standard';

ALTER TABLE public.social_cases ADD CONSTRAINT social_cases_priority_check
  CHECK(priority IN ('standard','urgent','emergency'));

-- Fix the missing service_role permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
