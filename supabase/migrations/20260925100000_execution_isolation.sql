-- ============================================================================
-- Migration: Priority 2.5 — Execution Isolation & Clean Report State
--
-- 1. Add execution_id to case_findings and derived tables for per-run isolation.
-- 2. Add composite indexes on (case_id, execution_id) for execution-scoped queries.
-- 3. Historical rows remain intact for auditing; new rows must be execution-scoped.
-- ============================================================================

-- 1. case_findings execution isolation
ALTER TABLE public.case_findings
  ADD COLUMN IF NOT EXISTS execution_id uuid;

CREATE INDEX IF NOT EXISTS idx_case_findings_case_exec
  ON public.case_findings(case_id, execution_id);

CREATE INDEX IF NOT EXISTS idx_case_findings_case_exec_active
  ON public.case_findings(case_id, execution_id)
  WHERE superseded_at IS NULL AND (lifecycle_status IS NULL OR lifecycle_status NOT IN ('superseded', 'quarantined', 'rejected'));

-- 2. case_timeline_events execution isolation
ALTER TABLE public.case_timeline_events
  ADD COLUMN IF NOT EXISTS execution_id uuid;

CREATE INDEX IF NOT EXISTS idx_case_timeline_events_case_exec
  ON public.case_timeline_events(case_id, execution_id);

-- 3. agent_findings execution isolation
ALTER TABLE public.agent_findings
  ADD COLUMN IF NOT EXISTS execution_id uuid;

CREATE INDEX IF NOT EXISTS idx_agent_findings_case_exec
  ON public.agent_findings(case_id, execution_id);

-- 4. case_perspectives execution isolation
ALTER TABLE public.case_perspectives
  ADD COLUMN IF NOT EXISTS execution_id uuid;

CREATE INDEX IF NOT EXISTS idx_case_perspectives_case_exec
  ON public.case_perspectives(case_id, execution_id);

-- 5. case_witnesses execution isolation
ALTER TABLE public.case_witnesses
  ADD COLUMN IF NOT EXISTS execution_id uuid;

CREATE INDEX IF NOT EXISTS idx_case_witnesses_case_exec
  ON public.case_witnesses(case_id, execution_id);

-- 6. case_work_product execution isolation
ALTER TABLE public.case_work_product
  ADD COLUMN IF NOT EXISTS execution_id uuid;

CREATE INDEX IF NOT EXISTS idx_case_work_product_case_exec
  ON public.case_work_product(case_id, execution_id);

-- 7. case_scores execution isolation
ALTER TABLE public.case_scores
  ADD COLUMN IF NOT EXISTS execution_id uuid;

CREATE INDEX IF NOT EXISTS idx_case_scores_case_exec
  ON public.case_scores(case_id, execution_id);

-- 8. analyses execution isolation
ALTER TABLE public.analyses
  ADD COLUMN IF NOT EXISTS execution_id uuid;

CREATE INDEX IF NOT EXISTS idx_analyses_case_exec
  ON public.analyses(case_id, execution_id);
