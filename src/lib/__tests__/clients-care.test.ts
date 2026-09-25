import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => { const b:any = { middleware:()=>b, inputValidator:()=>b, handler:(fn:any)=>fn }; return b; } }));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
const state = vi.hoisted(() => ({ admin: null as any }));
vi.mock('@supabase/supabase-js', () => ({ createClient:()=>state.admin }));
import { deleteClientFn, getClient } from '../clients.functions';
function database(results: any[]) {
 const calls:any[]=[];
 return { calls, from(table:string) { const query:any={};
  for(const method of ['select','eq','order','in','limit','update','delete']) query[method]=(...args:any[])=>{calls.push({table,method,args});return query};
  query.maybeSingle=()=>Promise.resolve(results.shift());
  query.then=(resolve:any,reject:any)=>Promise.resolve(results.shift()).then(resolve,reject);
  return query;
 }};
}
let user:any;
const owner={id:'client',user_id:'owner',created_by:'creator'};
const invokeDelete=()=> (deleteClientFn as any)({data:{clientId:'client'},context:{supabase:user,userId:'owner'}});
beforeEach(()=>{process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';user=database([{data:owner},{data:[{id:'client'}]}]);state.admin=database([{data:[]},{error:null},{error:null}]);});
it('reads case_type from the schema and retains the case name',async()=>{
 user=database([{data:owner},{data:[{id:'case',name:'Case name',case_type:'civil',status:'released'}]},{data:[]}]);
 const result=await (getClient as any)({data:{clientId:'client'},context:{supabase:user,userId:'owner'}});
 expect(user.calls.find((c:any)=>c.table==='cases'&&c.method==='select').args[0]).toContain('case_type');
 expect(user.calls.find((c:any)=>c.table==='cases'&&c.method==='select').args[0]).not.toContain('case_number');
 expect(result.cases[0].name).toBe('Case name');
 expect(result.active_case_count).toBe(0);expect(result.closed_case_count).toBe(1);
});
it('surfaces case lookup errors instead of displaying an empty client',async()=>{
 user=database([{data:owner},{data:null,error:{message:'schema failure'}}]);
 await expect((getClient as any)({data:{clientId:'client'},context:{supabase:user,userId:'owner'}})).rejects.toThrow();
});
it('rejects assigned nonowners before privileged cleanup',async()=>{
 user=database([{data:{...owner,user_id:'other',created_by:'other'}},{data:[{id:'client'}]}]);
 await expect(invokeDelete()).rejects.toThrow(/propietario|creador/);expect(state.admin.calls).toHaveLength(0);
});
it('permits the creator to delete through the authenticated client',async()=>{
 user=database([{data:{...owner,user_id:'other',created_by:'owner'}},{data:[{id:'client'}]}]);
 await expect(invokeDelete()).resolves.toEqual({success:true});
 expect(user.calls.some((c:any)=>c.method==='delete')).toBe(true);
});
it.each(['analyzing','queued',null])('blocks deletion with active/unknown case status %s',async status=>{
 state.admin=database([{data:[{id:'case',status}]}]);await expect(invokeDelete()).rejects.toThrow(/activos/);
 expect(state.admin.calls.some((c:any)=>c.method==='update'||c.method==='delete')).toBe(false);
});
it.each([0,1,2])('stops after cleanup failure at operation %s',async position=>{
 const results=[{data:[]},{error:null},{error:null}];results[position]={error:{message:'failure'}} as any;state.admin=database(results);
 await expect(invokeDelete()).rejects.toThrow();expect(user.calls.some((c:any)=>c.method==='delete')).toBe(false);
});
it.each([{data:[],error:null},{data:null,error:{message:'denied'}}])('does not bypass an RLS refusal or zero-row deletion',async denied=>{
 user=database([{data:owner},denied]);await expect(invokeDelete()).rejects.toThrow();
 expect(state.admin.calls.some((c:any)=>c.table==='clients')).toBe(false);
});
