-- Independent project repair. Existing RLS continues to decide which rows and
-- operations a signed-in user may access. Never grant access to internal
-- counters or tables without an applicable policy, and never grant to anon.
BEGIN;
DO $repair$
DECLARE
  target record;
  operation text;
BEGIN
  FOR target IN
    SELECT c.oid, c.relname, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND (c.relname LIKE 'social\_%' ESCAPE '\' OR c.relname='resource_knowledge_records')
      AND c.relname NOT IN ('social_identifier_counters','social_case_number_counters')
  LOOP
    IF NOT target.relrowsecurity THEN
      RAISE EXCEPTION 'Care privilege repair requires RLS: %',target.relname;
    END IF;
    FOREACH operation IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE'] LOOP
      IF EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname='public' AND p.tablename=target.relname
          AND p.cmd IN (operation,'ALL')
          AND (p.roles @> ARRAY['public']::name[] OR p.roles @> ARRAY['authenticated']::name[])
      ) THEN
        EXECUTE format('GRANT %s ON TABLE public.%I TO authenticated',operation,target.relname);
      END IF;
    END LOOP;
  END LOOP;
END $repair$;
COMMIT;
