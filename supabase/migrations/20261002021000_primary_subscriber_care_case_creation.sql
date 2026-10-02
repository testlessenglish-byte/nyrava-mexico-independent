begin;

-- Primary subscribers may create Comprehensive Care cases even when they do
-- not have organization-management authority. Non-managing primary
-- subscribers are always self-assigned; organization managers retain the
-- ability to assign active organization members.

create or replace function public.social_can_create_case(
  p_org uuid,
  p_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select
    public.social_is_org_member(p_org,p_user)
    and (
      public.social_can_manage_org(p_org,p_user)
      or public.social_has_capability(p_org,'case.create',p_user)
      or (
        p_user = auth.uid()
        and public.is_primary_subscriber(p_org)
      )
    );
$$;

revoke all on function public.social_can_create_case(uuid,uuid)
  from public,anon;
grant execute on function public.social_can_create_case(uuid,uuid)
  to authenticated,service_role;

-- RPC used by the application to expose the permission without exposing
-- organization-management authority.
create or replace function public.social_can_create_case_for_current_user(
  p_org uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select public.social_can_create_case(p_org,auth.uid());
$$;

revoke all on function public.social_can_create_case_for_current_user(uuid)
  from public,anon;
grant execute on function public.social_can_create_case_for_current_user(uuid)
  to authenticated,service_role;

-- Replace only the assignment/authorization behavior of the existing
-- create-and-assign RPC while retaining its established workflow.
-- The application server will normalize the assignee to auth.uid() for a
-- primary subscriber who cannot manage the organization.
--
-- Database enforcement prevents a forged client request from assigning a
-- Solo/primary-subscriber case to another user.
create or replace function public.social_validate_case_assignee(
  p_org uuid,
  p_requested_user uuid,
  p_actor uuid default auth.uid()
)
returns uuid
language plpgsql
stable
security definer
set search_path=public,pg_temp
as $$
begin
  if p_actor is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  if not public.social_can_create_case(p_org,p_actor) then
    raise exception 'Case creation denied for this organization'
      using errcode='42501';
  end if;

  -- Organization managers may assign any active member.
  if public.social_can_manage_org(p_org,p_actor) then
    if p_requested_user is null then
      return p_actor;
    end if;

    if not exists (
      select 1
      from public.org_memberships m
      where m.org_id=p_org
        and m.user_id=p_requested_user
        and m.status='active'
        and m.deleted_at is null
    ) then
      raise exception 'The selected team member is not active in this organization';
    end if;

    return p_requested_user;
  end if;

  -- Primary Solo/non-manager subscribers are always self-assigned.
  if public.is_primary_subscriber(p_org) then
    return p_actor;
  end if;

  -- Capability-authorized staff may create only for themselves unless they
  -- also hold organization-management authority.
  if p_requested_user is null or p_requested_user=p_actor then
    return p_actor;
  end if;

  raise exception 'You may only assign a new case to your own account'
    using errcode='42501';
end;
$$;

revoke all on function public.social_validate_case_assignee(uuid,uuid,uuid)
  from public,anon;
grant execute on function public.social_validate_case_assignee(uuid,uuid,uuid)
  to authenticated,service_role;

-- Update the canonical creation RPC so the authorization rule used
-- during the actual insert matches the permission exposed to the application.
create or replace function public.create_and_assign_care_case(
  p_org uuid,
  p_program uuid,
  p_person uuid,
  p_client_name text,
  p_family uuid,
  p_case_type text,
  p_priority text,
  p_assigned_user uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $care_case$
declare
  v_actor uuid:=auth.uid();
  v_case public.social_cases%rowtype;
  v_client_name text;
  v_assignee_name text;
  v_due timestamptz;
  v_person_id uuid:=p_person;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not public.social_is_org_member(p_org,v_actor) then
    raise exception 'Active organization membership required' using errcode='42501';
  end if;
  if not public.social_can_create_case(p_org,v_actor) then
    raise exception 'Case creation denied for this organization' using errcode='42501';
  end if;

  -- Non-managing primary subscribers and capability-authorized creators
  -- may create cases, but cannot forge assignment to another account.
  if not public.social_can_manage_org(p_org,v_actor) then
    p_assigned_user := v_actor;
  end if;
  if not exists(select 1 from public.social_programs
    where id=p_program and org_id=p_org and active) then
    raise exception 'Invalid or inactive Comprehensive Care program';
  end if;
  if v_person_id is null then
    if length(btrim(coalesce(p_client_name,'')))<2 then
      raise exception 'Select an existing client or enter the new client legal name';
    end if;
    insert into public.social_people(
      org_id,person_number,legal_name,aliases,languages,current_location,
      immigration_identifiers,unaccompanied_minor,separated_minor,
      assigned_case_manager,created_by
    ) values(
      p_org,null,btrim(p_client_name),'{}'::text[],'{}'::text[],'{}'::jsonb,
      '{}'::jsonb,false,false,coalesce(p_assigned_user,v_actor),v_actor
    ) returning id into v_person_id;
  elsif not exists(select 1 from public.social_people
    where id=v_person_id and org_id=p_org and deleted_at is null) then
    raise exception 'The selected client is outside this organization';
  end if;
  if p_family is not null and not exists(select 1 from public.social_families
    where id=p_family and org_id=p_org and deleted_at is null) then
    raise exception 'Family is outside this organization';
  end if;
  if p_case_type not in ('individual','minor_child','family') then
    raise exception 'Case type must be individual, minor_child, or family';
  end if;
  if p_priority not in ('standard','urgent','emergency') then
    raise exception 'Priority must be standard, urgent, or emergency';
  end if;
  if p_assigned_user is not null and not exists(
    select 1 from public.org_memberships m
    where m.org_id=p_org and m.user_id=p_assigned_user
      and m.status='active' and m.deleted_at is null
  ) then raise exception 'The selected team member is not active in this organization'; end if;

  select legal_name into v_client_name from public.social_people where id=v_person_id;
  if p_assigned_user is not null then
    select coalesce(p.display_name,p.full_name,p.email,'Team member')
      into v_assignee_name from public.profiles p where p.id=p_assigned_user;
  end if;

  insert into public.social_cases(
    org_id,program_id,person_id,family_id,case_type,assigned_case_manager,
    supervising_manager,status,priority,risk_level,confidentiality_level,
    service_areas,tags,created_by
  ) values(
    p_org,p_program,v_person_id,p_family,p_case_type,p_assigned_user,v_actor,
    'intake',p_priority,'unknown','standard','{}'::text[],'{}'::text[],v_actor
  ) returning * into v_case;

  if p_assigned_user is not null then
    insert into public.social_case_assignments(
      org_id,social_case_id,user_id,assignment_role,assigned_by
    ) values(p_org,v_case.id,p_assigned_user,'primary_case_manager',v_actor)
    on conflict do nothing;
  end if;

  insert into public.social_case_status_history(
    org_id,social_case_id,from_status,to_status,changed_by,reason
  ) values(p_org,v_case.id,null,'intake',v_actor,'Case opened; displayed as New');

  insert into public.social_activity_events(
    org_id,social_case_id,actor_id,event_type,entity_type,entity_id,metadata
  ) values(
    p_org,v_case.id,v_actor,'case_opened_and_assigned','social_case',v_case.id,
    jsonb_build_object(
      'case_type',p_case_type,'priority',p_priority,
      'assigned_user_id',p_assigned_user,'supervising_manager',v_actor
    )
  );

  insert into public.social_alerts(
    org_id,social_case_id,alert_type,severity,title_es,title_en,due_at,
    assigned_to,metadata
  ) values(
    p_org,v_case.id,'new_case_assignment',
    case when p_priority='emergency' then 'critical'
         when p_priority='urgent' then 'high' else 'info' end,
    'Nuevo caso asignado: '||v_client_name,
    'New case assigned: '||v_client_name,
    case when p_priority='emergency' then now()+interval '15 minutes'
         when p_priority='urgent' then now()+interval '4 hours' else null end,
    coalesce(p_assigned_user,v_actor),
    jsonb_build_object('case_id',v_case.id,'case_number',v_case.case_number,
      'priority',p_priority,'assigned_by',v_actor,'requires_acknowledgement',p_priority<>'standard')
  );

  if p_priority in ('urgent','emergency') then
    v_due:=case when p_priority='emergency' then now()+interval '15 minutes'
                else now()+interval '4 hours' end;
    insert into public.social_tasks(
      org_id,social_case_id,title,description,assignee_id,priority,status,
      due_at,reminder_at,supervisor_escalation_at,created_by
    ) values(
      p_org,v_case.id,
      case when p_priority='emergency' then 'Immediate emergency response and acknowledgement'
           else 'Acknowledge urgent case assignment' end,
      'Review the new assignment, document the initial response, and acknowledge it. This system does not replace emergency services.',
      coalesce(p_assigned_user,v_actor),'urgent','todo',v_due,
      case when p_priority='emergency' then now()+interval '5 minutes' else now()+interval '2 hours' end,
      v_due,v_actor
    );
  end if;

  if p_priority='emergency' and p_assigned_user is distinct from v_actor then
    insert into public.social_alerts(
      org_id,social_case_id,alert_type,severity,title_es,title_en,due_at,
      assigned_to,metadata
    ) values(
      p_org,v_case.id,'emergency_case_supervision','critical',
      'Supervisión inmediata requerida: '||v_case.case_number,
      'Immediate supervision required: '||v_case.case_number,
      now()+interval '15 minutes',v_actor,
      jsonb_build_object('case_id',v_case.id,'assigned_user_id',p_assigned_user)
    );
  end if;

  return to_jsonb(v_case)||jsonb_build_object(
    'display_status','new','client_name',v_client_name,
    'assigned_user_name',v_assignee_name
  );
end
$care_case$;

notify pgrst,'reload schema';

commit;