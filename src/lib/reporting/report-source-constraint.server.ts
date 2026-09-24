import { loadCaseSourcePages } from '../intelligence/source-matter-audit.server';
import { resolveMigratorioDisposition } from '../intelligence/migratorio-disposition';

export async function loadReportSourceConstraint(db:any,caseId:string) {
  const {data:c,error:caseError}=await db.from('cases').select('case_type,underlying_materia').eq('id',caseId).maybeSingle();
  if(caseError) throw new Error('SOURCE_CONSTRAINT_CONTEXT_UNAVAILABLE');
  if((c?.underlying_materia ?? c?.case_type)!=='migratorio') return null;
  const {data:docs,error}=await db.from('documents').select('id,filename,extracted_text').eq('case_id',caseId).is('archived_at',null).order('created_at',{ascending:true});
  if(error) throw new Error('SOURCE_CONSTRAINT_DOCUMENTS_UNAVAILABLE');
  const pages=await loadCaseSourcePages(db,caseId);
  const disposition=resolveMigratorioDisposition((docs??[]).map((d:any)=>({...d,pages:pages.filter(p=>p.document_id===d.id)})),[]);
  const currentNumbers=(docs??[]).flatMap((d:any)=>{
    const match=String(d.extracted_text??'').slice(0,2500).replace(/\s+/g,' ').match(/AMPARO\s+(?:DIRECTO\s+)?EN\s+REVISI[ÓO]N\s*(\d+\/\d{4})/i);
    return match?[match[1]]:[];
  });
  return {disposition,pages,currentNumbers,index:(docs??[]).map((d:any,i:number)=>({document_id:d.id,doc_n:i+1})),
    prompt: disposition.status==='verified' ? `CURRENT OPERATIVE ORDER, EXTRACTED FROM PHYSICAL SOURCE PAGES (controlling over summaries):\n${JSON.stringify(disposition.items)}\nAttribute earlier grants to their issuing lower court and cited precedents to their own case. Do not describe a remand as a grant of amparo or a new constitutional merits ruling.` : ''};
}
