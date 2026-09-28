-- =========================================================================
-- FIX 3: TERMINAL ENGINE IDEMPOTENCY
-- Enforce (case_id, execution_id, engine) uniqueness for terminal statuses
-- =========================================================================

-- 1. Identify duplicates:
-- SELECT case_id, execution_id, engine, status, COUNT(*) 
-- FROM pipeline_engine_runs 
-- WHERE status = 'completed' OR status = 'skipped'
-- GROUP BY case_id, execution_id, engine, status 
-- HAVING COUNT(*) > 1;

-- 2. Deterministic Cleanup:
-- Delete all but the MOST RECENT completed/skipped row for each logical engine in an execution.
-- Technical batch engines (like %_batch) might have the same execution_id but distinct batch identities in 'meta'.
-- Wait, the requirement is ONE logical engine result per (case_id, execution_id, engine).
-- If Ways Out Analysis Batch uses engine = 'ways_out_analysis_batch', that is a distinct engine string! 
-- So (case_id, execution_id, engine) uniqueness is safe because 'engine' is different for batches!

WITH ranked_duplicates AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY case_id, execution_id, engine 
           ORDER BY started_at DESC
         ) as rn
  FROM pipeline_engine_runs
  WHERE status IN ('completed', 'completed_negative', 'skipped', 'failed', 'error', 'blocked')
    AND execution_id IS NOT NULL
)
DELETE FROM pipeline_engine_runs
WHERE id IN (
  SELECT id FROM ranked_duplicates WHERE rn > 1
);

-- 3. Uniqueness Strategy:
-- Create a unique index for terminal statuses to prevent future race condition duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pipeline_engine_runs_terminal
ON pipeline_engine_runs (case_id, execution_id, engine)
WHERE status IN ('completed', 'completed_negative', 'skipped', 'failed', 'error', 'blocked') AND execution_id IS NOT NULL;

-- Note: The existing uniq_pipeline_engine_runs_active handles 'queued' and 'running'.
-- With this, every execution is guaranteed exactly ONE terminal outcome per logical engine.
