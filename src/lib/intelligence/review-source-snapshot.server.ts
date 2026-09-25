import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { resolveDocumentAnalysisScope } from './document-analysis-purpose';
import type { SupportPage } from './claim-support-review';

/** PostgREST row caps must not silently limit a safety review. */
export async function readAllCaseRows(db: SupabaseClient<Database>,table:'documents'|'document_pages'|'case_findings',caseId:string,columns='*'):Promise<any[]> {
  const rows:any[]=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await db.from(table).select(columns).eq('case_id',caseId).order('id').range(offset,offset+499);
    if(error)throw new Error(`Review source ${table} unavailable: ${error.message}`);
    rows.push(...(data ?? []));
    if((data?.length ?? 0)<500)break;
  }
  return rows;
}
export async function loadReviewSourceSnapshot(db:SupabaseClient<Database>,caseId:string) {
  const [findings,pages,documents]=await Promise.all([
    readAllCaseRows(db,'case_findings',caseId),
    readAllCaseRows(db,'document_pages',caseId,'document_id,page,text'),
    readAllCaseRows(db,'documents',caseId),
  ]);
  return {findings,pages,documents};
}
export function scopedReviewPages(snapshot:{pages:SupportPage[];documents:Array<{id:string;metadata?:unknown;archived_at?:unknown}>}):SupportPage[] {
  const documents=new Map(snapshot.documents.map(doc=>[doc.id,doc]));
  return snapshot.pages.map(page=>{
    const document=documents.get(page.document_id);
    return {...page,document_scope:{...resolveDocumentAnalysisScope(document ?? {}),
      archived:Boolean(document?.archived_at),source_document_present:Boolean(document)}};
  });
}
export function documentPurposesResolved(documents:Array<{metadata?:unknown;archived_at?:unknown}>) {
  const active=documents.filter(d=>!d.archived_at);
  return active.length>0 && active.every(d=>resolveDocumentAnalysisScope(d).source_scope!=='unresolved');
}
