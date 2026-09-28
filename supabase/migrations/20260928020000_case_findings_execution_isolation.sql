-- 1. Ensure execution_id exists on case_findings
ALTER TABLE public.case_findings
  ADD COLUMN IF NOT EXISTS execution_id uuid;

-- 2. Index for execution-scoped reads
CREATE INDEX IF NOT EXISTS idx_case_findings_case_exec
  ON public.case_findings(case_id, execution_id);

-- 3. Update project_case_findings to ingest and persist execution_id
CREATE OR REPLACE FUNCTION public.project_case_findings(p_case_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_owner uuid;
  v_written integer;
BEGIN
  -- Obtain the authoritative case owner.
  select user_id into v_owner
    from public.cases
   where id = p_case_id;

  if not found then
    raise exception 'project_case_findings: unknown case %', p_case_id;
  end if;

  with src as (
    select *
      from jsonb_to_recordset(p_rows) as r(
        execution_id       uuid,
        source_module      text,
        category           text,
        title              text,
        description        text,
        severity           text,
        confidence         numeric,
        legal_significance text,
        potential_impact   text,
        affected_party     text,
        evidence_type      text,
        impact_direction   text,
        priority           integer,
        tags               text[],
        supporting_engines text[],
        source_doc_ids     uuid[],
        evidence_refs      jsonb,
        metadata           jsonb
      )
  ), safe_src as (
    select s.*,
           s.metadata #>> '{projected_from,table}' as projected_table,
           s.metadata #>> '{projected_from,row_id}' as projected_row_id
      from src s
     where s.metadata #>> '{projected_from,table}' is not null
       and s.metadata #>> '{projected_from,row_id}' is not null
       -- A projection writer may NEVER impersonate an engine/analyzer source.
       and s.source_module = 'projection:' || (s.metadata #>> '{projected_from,table}')
  ), ins as (
    insert into public.case_findings (
      case_id, user_id, execution_id, source_module, category, title, description,
      severity, confidence, legal_significance, potential_impact,
      affected_party, evidence_type, impact_direction, priority,
      tags, supporting_engines, source_doc_ids, evidence_refs, metadata,
      finding_status
    )
    select
      p_case_id, v_owner, s.execution_id,
      s.source_module, s.category, s.title, s.description,
      coalesce(s.severity, 'medium'), coalesce(s.confidence, 0.5),
      s.legal_significance, s.potential_impact, s.affected_party,
      s.evidence_type, s.impact_direction, s.priority,
      coalesce(s.tags, '{}'::text[]),
      coalesce(s.supporting_engines, '{}'::text[]),
      coalesce(s.source_doc_ids, '{}'::uuid[]),
      coalesce(s.evidence_refs, '[]'::jsonb),
      coalesce(s.metadata, '{}'::jsonb),
      'candidate'
    from safe_src s
    on conflict (case_id, projected_from_table, projected_from_row_id)
      where projected_from_table is not null
    do update set
      title              = excluded.title,
      description        = excluded.description,
      category           = excluded.category,
      severity           = excluded.severity,
      confidence         = excluded.confidence,
      legal_significance = excluded.legal_significance,
      potential_impact   = excluded.potential_impact,
      affected_party     = excluded.affected_party,
      evidence_type      = excluded.evidence_type,
      impact_direction   = excluded.impact_direction,
      priority           = excluded.priority,
      tags               = excluded.tags,
      supporting_engines = excluded.supporting_engines,
      source_doc_ids     = excluded.source_doc_ids,
      evidence_refs      = excluded.evidence_refs,
      metadata           = excluded.metadata,
      updated_at         = now()
    returning 1
  )
  select count(*) into v_written from ins;

  return v_written;
END;
$function$;
