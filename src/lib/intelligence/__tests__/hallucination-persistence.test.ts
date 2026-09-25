import {beforeEach,expect,it,vi} from 'vitest';
const calls=vi.hoisted(()=>({provider:vi.fn()}));
vi.mock('../../groq.server',()=>({callGroq:calls.provider,parseJsonLoose:(s:string)=>JSON.parse(s)}));
import {runHallucinationReview} from '../hallucination.server';
const passage='El Tribunal determinó que los artículos no contienen el vicio de inconstitucionalidad alegado.';
beforeEach(()=>{calls.provider.mockReset();});
function database(mode:'normal'|'cas_conflict'|'new_claim'='normal'){
  const findings:any[]=[{id:'f',updated_at:'old',title:'Los artículos son inconstitucionales',source_module:'analyzer',source_document_id:'d',source_page:1,source_quote:'El Tribunal determinó que los artículos',metadata:{}}];
  const pages=[{document_id:'d',page:1,text:passage}];
  const documents=[{id:'d',metadata:{analysis_purpose:'legal_research'}}];
  const summaries:any[]=[];
  const filters:Record<string,unknown>[]=[];
  const db={from:(table:string)=>{
    let patch:any;const predicates:Record<string,unknown>={};filters.push(predicates);
    const data=()=>table==='case_findings'?findings:table==='document_pages'?pages:table==='documents'?documents:[];
    const response=()=>{
      if(patch && table==='case_findings'){
        if(mode==='cas_conflict')return{data:[],error:null};
        Object.assign(findings[0],patch,{updated_at:'new'});
        if(mode==='new_claim' && findings.length===1)findings.push({...findings[0],id:'unexpected'});
        return{data:[{id:'f',updated_at:'new'}],error:null};
      }
      if(patch && table==='cases')summaries.push(patch);
      return{data:structuredClone(data()),error:null};
    };
    const q:any={select:()=>q,eq:(k:string,v:unknown)=>{predicates[k]=v;return q;},order:()=>q,
      range:async(start:number,end:number)=>({data:structuredClone(data().slice(start,end+1)),error:null}),
      maybeSingle:async()=>({data:table==='reports'?null:{case_type:'familiar'},error:null}),
      update:(value:unknown)=>{patch=value;return q;},then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(response()).then(resolve)};
    return q;
  }};
  calls.provider.mockResolvedValue({text:JSON.stringify({reviews:[{id:'f',verdict:'contradicted',reason:'The claim reverses the negation.',supporting_quote:passage}]})});
  return{db,findings,summaries,filters};
}
it('persists semantic contradiction even when the cited quotation exists',async()=>{
  const fixture=database();
  const report=await runHallucinationReview({db:fixture.db as never,caseId:'case',userId:'user'});
  expect(report).toMatchObject({verified:0,unverified:1,authority_exempt:0});
  expect(fixture.findings[0].verification_status).toBe('unverified');
  expect(fixture.findings[0].metadata.semantic_support_review.verdict).toBe('contradicted');
  expect(fixture.filters.some(f=>f.id==='f' && f.updated_at==='old')).toBe(true);
  expect(fixture.summaries).toHaveLength(1);
});
it.each(['cas_conflict','new_claim'] as const)('withholds completed review when %s occurs',async(mode)=>{
  const fixture=database(mode);
  await expect(runHallucinationReview({db:fixture.db as never,caseId:'case'})).rejects.toThrow(/changed during semantic review/);
  expect(fixture.summaries).toHaveLength(0);
});
