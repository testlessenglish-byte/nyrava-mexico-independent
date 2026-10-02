-- Nyrava Mexico
-- Keep Comprehensive Care / immigration links consistent with permanent
-- Legal Intelligence case deletion.

BEGIN;

ALTER TABLE public.social_immigration_links
  DROP CONSTRAINT IF EXISTS social_immigration_links_immigration_case_id_fkey;

ALTER TABLE public.social_immigration_links
  ADD CONSTRAINT social_immigration_links_immigration_case_id_fkey
  FOREIGN KEY (immigration_case_id)
  REFERENCES public.cases(id)
  ON DELETE CASCADE;

COMMIT;