import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
const state=vi.hoisted(()=>({db:null as any}));
vi.mock('@/integrations/supabase/client.server',()=>({get supabaseAdmin(){return state.db}}));
vi.mock('@/lib/groq.server',async original=>({...await original<any>(),callGroq:vi.fn(async()=>{throw new Error('Offline fixture: paid AI disabled');})}));

/** The genuine database boundary, isolated from the user's saved case. */
function memoryDb(tables:Record<string,any[]>) {
 let serial=0;
 return {from(table:string){
  const filters:Array<(r:any)=>boolean>=[];let action='read',values:any,order:string|undefined,ascending=true,limit=Infinity,start=0,end=Infinity;
  const run=()=>{
    const all=tables[table]??=[];let rows=all.filter(r=>filters.every(f=>f(r)));
    if(action==='insert'||action==='upsert') {
      rows=(Array.isArray(values)?values:[values]).map(value=>{
        const previous=action==='upsert'?all.find(r=>r.case_id===value.case_id):null;
        if(previous){Object.assign(previous,value);return previous;}
        const row={id:`offline-${++serial}`,created_at:new Date().toISOString(),...value};all.push(row);return row;
      });
    }else if(action==='update')rows.forEach(row=>Object.assign(row,values));
    else if(action==='delete')tables[table]=all.filter(r=>!rows.includes(r));
    if(order)rows.sort((a,b)=>String(a[order!]??'').localeCompare(String(b[order!]??''))*(ascending?1:-1));
    const count=rows.length;return {data:rows.slice(start,Math.min(end+1,limit)),error:null,count};
  };
  const q:any={select(){return q},eq(k:string,v:any){filters.push(r=>r[k]===v);return q},neq(k:string,v:any){filters.push(r=>r[k]!==v);return q},
   is(k:string,v:any){filters.push(r=>v===null?r[k]==null:r[k]===v);return q},in(k:string,v:any[]){filters.push(r=>v.includes(r[k]));return q},
   not(k:string,op:string,v:any){filters.push(r=>op==='like'?!String(r[k]??'').startsWith(String(v).replace('%','')):r[k]!==v);return q},
   like(k:string,v:string){filters.push(r=>String(r[k]??'').startsWith(v.replace('%','')));return q},
   gte(k:string,v:any){filters.push(r=>r[k]>=v);return q},lte(k:string,v:any){filters.push(r=>r[k]<=v);return q},
   or(){return q},order(k:string,o:any={}){order=k;ascending=o.ascending!==false;return q},limit(n:number){limit=n;return q},range(a:number,b:number){start=a;end=b;return q},
   insert(v:any){action='insert';values=v;return q},upsert(v:any){action='upsert';values=v;return q},update(v:any){action='update';values=v;return q},delete(){action='delete';return q},
   maybeSingle(){const r=run();return Promise.resolve({...r,data:r.data[0]??null})},single(){return q.maybeSingle()},then(resolve:any,reject:any){return Promise.resolve().then(run).then(resolve,reject)}};return q;
 },async rpc(name:string,args:any){
   if(name==='finalize_report_release') {
    const row=tables.reports?.find(r=>r.case_id===args.p_case_id);
    if(row)Object.assign(row,{full_report:args.p_full_report??row.full_report,quality_blocked:!args.p_released,quality_block_reasons:args.p_errors??[]});
   }
   return {data:null,error:null};
 }};
}

it.skipIf(!process.env.SHARED_CASE_FIXTURE)('regenerates the captured case through the real Report engine without paid AI',async()=>{
 const tables=JSON.parse(fs.readFileSync(process.env.SHARED_CASE_FIXTURE!,'utf8'));
 state.db=memoryDb(tables);
 const saved=tables.cases[0];
 const originalFindingIds=new Set(tables.case_findings.map((f:any)=>f.id));
 const {PdfBuilder}=await import('../../export');
 const originalSave=PdfBuilder.prototype.save;
 const save=vi.spyOn(PdfBuilder.prototype,'save').mockImplementation(function(this:InstanceType<typeof PdfBuilder>,...args:Parameters<typeof originalSave>){
   const result=originalSave.call(this,...args);
   if(process.env.SHARED_CASE_PDF)fs.writeFileSync(process.env.SHARED_CASE_PDF,Buffer.from(this.doc.output('arraybuffer')));
   return result;
 });
 const {__test__runReportInner}=await import('../../pipeline.server');
 try {
  await __test__runReportInner({db:state.db,caseId:saved.id,userId:saved.user_id,apiKey:'offline',executionId:saved.execution_id,forceFinalize:true,
    sourceIdentityAudit:tables.reports[0].full_report.source_identity_audit});
 }finally {save.mockRestore();fs.writeFileSync(process.env.SHARED_CASE_OUTPUT!,JSON.stringify(tables));}
 expect(tables.reports[0].quality_block_reasons).toEqual([]);
 expect(tables.reports[0].executive_summary.length).toBeGreaterThanOrEqual(80);
 expect(tables.reports[0].scores_suppressed).toBe(true);
 expect(tables.reports[0].risk_score??null).toBeNull();
 // Existing report-writer projections may be retired; no new finding may be
 // invented to make the saved evidence pass.
 expect(tables.case_findings.every((f:any)=>originalFindingIds.has(f.id))).toBe(true);
 expect(tables.reports[0].full_report.final_review.released).toBe(true);
 expect(tables.reports[0].executive_summary).toContain('Devuélvanse los autos');
 expect(tables.reports[0].executive_summary).not.toMatch(/Mandatory|CONTROLLING ISSUE|COURT HOLDING/);
},120000);
