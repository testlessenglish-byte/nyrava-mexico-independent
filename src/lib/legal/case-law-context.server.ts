import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { resolveCaseIdentity } from '../intelligence/case-classification.server';
import { buildJurisdictionProfile } from '../intelligence/mx-jurisdiction';
import { CDMX_PROCEEDING_TYPES, CDMX_TRANSITION_SOURCES, evaluateCdmxProceduralTransition, type CdmxProceedingType } from './cdmx-procedural-transition';

/** Configuration is not documentary proof. Keep this separate from the corpus. */
export async function loadCaseLawProfile(db: SupabaseClient<Database>, caseId: string) {
  const identity = await resolveCaseIdentity(db, caseId);
  const {data, error} = await db.from('cases').select('jurisdiction,matter_metadata').eq('id',caseId).maybeSingle();
  if (error) throw new Error(`Legal configuration unavailable: ${error.message}`);
  const metadata = (data?.matter_metadata ?? {}) as Record<string, unknown>;
  const localState = typeof metadata.applicable_law_state === 'string' ? metadata.applicable_law_state : null;
  const {data:courtEvidence,error:courtError} = await db.from('case_classification_evidence')
    .select('value').eq('case_id',caseId).eq('field','court').eq('status','CONFIRMED')
    .order('detected_at',{ascending:false}).limit(1).maybeSingle();
  if (courtError) throw new Error(`Court evidence unavailable: ${courtError.message}`);
  const profile = buildJurisdictionProfile({caseType:identity.caseType, jurisdictionField:data?.jurisdiction ?? identity.jurisdiction,
    issuingCourt:courtEvidence?.value,
    underlyingMateria:identity.underlyingMateria, proceduralVehicle:identity.proceduralVehicle, applicableState:localState});
  const proceedingType = CDMX_PROCEEDING_TYPES.includes(metadata.civil_family_proceeding as CdmxProceedingType)
    ? metadata.civil_family_proceeding as CdmxProceedingType : null;
  // User-entered dates/types are declarations, not authenticated source proof.
  // The source-bound evaluator remains pending until that proof is supplied.
  const transition = evaluateCdmxProceduralTransition({
    courtEntity:profile.court_jurisdiction.entity,
    courtOrder:profile.jurisdiction_level === 'state' ? 'local' : profile.jurisdiction_level === 'federal' ? 'federal' : null,
    proceedingType,
    proceedingStartedOn:typeof metadata.proceeding_started_on === 'string' ? metadata.proceeding_started_on : null,
    asOf:new Date().toISOString().slice(0,10),
  });
  return {...profile, procedural_transition:transition, transition_sources:CDMX_TRANSITION_SOURCES};
}

export async function loadLegalReasoningContext(db: SupabaseClient<Database>, caseId: string): Promise<string> {
  const profile = await loadCaseLawProfile(db, caseId);
  const {loadDocumentAnalysisContext,renderDocumentAnalysisContext}=await import('../intelligence/document-analysis-context.server');
  const documentContext=await loadDocumentAnalysisContext(db,caseId);
  return renderDocumentAnalysisContext(documentContext)+`\nLEGAL CONFIGURATION — NOT SOURCE EVIDENCE\n${JSON.stringify(profile)}\n` +
    'Court competence and applicable law are separate. Federal or national law may apply in a local court. '+
    'Amparo procedure does not replace the law governing the underlying act. Never infer CDMX law from missing state. '+
    'Candidate instruments are not verified provisions: establish official source, article, version, effective dates, '+
    'transitional rule and proceeding before a legal conclusion. Label unresolved issues as missing information. '+
    'Do not calculate procedural deadlines without the relevant service/start date, court calendar and suspension rules. '+
    'Do not turn a missing document into a proved violation or invent quotations, case-law registers, percentages or legal outcomes.';
}
