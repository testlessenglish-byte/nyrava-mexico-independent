export type DocumentAnalysisPurpose = 'legal_research' | 'client_matter_evidence';
type Metadata = Record<string, unknown>;
export function parseDocumentAnalysisPurpose(value: unknown): DocumentAnalysisPurpose | null {
  if (value == null || value === '') return null;
  if (value === 'legal_research' || value === 'client_matter_evidence') return value;
  throw new Error('Finalidad documental inválida.');
}
export function parseLegalQuestion(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 4000) throw new Error('La pregunta jurídica debe tener como máximo 4000 caracteres.');
  return value.trim() || null;
}
export function parseTestFixture(value: unknown): boolean {
  if (value === true || value === 'true') return true;
  if (value == null || value === '' || value === false || value === 'false') return false;
  throw new Error('Indicador de caso de prueba inválido.');
}
export function buildDocumentAnalysisMetadata(current: Metadata | null | undefined, purpose: unknown, connectionNote: unknown): Metadata {
  const parsed = parseDocumentAnalysisPurpose(purpose);
  const note = parseLegalQuestion(connectionNote);
  return { ...current, analysis_purpose: parsed, client_connection_note: parsed === 'client_matter_evidence' ? note : null };
}
export function resolveDocumentAnalysisScope(document: {metadata?: unknown}) {
  const metadata = document.metadata && typeof document.metadata === 'object' ? document.metadata as Metadata : {};
  const purpose = metadata.analysis_purpose === 'legal_research' || metadata.analysis_purpose === 'client_matter_evidence' ? metadata.analysis_purpose : null;
  const declared = purpose === 'client_matter_evidence' && typeof metadata.client_connection_note === 'string' && metadata.client_connection_note.trim().length > 0;
  return { purpose, source_scope: purpose === 'legal_research' ? 'research' as const : declared ? 'declared_client_evidence' as const : 'unresolved' as const,
    connection_status: declared ? 'declared' as const : 'unresolved' as const, client_identity_verified: false as const };
}
export function matterAnalysisScopeChanged(before: Metadata, patch: Metadata): boolean {
  // The default is a UI preference for future uploads, never a reinterpretation of existing documents.
  return patch.legal_question !== undefined && (patch.legal_question || null) !== (before.legal_question || null);
}
export type ClassificationScope = 'research_subject' | 'client_matter' | 'unresolved';
/** Purpose is explicit per document; upload defaults and test flags confer no authority. */
export function selectClassificationDocuments<T extends { metadata?: unknown }>(documents: T[], caseRow: { client_id?: unknown; client_name?: unknown; matter_metadata?: unknown }) : { scope: ClassificationScope; documents: T[] } {
  const linked = documents.filter(document => resolveDocumentAnalysisScope(document).source_scope === 'declared_client_evidence');
  if (linked.length) return { scope: 'client_matter', documents: linked };
  const meta = caseRow.matter_metadata && typeof caseRow.matter_metadata === 'object' ? caseRow.matter_metadata as Metadata : {};
  const hasClient = [caseRow.client_id, caseRow.client_name, meta.client_name].some(value => typeof value === 'string' && value.trim().length > 0);
  if (!hasClient && documents.length > 0 && documents.every(document => resolveDocumentAnalysisScope(document).source_scope === 'research'))
    return { scope: 'research_subject', documents };
  return { scope: 'unresolved', documents: [] };
}
