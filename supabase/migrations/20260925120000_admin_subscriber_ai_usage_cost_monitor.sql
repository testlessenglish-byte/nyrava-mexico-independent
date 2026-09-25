-- ============================================================================
-- Admin Subscriber AI Usage & Cost Monitor
--
-- Adds cost tracking columns, performance indexes, and Super/Platform Admin
-- observability access to public.ai_usage.
-- ============================================================================

ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric NULL,
  ADD COLUMN IF NOT EXISTS execution_id text NULL,
  ADD COLUMN IF NOT EXISTS organization_id uuid NULL;

-- Efficient indexes for platform and per-user time-series aggregation
CREATE INDEX IF NOT EXISTS ai_usage_user_created_idx
  ON public.ai_usage (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_created_at_idx
  ON public.ai_usage (created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_case_idx
  ON public.ai_usage (case_id);

CREATE INDEX IF NOT EXISTS ai_usage_provider_model_idx
  ON public.ai_usage (provider_type, model);

-- Grant select to authenticated and ensure admin / super_admin / platform_admin can read all rows
GRANT SELECT, INSERT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;

DROP POLICY IF EXISTS "usage select" ON public.ai_usage;
CREATE POLICY "usage select" ON public.ai_usage FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'platform_admin')
  );

COMMENT ON COLUMN public.ai_usage.estimated_cost_usd IS
  'Historical estimated cost in USD calculated at call time based on provider/model token pricing.';
