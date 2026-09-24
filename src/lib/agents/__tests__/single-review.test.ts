import {describe,it,expect,vi} from 'vitest';
import {agentReviewChanged} from '../single-review';
vi.mock('../statistics.server',()=>({attachAgentStats:async(_db:unknown,_id:unknown,_def:unknown,result:unknown)=>result,buildAgentStatistics:vi.fn()}));
vi.mock('@/lib/intelligence/evidence-gate.server',()=>({getAnalysisMode:async()=> 'balanced'}));
vi.mock('@/lib/ai/user-scope.server',()=>({withAIUser:async(_id:unknown,fn:()=>unknown)=>fn()}));
import {runSingleAgentReview} from '../orchestrator.server';
function mockDb(fail=false) {
 const writes:any[]=[];const reads:string[]=[];
 const db={from:(table:string)=>{reads.push(table);const q:any={select:()=>q,eq:()=>q,order:()=>q,insert:(row:any)=>{writes.push(row);return q},then:(resolve:any)=>resolve({data:table==='documents'?[{id:'doc',filename:'evidence.pdf'}]:[],error:fail&&table==='agent_logs'?{message:'write refused'}:null})};return q}};
 return {db,writes,reads};
}
describe('single agent reviews',()=>{
 it('runs and saves only the selected intake review',async()=>{const m=mockDb();await runSingleAgentReview({db:m.db as any,userId:'user',caseId:'case',apiKey:'',apiKeys:[]} ,'intake');expect(m.writes).toHaveLength(1);expect(m.writes[0].agent_key).toBe('intake');expect(m.reads).toEqual(['documents','agent_logs']);});
 it('surfaces failed log writes',async()=>{const m=mockDb(true);await expect(runSingleAgentReview({db:m.db as any,userId:'user',caseId:'case',apiKey:'',apiKeys:[]} ,'intake')).rejects.toThrow('write refused');});
 it('rejects unknown agents before reading data',async()=>{const m=mockDb();await expect(runSingleAgentReview({db:m.db as any,userId:'user',caseId:'case',apiKey:'',apiKeys:[]} ,'invalid')).rejects.toThrow('Unknown agent');expect(m.reads).toHaveLength(0)});
 it('does not start other agents when checking the orchestrator',async()=>{const m=mockDb();await runSingleAgentReview({db:m.db as any,userId:'user',caseId:'case',apiKey:'',apiKeys:[]} ,'orchestrator');expect(m.writes).toHaveLength(1);expect(m.writes[0].agent_key).toBe('orchestrator');expect(m.reads.every(t=>t==='agent_logs')).toBe(true)});
 it('does not refresh for timing/statistics changes alone',()=>{expect(agentReviewChanged({status:'success',output:{b:2,a:1,analysis_mode:'balanced',agent_stats:{runtime:1}},errors:null},{status:'success',output:{a:1,b:2,agent_stats:{runtime:5}},errors:[]})).toBe(false)});
 it('refreshes for new evidence or failed checks',()=>{expect(agentReviewChanged({status:'success',output:{count:1}},{status:'success',output:{count:2}})).toBe(true);expect(agentReviewChanged({status:'success'},{status:'failed'})).toBe(true)});
});
