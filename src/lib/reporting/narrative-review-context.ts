import {narrativeDocumentIndex,type NarrativeReviewArgs} from './report-narrative-review';
import {resolveDocumentAnalysisScope} from '../intelligence/document-analysis-purpose';
import type {SupportPage} from '../intelligence/claim-support-review';
const obj=(value:unknown):Record<string,any>=>value&&typeof value==='object'?value as Record<string,any>:{};
/** Shared by final review and downloads. No generated authority record can
 * declare itself applicable or binding by putting a flag into report JSON. */
export function narrativeReviewContext(payload:Record<string,any>,sourcePages?:readonly SupportPage[]):NarrativeReviewArgs {
  const report=obj(payload.report),full=obj(report.full_report),caseRow=obj(payload.case),metadata=obj(caseRow.matter_metadata);
  const documents=new Map<string,any>((Array.isArray(payload.documents)?payload.documents:[]).map((d:any)=>[d.id,d]));
  const pages=(sourcePages ?? (Array.isArray(full.pre_release_source_pages)?full.pre_release_source_pages:[])).map((p:SupportPage)=>{
    const document=documents.get(p.document_id);
    return {...p,document_scope:{...resolveDocumentAnalysisScope(document ?? {}),archived:Boolean(document?.archived_at),source_document_present:Boolean(document)}};
  }).sort((a:SupportPage,b:SupportPage)=>a.document_id.localeCompare(b.document_id)||a.page-b.page);
  return {payload,pages,documents:narrativeDocumentIndex(payload).sort((a,b)=>a.doc_n-b.doc_n||a.id.localeCompare(b.id)),
    // Source verification alone does not establish case-specific applicability
    // or binding effect. Those unimplemented attestations remain unresolved.
    authorities:[],relevantDate:typeof metadata.proceeding_started_on==='string'?metadata.proceeding_started_on:null,
    lawContext:{profile:full.legal_context??null,case_type:caseRow.case_type??null,jurisdiction:caseRow.jurisdiction??null,
      procedural_vehicle:caseRow.procedural_vehicle??null,underlying_materia:caseRow.underlying_materia??null,
      legal_question:metadata.legal_question??null,applicable_law_state:metadata.applicable_law_state??null}};
}
