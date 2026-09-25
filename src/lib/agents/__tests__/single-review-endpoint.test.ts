import {describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({roles:['admin'],locked:true,queueError:false,writes:[] as any[],calls:[] as string[]}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{const b:any={middleware:()=>b,inputValidator:()=>b,handler:(fn:any)=>fn};return b}}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{reviewOnly:true}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('../orchestrator.server',()=>({runSingleAgentReview:async(_args:any,key:string)=>{state.calls.push(key);return {runId:'run',result:{status:'success',output:{newEvidence:true},errors:[]}}}}));
vi.mock('@/lib/intelligence/decision-reconstruction-extractor.server',()=>({ensureDecisionReconstruction:vi.fn(async()=>null)}));
import {ensureDecisionReconstruction} from '@/lib/intelligence/decision-reconstruction-extractor.server';
import {rerunSingleAgent} from '../multi-agent.functions';
const db={from:(table:string)=>{let values:any;const q:any={select:()=>q,eq:()=>q,is:()=>q,or:()=>q,order:()=>q,limit:()=>q,update:(v:any)=>{values=v;state.writes.push(v);return q},maybeSingle:async()=>({data:table==='agent_logs'?null:state.locked?{id:'case',execution_id:'execution',case_analysis_mode:'concluded_audit'}:null,error:values?.next_stage&&state.queueError?{message:'queue failed'}:null}),then:(resolve:any)=>resolve({data:table==='user_roles'?state.roles.map(role=>({role})):null,error:null})};return q}};
const invoke=(agentKey='intake')=> (rerunSingleAgent as any)({data:{caseId:'case',agentKey},context:{supabase:db,userId:'user'}});
describe('single agent authorization and report handoff',()=>{
 it('rejects non-admin callers before acquiring a lease',async()=>{state.roles=['user'];state.writes=[];await expect(invoke()).rejects.toThrow('Admin access');expect(state.writes).toHaveLength(0)});
 it('does not run on a busy or inaccessible case',async()=>{state.roles=['admin'];state.locked=false;state.calls=[];await expect(invoke()).rejects.toThrow('already running');expect(state.calls).toHaveLength(0)});
 it('queues the report stage after the selected review changes',async()=>{state.locked=true;state.writes=[];state.calls=[];const result=await invoke();expect(state.calls).toEqual(['intake']);expect(result.reportQueued).toBe(true);expect(state.writes.some(v=>v.report_chunk_cache)).toBe(true);expect(state.writes.some(v=>v.next_stage==='report'&&v.status==='queued')).toBe(true)});
 it('allows subscribers to retry an accessible report',async()=>{state.roles=['user'];state.locked=true;state.calls=[];expect((await invoke('report')).reportQueued).toBe(true);expect(state.calls).toEqual(['report']);expect(ensureDecisionReconstruction).toHaveBeenCalledWith({reviewOnly:true},'case','user',undefined,true);state.roles=['admin']});
 it('surfaces queue failure instead of claiming a report update',async()=>{state.queueError=true;await expect(invoke()).rejects.toThrow('queue failed');state.queueError=false});
});
