import { expect, it, vi } from 'vitest';
import { updateCaseSettings } from '../cases.functions';
import { clearCaseDerivedData } from '../pipeline-reset';
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{
  let validate=(value:unknown)=>value;
  const builder:any={middleware:()=>builder,inputValidator:(fn:any)=>{validate=fn;return builder;},handler:(fn:any)=>(args:any)=>fn({...args,data:validate(args.data)})};
  return builder;
}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('../pipeline-reset',()=>({CASE_RESET_FIELDS:{report_at:null},clearCaseDerivedData:vi.fn(async()=>{})}));

it.each([{applicable_law_state:'CMX'},{proceeding_started_on:'2024-12-01'},{civil_family_proceeding:'civil_hipotecario_oral'}])('persists metadata-only edits and invalidates previous analysis: %j',async field=>{
  vi.mocked(clearCaseDerivedData).mockClear();
  const before={status:'completed',updated_at:'2026-09-24',execution_id:null,worker_lease_until:null,case_type:'civil',analysis_mode:'balanced',case_analysis_mode:'ongoing',matter_metadata:{preserved:'value'}};
  const writes:Record<string,unknown>[]=[];
  const db={from(table:string){
    expect(['cases','profiles']).toContain(table);
    const query={select:()=>query,eq:()=>query,is:()=>query,maybeSingle:async()=>({data:table === 'profiles' ? {approved:true} : before,error:null}),
      update:(patch:Record<string,unknown>)=>{writes.push(patch);return query;},then:(resolve:any)=>Promise.resolve({error:null}).then(resolve)};
    return query;
  }};
  await (updateCaseSettings as any)({data:{caseId:'00000000-0000-4000-8000-000000000001',...field},context:{supabase:db,userId:'user'}});
  expect(writes).toHaveLength(1);
  expect(writes[0].matter_metadata).toMatchObject({...field,preserved:'value'});
  expect(writes[0].report_at).toBeNull();
  expect(clearCaseDerivedData).toHaveBeenCalledOnce();
});
