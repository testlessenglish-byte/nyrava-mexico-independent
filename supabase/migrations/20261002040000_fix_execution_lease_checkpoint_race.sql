-- Prevent an in-flight heartbeat from re-locking a case after the
-- pipeline has checkpointed and handed it back to the queue.
-- Generic execution-level fix: applies to every materia and pipeline path.

CREATE OR REPLACE FUNCTION public.renew_execution_lease(
  p_case_id UUID,
  p_execution_id UUID,
  p_lease_ms INTEGER DEFAULT 180000
)
RETURNS BOOLEAN AS $$
DECLARE
  v_updated INTEGER;
  v_lease_until TIMESTAMPTZ :=
    now() + (
      GREATEST(30000, LEAST(p_lease_ms, 1200000))
      || ' milliseconds'
    )::INTERVAL;
BEGIN
  IF p_case_id IS NULL OR p_execution_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.cases
  SET
    worker_lease_until = v_lease_until,
    updated_at = now()
  WHERE id = p_case_id
    AND execution_id = p_execution_id
    AND status NOT IN (
      'queued',
      'complete',
      'released',
      'failed',
      'cancelled',
      'needs_revision'
    )
    AND worker_lease_until IS NOT NULL
    AND worker_lease_until > now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
