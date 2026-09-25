-- Restore the missing institution-directory rules, including demo isolation.
-- Use the stable org-first wrappers to avoid legacy helper argument reversal.
BEGIN;
ALTER TABLE public.social_institutions ENABLE ROW LEVEL SECURITY;
CREATE POLICY social_institutions_read ON public.social_institutions
  FOR SELECT TO authenticated
  USING (public.social_sales_demo_owner_allows('social_institutions',id,auth.uid())
    AND (org_id IS NULL OR public.social_is_org_member(org_id,auth.uid())));
CREATE POLICY social_institutions_manage ON public.social_institutions
  FOR ALL TO authenticated
  USING (public.social_sales_demo_owner_allows('social_institutions',id,auth.uid())
    AND org_id IS NOT NULL AND public.social_can_manage_org(org_id,auth.uid()))
  WITH CHECK (public.social_sales_demo_owner_allows('social_institutions',id,auth.uid())
    AND org_id IS NOT NULL AND public.social_can_manage_org(org_id,auth.uid()));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.social_institutions TO authenticated;
COMMIT;
