-- 1. Add execution_id to agent_findings
ALTER TABLE public.agent_findings
  ADD COLUMN IF NOT EXISTS execution_id uuid;

-- 2. Create index
CREATE INDEX IF NOT EXISTS idx_agent_findings_case_exec
  ON public.agent_findings(case_id, execution_id);

-- 3. Replace unique constraint to include execution_id
DO $ $
DECLARE
  c_name text;
BEGIN
  SELECT conname INTO c_name
  FROM pg_constraint
  WHERE conrelid = 'public.agent_findings'::regclass AND contype = 'u'
  LIMIT 1;
  
  IF c_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.agent_findings DROP CONSTRAINT ' || quote_ident(c_name);
  END IF;
END $ $;

-- Add new constraint. We use standard UNIQUE so NULL execution_ids are distinct,
-- meaning historical legacy rows won't conflict with each other or with new rows.
ALTER TABLE public.agent_findings
  ADD CONSTRAINT agent_findings_case_exec_agent_key UNIQUE (case_id, execution_id, agent_type);
