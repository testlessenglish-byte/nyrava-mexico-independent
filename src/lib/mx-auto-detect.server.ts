// Automatic routing uses the same purpose-selected, source-grounded classifier
// as the evidence trail. No raw-file or truncated-corpus heuristic can stamp a route.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassificationScope } from './intelligence/document-analysis-purpose';
export type AutoDetectResult = {
  caseType: string | null;
  jurisdiction: string | null;
  detected: boolean;
  source: string | null;
  analysisScope?: ClassificationScope;
};
export async function autoDetectCaseContext(supabase: SupabaseClient<any> | any, caseId: string, userId?: string): Promise<AutoDetectResult> {
  const readCase = async () => {
    const {data, error} = await supabase.from('cases').select('case_type,jurisdiction,matter_metadata').eq('id',caseId).maybeSingle();
    if (error) throw new Error(`Case context unavailable: ${error.message}`);
    return data;
  };
  const before = await readCase();
  let scope: ClassificationScope | undefined;
  if (userId) {
    const {runCaseClassification} = await import('./intelligence/case-classification.server');
    // Failure is not permission to use an ungrounded fallback.
    const classification = await runCaseClassification(supabase, caseId, userId);
    scope = classification.analysis_scope;
  }
  const after = userId ? await readCase() : before;
  const caseType = after?.case_type?.trim() || null;
  const jurisdiction = after?.jurisdiction?.trim() || null;
  const detected = caseType !== (before?.case_type?.trim() || null) || jurisdiction !== (before?.jurisdiction?.trim() || null);
  return {caseType, jurisdiction, detected, source: detected ? (scope === 'research_subject' ? 'research_subject' : 'source_confirmed') : caseType || jurisdiction ? 'case_field' : null, analysisScope: scope};
}
