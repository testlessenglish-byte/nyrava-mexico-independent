import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { resolveDocumentAnalysisScope } from './document-analysis-purpose';

export async function loadDocumentAnalysisContext(db: SupabaseClient<Database>, caseId: string) {
  const {data: caseRow,error} = await db.from('cases').select('matter_metadata').eq('id',caseId).maybeSingle();
  if(error || !caseRow)throw new Error('Document analysis configuration unavailable.');
  const metadata=(caseRow.matter_metadata ?? {}) as Record<string,unknown>;
  const documents=[] as Array<{document_id:string;filename:string;purpose:string|null;source_scope:string;connection_status:string;client_identity_verified:false}>;
  for(let offset=0;;offset+=500){
    const {data,error:docError}=await db.from('documents').select('id,filename,metadata').eq('case_id',caseId).is('archived_at',null).order('id').range(offset,offset+499);
    if(docError)throw new Error(`Document purposes unavailable: ${docError.message}`);
    for(const doc of data ?? [])documents.push({document_id:doc.id,filename:doc.filename,...resolveDocumentAnalysisScope(doc)});
    if((data?.length ?? 0)<500)break;
  }
  return {legal_question:typeof metadata.legal_question==='string'?metadata.legal_question:null,
    test_fixture:metadata.test_fixture===true,documents,
    purpose_resolved:documents.length>0 && documents.every(d=>d.source_scope!=='unresolved'),
    verification_policy:'production' as const};
}

export function renderDocumentAnalysisContext(context: Awaited<ReturnType<typeof loadDocumentAnalysisContext>>) {
  return `DOCUMENT PURPOSE AND CASE RECORD — DECLARATIONS, NOT PROOF\n${JSON.stringify(context)}\n`+
    'Research judgments concern their own parties, allegations and rulings; do not attribute them to the subscriber or client. '+
    'A declared connection permits evaluating submitted evidence but does not establish identity, authenticity or truth. '+
    'Distinguish allegation, admission, evidence, historical ruling, operative holding and inference. '+
    'Unresolved purpose must remain unresolved. Test fixtures use exactly the production verification requirements. '+
    'Answer the legal question when supplied; never invent one or create a client controversy from an uploaded judgment.';
}
