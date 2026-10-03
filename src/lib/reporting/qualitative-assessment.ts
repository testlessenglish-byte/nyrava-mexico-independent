/** Shared subscriber contract. Legacy scores are inputs to internal QA only;
 * they never establish a legal assessment or a party's likelihood of success. */
type Row = Record<string, any>;
const obj = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : {};
const arr = (v: unknown): Row[] => Array.isArray(v) ? v : [];
export type CaseStrengthState = 'NOT_ASSESSED' | 'INSUFFICIENT_EVIDENCE' | 'MATERIAL_STRENGTHS_IDENTIFIED' | 'MIXED_OR_CONTESTED' | 'MATERIAL_WEAKNESSES_IDENTIFIED';
export interface CaseAssessment {
  state: CaseStrengthState;
  evidenceCoverage: 'Partial' | 'Insufficient' | 'Undetermined';
  citationStatus: 'Verified' | 'Partial' | 'Unresolved';
  applicableAuthority: 'Pending';
  jurisdiction: 'Pending';
  proceduralPosture: 'Pending';
  materialUnresolvedIssues: number;
  supportingFindingIds: string[];
  contraryFindingIds: string[];
}
const located = (r: Row) => Boolean((r.document_id || r.canonical_source_id) && Number(r.page) > 0 && String(r.quote ?? '').trim());
const verifiedRef = (r: Row) => located(r) && (r.quote_verified === true || r.verification_status === 'verified');
function reportable(f: Row) {
  const metadata = obj(f.metadata), diagnostic = obj(metadata.claim_entailment_diagnostic);
  return !f.superseded_at && !f.quarantined && !f.stale && !metadata.quarantined &&
    !['superseded', 'quarantined', 'rejected', 'suppressed'].includes(f.lifecycle_status) &&
    f.finding_status !== 'suppressed' && !['quarantined', 'rejected', 'unverified'].includes(f.verification_status) &&
    ![f.publication_status, metadata.publication_status, obj(metadata.published_claim).publication_status].some(s => ['SUPPRESSED', 'QUARANTINED'].includes(s)) &&
    diagnostic.final_reportable !== false && !['REMOVE', 'QUARANTINE'].includes(diagnostic.claim_action);
}
function sourceBacked(f: Row) {
  // addGatedFindings persists these fields after corpus quote verification.
  const gatedSource = ['DIRECT_EVIDENCE', 'EVIDENCE_BASED_INFERENCE'].includes(f.finding_type) &&
    located({ document_id: f.source_document_id, page: f.source_page, quote: f.source_quote });
  return gatedSource || arr(f.evidence_refs ?? f.source_refs).some(verifiedRef);
}
function directional(f: Row, direction: 'strengthens' | 'weakens', category: string) {
  if (['AI_THEORY', 'POTENTIAL_ISSUE', 'EVIDENCE_GAP', 'NOT_FOUND', 'VERIFIED_LEGAL_RULE', 'PARTY_ALLEGATION'].includes(f.audit_classification) ||
      ['legal_rule', 'party_argument', 'allegation'].includes(f.proposition_type) || f.finding_type === 'AI_THEORY') return false;
  return f.impact_direction === direction || (!f.impact_direction && f.category === category);
}

export function assessCase(report: unknown, findings?: unknown[]): CaseAssessment {
  const r = obj(report), full = obj(r.full_report);
  const all = arr(findings ?? obj(full.intelligence).consolidated_findings);
  const verified = all.filter(f => f && reportable(f) && sourceBacked(f));
  const support = verified.filter(f => directional(f, 'strengthens', 'strength'));
  const contrary = verified.filter(f => directional(f, 'weakens', 'weakness'));
  const gaps = arr(r.missing_evidence_struct).filter(g => g.resolved !== true && g.status !== 'resolved');
  const materialGaps = gaps.filter(g => g.material === true || ['critical', 'high'].includes(g.severity));
  const contested = arr(r.contradictions_struct).some(c => c.quote_verified === true && c.resolved !== true);
  const ess = obj(obj(full.validation).evidence_sufficiency);
  const limitations = obj(full.assessment_limitations);
  const insufficient = !verified.length || ['minimal', 'low'].includes(ess.level ?? ess.bin) ||
    limitations.material_authority_unresolved === true || limitations.material_citations_unresolved === true ||
    limitations.underlying_record_absent === true || limitations.corpus_coverage_insufficient === true ||
    limitations.material_elements_unresolved === true;
  let state: CaseStrengthState = !report ? 'NOT_ASSESSED' : insufficient ? 'INSUFFICIENT_EVIDENCE' : 'NOT_ASSESSED';
  if (!insufficient) {
    if ((support.length && contrary.length) || ((support.length || contrary.length) && (materialGaps.length || contested))) state = 'MIXED_OR_CONTESTED';
    else if (support.length) state = 'MATERIAL_STRENGTHS_IDENTIFIED';
    else if (contrary.length) state = 'MATERIAL_WEAKNESSES_IDENTIFIED';
  }
  const citations = arr(r.citations);
  const verifiedCitations = citations.filter(verifiedRef);
  return {
    state, evidenceCoverage: !report ? 'Undetermined' : insufficient ? 'Insufficient' : 'Partial',
    citationStatus: citations.length && verifiedCitations.length === citations.length ? 'Verified' : verifiedCitations.length ? 'Partial' : 'Unresolved',
    // Presence of a law, jurisdiction name or posture is not verification.
    // Keep Pending until a dedicated source-backed verification contract exists.
    applicableAuthority: 'Pending', jurisdiction: 'Pending', proceduralPosture: 'Pending',
    materialUnresolvedIssues: materialGaps.length + arr(r.contradictions_struct).filter(c => c.quote_verified === true && c.resolved !== true).length,
    supportingFindingIds: support.map(f => String(f.id)).filter(id => id !== 'undefined'),
    contraryFindingIds: contrary.map(f => String(f.id)).filter(id => id !== 'undefined'),
  };
}

const labels: Record<CaseStrengthState, [string, string]> = {
  NOT_ASSESSED: ['Evaluación no disponible', 'Assessment unavailable'],
  INSUFFICIENT_EVIDENCE: ['Expediente insuficiente', 'Insufficient record'],
  MATERIAL_STRENGTHS_IDENTIFIED: ['Sólida', 'Solid'],
  MIXED_OR_CONTESTED: ['Moderada', 'Moderate'],
  MATERIAL_WEAKNESSES_IDENTIFIED: ['Limitada', 'Limited'],
};
export function assessmentLabels(a: CaseAssessment, language = 'es') {
  const es = language !== 'en';
  const value = (s: string) => es ? ({ Partial: 'Parcial', Insufficient: 'Insuficiente', Undetermined: 'Indeterminada', Verified: 'Verificado', Unresolved: 'Sin resolver', Pending: 'Pendiente' } as Record<string, string>)[s] ?? s : s;
  return {
    title: es ? 'Estado del análisis' : 'Analysis Status',
    caseStrengthTitle: es ? 'Preparación probatoria' : 'Evidentiary Readiness',
    caseStrength: labels[a.state][es ? 0 : 1],
    explanation: es ? 'Mide la calidad del expediente disponible para sustentar el análisis jurídico. No predice el resultado del litigio.' : 'Measures how well the available record supports legal analysis. Does not predict litigation outcome.',
    rows: [
      [es ? 'Cobertura probatoria' : 'Evidence coverage', value(a.evidenceCoverage)],
      [es ? 'Estado de citas' : 'Citation status', value(a.citationStatus)],
      [es ? 'Autoridad aplicable' : 'Applicable authority', value(a.applicableAuthority)],
      [es ? 'Jurisdicción' : 'Jurisdiction', value(a.jurisdiction)],
      [es ? 'Etapa procesal' : 'Procedural posture', value(a.proceduralPosture)],
      [es ? 'Cuestiones relevantes sin resolver' : 'Material unresolved issues', String(a.materialUnresolvedIssues)],
    ],
  };
}

// Narrow removal of generated score assertions. Legal-risk prose and quoted
// source evidence are retained. This also handles historical report prose.
export function withoutLegalScoreText(text: string): string {
  const parts = text.split(/([.!?]\s+|\n)/);
  let changed = false;
  for (let i = 0; i < parts.length; i += 2) {
    const part = parts[i];
    if (
    /^(?:La fuerza del caso pasó de \d+ a \d+|La suficiencia probatoria .*(?:se suprimieron|se reactivaron) los puntajes)/i.test(part.trim()) ||
    /(?:case[ -]?(?:strength|score)|strength of (?:the )?case|risk score|fortaleza (?:del|de la)|fuerza del caso|puntuaci[oó]n de riesgo|[ií]ndice de riesgo|riesgo|risk)\s*[:=]?\s*\d{1,3}\s*\/\s*100/i.test(part) ||
    /^\s*(?:(?:LOW|MEDIUM|HIGH|CRITICAL) RISK|Riesgo (?:Bajo|Moderado|Alto|Cr[ií]tico))\s*(?:$|[-—–]\s*(?:advantage|ventaja|prosecution|defense|plaintiff|defendant))/i.test(part) ||
    /^\s*(?:(?:prosecution|defense|plaintiff|defendant) advantage|(?:ventaja (?:de la defensa|del ministerio p[uú]blico|del demandante|del demandado))|advantage for the public prosecutor)\s*$/i.test(part)
    ) {
      parts[i] = '';
      if (i + 1 < parts.length) parts[i + 1] = '';
      changed = true;
    }
  }
  return changed ? parts.join('').trim() : text;
}

const legalMetrics = new Set(['case_strength_score', 'strength_score', 'risk_score', 'case_score', 'case_strength', 'case_quality', 'conviction_risk', 'appeal_risk', 'litigation_risk', 'settlement_pressure', 'score_breakdown', 'score_delta', 'deterministic_scorecard', 'dimension_breakdowns', 'positive_contributors', 'negative_contributors', 'risk_consistency', 'score_consistency', 'Scores']);
const preserved = new Set(['qa_v2', 'release_gate', 'release_decision', 'validation', 'integrity_audit', 'hallucination_report', 'legal_qa_report', 'documents', 'pre_release_source_pages', 'source_refs', 'evidence_refs', 'citations', 'quote', 'source_quote', 'proposition_verification', 'citation_review_registry']);
for (const key of ['penal_perspective_scores', 'penal_metrics', 'civil_metrics', 'jury_conviction_pct', 'jury_acquittal_pct', 'jury_appeal_pct', 'jury_settlement_pct']) legalMetrics.add(key);
/** Immutable presentation projection; never rewrites stored historical records
 * or the QA inputs used to decide whether a report can be released. */
export function subscriberAssessment<T>(input: T): T {
  const walk = (v: any, key = ''): any => {
    if (preserved.has(key)) return structuredClone(v);
    if (typeof v === 'string') return withoutLegalScoreText(v);
    if (Array.isArray(v)) return v.filter(x => !/^(?:Both sides scored similarly strong|Ambas partes obtuvieron una puntuación de fortaleza igualmente alta)$/.test(String(x?.title ?? ''))).map(x => walk(x));
    if (!v || typeof v !== 'object') return v;
    return Object.fromEntries(Object.entries(v).filter(([k]) => !legalMetrics.has(k) && k !== 'score').map(([k, x]) =>
      [k, k === 'deterministic_algorithms' ? walk(Object.fromEntries(Object.entries(obj(x)).filter(([name]) => name !== 'risk')), k) : walk(x, k)]));
  };
  return walk(input) as T;
}

/** Pipeline composition also writes back to storage. Preserve QA inputs there,
 * while the rendered/exported projection continues to exclude these metrics. */
export function preserveInternalAssessmentMetrics<T extends Row>(stored: T, presentation: Row): T {
  const full = { ...obj(presentation.full_report) };
  for (const key of ['deterministic_scorecard', 'deterministic_algorithms', 'score_consistency', 'risk_consistency', 'penal_perspective_scores']) {
    if (key in obj(stored.full_report)) full[key] = structuredClone(stored.full_report[key]);
  }
  return { ...presentation, case_strength_score: null, risk_score: null, full_report: full } as T;
}
