import {expect, it, vi} from 'vitest';
import {updateCaseSettings, updateDocumentAnalysisPurpose} from '../cases.functions';
import {clearCaseDerivedData} from '../pipeline-reset';
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{
  let validate=(value:unknown)=>value;
  const builder:any={middleware:()=>builder,inputValidator:(fn:any)=>{validate=fn;return builder;},handler:(fn:any)=>(args:any)=>fn({...args,data:validate(args.data)})}; return builder;
}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
vi.mock('../pipeline-reset',()=>({CASE_RESET_FIELDS:{report_at:null},clearCaseDerivedData:vi.fn(async()=>{})}));
const caseId='00000000-0000-4000-8000-000000000001', documentId='00000000-0000-4000-8000-000000000002';
function database(overrides:Record<string, unknown>={}, missingDocument=false, lostClaim=false) {
  const writes:{table:string;patch:any}[]=[]; const filters:{table:string;key:string;value:unknown}[]=[];
  const matter={id:caseId,status:'completed',updated_at:'2026-09-24',execution_id:null,worker_lease_until:null,case_type:'civil',analysis_mode:'strict',case_analysis_mode:'ongoing',matter_metadata:{preserved:42},...overrides};
  const db={from(table:string){let writing=false;const query:any={select:()=>query,eq:(key:string,value:unknown)=>{filters.push({table,key,value});return query;},is:(key:string,value:unknown)=>{filters.push({table,key,value});return query;},
    update:(patch:any)=>{writing=true;writes.push({table,patch});return query;},
    maybeSingle:async()=>({data:table==='profiles'?{approved:true}:writing?(lostClaim?null:{id:caseId}):table==='documents'?(missingDocument?null:{id:documentId,metadata:{pages:53}}):matter,error:null}),
    then:(resolve:any)=>Promise.resolve({error:null}).then(resolve)};return query;}};
  return {writes,filters,context:{supabase:db,userId:'user'}};
}
it.each([{legal_question:'What was decided?'}])('persists substantive metadata and invalidates analysis %j',async patch=>{
  vi.mocked(clearCaseDerivedData).mockClear();const d=database();await (updateCaseSettings as any)({data:{caseId,...patch},context:d.context});
  expect(d.writes[0].patch.matter_metadata).toMatchObject({...patch,preserved:42}); expect(clearCaseDerivedData).toHaveBeenCalledOnce();
});
it('fixture flag alone is persisted without clearing analysis or bypassing verification',async()=>{
  vi.mocked(clearCaseDerivedData).mockClear();const d=database();await (updateCaseSettings as any)({data:{caseId,test_fixture:true},context:d.context});
  expect(d.writes[0].patch.matter_metadata).toMatchObject({test_fixture:true});expect(clearCaseDerivedData).not.toHaveBeenCalled();expect(d.writes[0].patch.report_at).toBeUndefined();
});
it('future-upload default alone does not reinterpret existing documents or invalidate their analysis',async()=>{
  vi.mocked(clearCaseDerivedData).mockClear();const d=database();await (updateCaseSettings as any)({data:{caseId,document_purpose_default:'legal_research'},context:d.context});
  expect(d.writes[0].patch.matter_metadata).toMatchObject({document_purpose_default:'legal_research'});expect(clearCaseDerivedData).not.toHaveBeenCalled();expect(d.writes[0].patch.report_at).toBeUndefined();
});
it('edits only a document in the authorized case, preserves extraction, invalidates and never enqueues',async()=>{
  vi.mocked(clearCaseDerivedData).mockClear();const d=database();await (updateDocumentAnalysisPurpose as any)({data:{caseId,documentId,analysis_purpose:'legal_research',client_connection_note:'old client link'},context:d.context});
  expect(d.filters).toContainEqual({table:'documents',key:'case_id',value:caseId});
  expect(d.writes[0].patch).toMatchObject({report_at:null,cancel_requested:true,queued_at:null});
  expect(d.writes[1]).toEqual({table:'documents',patch:{metadata:{pages:53,analysis_purpose:'legal_research',client_connection_note:null}}});expect(clearCaseDerivedData).toHaveBeenCalledOnce();
});
it.each([{status:'running'},{worker_lease_until:'2999-01-01'}])('does not mutate an active run %j',async overrides=>{
  const d=database(overrides);await expect((updateDocumentAnalysisPurpose as any)({data:{caseId,documentId,analysis_purpose:null,client_connection_note:null},context:d.context})).rejects.toThrow('Stop the active');expect(d.writes).toEqual([]);
});
it('does not reset when the document is outside this case',async()=>{
  const d=database({},true);await expect((updateDocumentAnalysisPurpose as any)({data:{caseId,documentId,analysis_purpose:null,client_connection_note:null},context:d.context})).rejects.toThrow('Document not found');expect(d.writes).toEqual([]);
});
it('does not clear derived data or edit the document after losing the case CAS',async()=>{
  vi.mocked(clearCaseDerivedData).mockClear();const d=database({},false,true);await expect((updateDocumentAnalysisPurpose as any)({data:{caseId,documentId,analysis_purpose:'legal_research',client_connection_note:null},context:d.context})).rejects.toThrow('Case changed');expect(clearCaseDerivedData).not.toHaveBeenCalled();expect(d.writes).toHaveLength(1);
});
it.each([{status:'running'},{worker_lease_until:'2999-01-01'}])('settings refuse active analysis without writes or erasing data %j',async overrides=>{
  vi.mocked(clearCaseDerivedData).mockClear();const d=database(overrides);
  await expect((updateCaseSettings as any)({data:{caseId,legal_question:'Changed objective'},context:d.context})).rejects.toThrow('Stop the active');
  expect(d.writes).toEqual([]);expect(clearCaseDerivedData).not.toHaveBeenCalled();
});
it('settings losing the CAS cannot clear derived data or overwrite newer settings',async()=>{
  vi.mocked(clearCaseDerivedData).mockClear();const d=database({},false,true);
  await expect((updateCaseSettings as any)({data:{caseId,legal_question:'Changed objective'},context:d.context})).rejects.toThrow('Case changed');
  expect(clearCaseDerivedData).not.toHaveBeenCalled();expect(d.writes).toHaveLength(1);
  expect(d.filters).toContainEqual({table:'cases',key:'updated_at',value:'2026-09-24'});
  expect(d.filters).toContainEqual({table:'cases',key:'execution_id',value:null});
});
