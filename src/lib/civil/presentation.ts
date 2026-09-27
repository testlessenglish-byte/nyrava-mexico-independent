import type { CivilRow } from './issue-contract';
const labels: Record<string, [string, string]> = {
  underlying_materia: ['Materia de origen', 'Underlying matter'], underlying_proceeding_type: ['Procedimiento de origen', 'Underlying proceeding'],
  originating_court: ['Órgano de origen', 'Originating court'], originating_jurisdiction: ['Jurisdicción de origen', 'Originating jurisdiction'],
  current_procedural_posture: ['Postura procesal actual', 'Current procedural posture'], reviewing_court: ['Órgano revisor', 'Reviewing court'],
  applicable_substantive_law_entity: ['Entidad del derecho sustantivo', 'Substantive law jurisdiction'], applicable_procedural_law: ['Legislación procesal aplicable', 'Applicable procedural law'],
  status: ['Estado del procedimiento', 'Proceeding status'], concluded: ['Procedimiento concluido', 'Proceeding concluded'], evidentiary_record_closed: ['Periodo probatorio cerrado', 'Evidentiary record closed'],
};
const states: Record<string, string> = { SUPPORTED: 'Sustentado', DISPUTED: 'Controvertido', UNSUPPORTED: 'Sin sustento', UNRESOLVED: 'Sin resolver', NOT_APPLICABLE: 'No aplicable' };
export function civilPresentation(report: unknown, language = 'es') {
  const full = (report as CivilRow)?.full_report ?? {};
  if (!full.civil_procedural_context) return null;
  const es = language !== 'en';
  const contextRows = Object.entries(labels).map(([key, label]) => {
    const field = full.civil_procedural_context[key];
    return [label[es ? 0 : 1], field?.status === 'VERIFIED' ? typeof field.value === 'boolean' ? field.value ? (es ? 'Sí' : 'Yes') : (es ? 'No' : 'No') : String(field.value)
      : field?.status === 'CONFLICT' ? es ? 'Fuentes en conflicto' : 'Conflicting sources' : es ? 'Pendiente de verificar' : 'Pending verification'];
  });
  const elements = (Array.isArray(full.civil_elements_matrix) ? full.civil_elements_matrix : []).map((e: CivilRow) => ({
    issue: String(e.issue).replace(/_/g, ' '), element: String(e.element).replace(/_/g, ' '),
    status: es ? states[e.status] ?? e.status : e.status,
    reason: String(e.status_reason ?? ''),
    evidence: `${es ? 'Soporte' : 'Supporting'}: ${e.supporting_evidence?.length ?? 0}; ${es ? 'contraria' : 'contrary'}: ${e.contrary_evidence?.length ?? 0}; ${es ? 'alegaciones' : 'allegations'}: ${e.party_allegations?.length ?? 0}; ${es ? 'determinaciones judiciales' : 'court findings'}: ${e.court_findings?.length ?? 0}`,
    authority: (e.authority ?? []).map((a: CivilRow) => a.name ?? a.label ?? a.id).join('; ') || (es ? 'Autoridad aplicable pendiente' : 'Applicable authority pending'),
    gaps: (e.missing_corpus_evidence ?? []).join(' '), availability: String(e.procedural_availability ?? 'UNRESOLVED').replace(/_/g, ' '),
  }));
  return { title: es ? 'Contexto procesal civil' : 'Civil procedural context', elementsTitle: es ? 'Matriz de elementos civiles' : 'Civil elements matrix', contextRows, elements };
}
