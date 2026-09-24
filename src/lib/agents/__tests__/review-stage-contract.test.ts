import { it, expect } from 'vitest';
import * as orchestration from '../orchestrator.server';

function ctx(report:any, runs:any[], count=0):any {
  const data:any={cases:[{execution_id:'current',case_analysis_mode:'live_case'}],reports:report?[report]:[],pipeline_engine_runs:runs};
  return {caseId:'case',executionId:'current',db:{from(table:string){
    let rows=data[table]??[];
    const q:any={select(){return q},eq(k:string,v:any){rows=rows.filter((r:any)=>r[k]===undefined||r[k]===v);return q},
      in(k:string,v:any[]){rows=rows.filter((r:any)=>v.includes(r[k]));return q},not(){return q},
      order(){rows=[...rows].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));return q},
      limit(n:number){rows=rows.slice(0,n);return q},maybeSingle(){return Promise.resolve({data:rows[0]??null,error:null})},
      then(resolve:any){return Promise.resolve({data:rows,count,error:null}).then(resolve)}};return q;
  }}};
}
it('a completed agents stage with zero surviving findings is not misreported as incomplete',async()=>{
  const result=await (orchestration as any).__test__agentLegal(ctx(null,[{engine:'agents',execution_id:'current',status:'completed',created_at:'2'}]));
  expect(result.status).toBe('success');
  expect(result.output).toMatchObject({agents_completed:true,agent_findings:0});
});
it('a prior execution cannot satisfy the current agents dependency',async()=>{
  const result=await (orchestration as any).__test__agentLegal(ctx(null,[{engine:'agents',execution_id:'old',status:'completed',created_at:'1'}],2));
  expect(result.status).toBe('failed');
  expect(result.output.agents_completed).toBe(false);
});
it('post-report Writer verification rejects an empty summary even if a row exists',async()=>{
  const result=await (orchestration as any).__test__agentReport(ctx({case_id:'case',executive_summary:'',full_report:{}},[]));
  expect(result.status).toBe('failed');
  expect(result.errors.join(' ')).toMatch(/summary/i);
});
