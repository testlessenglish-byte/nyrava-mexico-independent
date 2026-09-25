-- Bind final approval to the report AND the reviewed findings/source snapshot.
-- The shared table locks prevent inserts, updates and deletes (including
-- phantoms) until commit. Acquire these before case/report row locks in every
-- releasing invocation. Snapshot comparison and publication share a transaction.
drop function if exists public.finalize_report_release(uuid,uuid,uuid,jsonb,jsonb,boolean,jsonb,text,jsonb);
create or replace function public.finalize_report_release(
  p_case_id uuid, p_execution_id uuid, p_report_id uuid,
  p_expected_full_report jsonb, p_full_report jsonb,
  p_released boolean, p_errors jsonb, p_status_message text,
  p_expected_report jsonb default null,
  p_expected_sources jsonb default null
) returns void language plpgsql security invoker set search_path = public as $$
declare
  case_execution uuid;
  saved_case public.cases%rowtype;
  saved_report public.reports%rowtype;
  actual_sources jsonb;
  expected_sources jsonb;
begin
  if p_released is null or
    (p_full_report->'release_gate'->>'ok')::boolean is distinct from p_released or
    (p_full_report->'final_review'->>'released')::boolean is distinct from p_released or
    (p_full_report->>'release_decision' in ('PASS','PASS_WITH_WARNINGS')) is distinct from p_released
  then raise exception 'RELEASE_MIRRORS_DISAGREE'; end if;
  if p_released then
    lock table public.case_findings, public.document_pages, public.documents in share mode;
  end if;
  select * into saved_case from public.cases where id=p_case_id for update;
  case_execution := saved_case.execution_id;
  if not found or case_execution is distinct from p_execution_id then
    raise exception 'RELEASE_EXECUTION_SUPERSEDED';
  end if;
  select * into saved_report from public.reports where id=p_report_id and case_id=p_case_id for update;
  if not found or saved_report.full_report is distinct from p_expected_full_report then
    raise exception 'RELEASE_REPORT_CHANGED';
  end if;
  if p_expected_report is null then
    raise exception 'RELEASE_REPORT_SNAPSHOT_REQUIRED';
  end if;
  if to_jsonb(saved_report) is distinct from p_expected_report then
    raise exception 'RELEASE_REPORT_CHANGED';
  end if;
  if p_released then
    if saved_case.cancel_requested then raise exception 'RELEASE_CANCELLED'; end if;
    if jsonb_typeof(p_expected_sources) is distinct from 'object' or
       jsonb_typeof(p_expected_sources->'findings') is distinct from 'array' or
       jsonb_typeof(p_expected_sources->'pages') is distinct from 'array' or
       jsonb_typeof(p_expected_sources->'documents') is distinct from 'array' or
       jsonb_typeof(p_expected_sources->'case_scope') is distinct from 'object'
    then raise exception 'RELEASE_SOURCE_SNAPSHOT_REQUIRED'; end if;
    expected_sources := jsonb_build_object(
      'findings', coalesce((select jsonb_agg(v order by v::text) from jsonb_array_elements(p_expected_sources->'findings') v), '[]'::jsonb),
      'pages', coalesce((select jsonb_agg(v order by v::text) from jsonb_array_elements(p_expected_sources->'pages') v), '[]'::jsonb),
      'documents', coalesce((select jsonb_agg(v order by v::text) from jsonb_array_elements(p_expected_sources->'documents') v), '[]'::jsonb),
      'case_scope', p_expected_sources->'case_scope'
    );
    actual_sources := jsonb_build_object(
      'findings', coalesce((select jsonb_agg(to_jsonb(f) order by to_jsonb(f)::text) from public.case_findings f where f.case_id=p_case_id), '[]'::jsonb),
      'pages', coalesce((select jsonb_agg(p.row order by p.row::text) from (
        select jsonb_build_object('document_id',document_id,'page',page,'text',text) as row from public.document_pages where case_id=p_case_id
      ) p), '[]'::jsonb),
      'documents', coalesce((select jsonb_agg(to_jsonb(d) order by to_jsonb(d)::text) from public.documents d where d.case_id=p_case_id), '[]'::jsonb),
      'case_scope', jsonb_build_object(
        'matter_metadata',to_jsonb(saved_case)->'matter_metadata',
        'case_type',to_jsonb(saved_case)->'case_type',
        'jurisdiction',to_jsonb(saved_case)->'jurisdiction',
        'procedural_vehicle',to_jsonb(saved_case)->'procedural_vehicle',
        'underlying_materia',to_jsonb(saved_case)->'underlying_materia'
      )
    );
    if actual_sources is distinct from expected_sources then raise exception 'RELEASE_SOURCES_CHANGED'; end if;
  end if;
  if p_released and (
    saved_report.quality_blocked or
    coalesce((p_full_report->'final_report_contract_validation'->>'ok')::boolean,false) is not true or
    coalesce(p_full_report->>'release_decision','BLOCKED') not in ('PASS','PASS_WITH_WARNINGS') or
    coalesce(jsonb_array_length(p_errors),1) <> 0 or
    exists (
      select 1 from jsonb_array_elements(coalesce(p_full_report->'qa_statuses','[]'::jsonb)) q
      where coalesce((q->>'blocking')::boolean,true) and q->>'status' in ('FAIL','BLOCKED')
    )
  ) then raise exception 'BLOCKING_QA_CANNOT_RELEASE'; end if;

  update public.reports set full_report=p_full_report,
    quality_blocked=not p_released, quality_block_reasons=coalesce(p_errors,'[]'::jsonb)
    where id=p_report_id and case_id=p_case_id;
  if not found then raise exception 'RELEASE_REPORT_WRITE_DENIED'; end if;
  update public.cases set
    status=(case when p_released then 'released' else 'needs_revision' end)::public.case_status,
    progress=case when p_released then 100 else 99 end,
    completed_at=case when p_released then now() else null end,
    report_at=case when p_released then now() else null end,
    next_stage=null, worker_lease_until=null, status_message=p_status_message,
    error=case when p_released then null else left(p_errors::text,2000) end
    where id=p_case_id;
  if not found then raise exception 'RELEASE_CASE_WRITE_DENIED'; end if;
end;
$$;
revoke all on function public.finalize_report_release(uuid,uuid,uuid,jsonb,jsonb,boolean,jsonb,text,jsonb,jsonb) from public;
grant execute on function public.finalize_report_release(uuid,uuid,uuid,jsonb,jsonb,boolean,jsonb,text,jsonb,jsonb) to authenticated, service_role;
