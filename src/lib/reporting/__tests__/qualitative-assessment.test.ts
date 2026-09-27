import { describe, expect, it } from 'vitest';
import { assessCase, assessmentLabels, subscriberAssessment, withoutLegalScoreText, preserveInternalAssessmentMetrics } from '../qualitative-assessment';

const finding = (category: string, id = category) => ({ id, category, verification_status: 'verified', evidence_refs: [{ document_id: 'doc', page: 1, quote: 'Located evidence', quote_verified: true }] });

describe('shared subscriber assessment', () => {
  it('withholds historical perspective bands and outcome forecasts while retaining trial preparation', () => {
    const raw = { full_report: { penal_perspective_scores: { defense: { score: 84, band: 'strong' } } }, trial_prep: { jury_conviction_pct: 70, jury_acquittal_pct: 30, penal_metrics: { conviction_risk: 70 }, opening_themes: ['Review the original recording.'] } };
    expect(subscriberAssessment(raw)).toEqual({ full_report: {}, trial_prep: { opening_themes: ['Review the original recording.'] } });
    expect(preserveInternalAssessmentMetrics(raw, subscriberAssessment(raw)).full_report.penal_perspective_scores).toEqual(raw.full_report.penal_perspective_scores);
  });
  it('persists QA diagnostics while keeping legal score fields null at both composition checkpoints', () => {
    const raw = { case_strength_score: 68, risk_score: 0, full_report: { deterministic_scorecard: { dimensions: { evidence: { score: 68 } } }, score_consistency: { delta: 20 }, deterministic_algorithms: { risk: { score: 0 } }, qa_v2: { passed: false } } };
    const presented = subscriberAssessment(raw);
    const persisted = preserveInternalAssessmentMetrics(raw, presented);
    expect(persisted.case_strength_score).toBeNull();
    expect(persisted.risk_score).toBeNull();
    expect(persisted.full_report.deterministic_scorecard).toEqual(raw.full_report.deterministic_scorecard);
    expect(persisted.full_report.score_consistency).toEqual({ delta: 20 });
    expect(persisted.full_report.qa_v2).toEqual({ passed: false });
    const refreshed = preserveInternalAssessmentMetrics(persisted, subscriberAssessment(persisted));
    expect(refreshed).toEqual(persisted);
    expect(subscriberAssessment(refreshed).full_report).not.toHaveProperty('deterministic_scorecard');
  });
  it('accepts the existing evidence gate source contract and explicit direction', () => {
    const f = { id: 'real-contract', finding_type: 'DIRECT_EVIDENCE', impact_direction: 'strengthens', source_document_id: 'doc', source_page: 1, source_quote: 'Located evidence', evidence_refs: [{ doc_id: 'doc', label: '[Doc 1, p. 1]', quote: 'Located evidence' }] };
    expect(assessCase({}, [f]).state).toBe('MATERIAL_STRENGTHS_IDENTIFIED');
    for (const flag of [{ lifecycle_status: 'superseded' }, { superseded_at: '2026-01-01' }, { metadata: { quarantined: true } }, { publication_status: 'SUPPRESSED' }]) {
      expect(assessCase({}, [{ ...f, ...flag }]).state).toBe('INSUFFICIENT_EVIDENCE');
    }
  });
  it('preserves specific risk statements and removes historical numeric-comparison notes', () => {
    expect(withoutLegalScoreText('Riesgo alto de pérdida de la prueba por vencimiento del plazo.')).toBe('Riesgo alto de pérdida de la prueba por vencimiento del plazo.');
    expect(withoutLegalScoreText('HIGH RISK of loss of evidence because the deadline expires tomorrow.')).toBe('HIGH RISK of loss of evidence because the deadline expires tomorrow.');
    expect(subscriberAssessment({ weaknesses: [{ title: 'Both sides scored similarly strong', detail: 'Both analyses scored 85.' }, { title: 'Missing hearing record' }] }).weaknesses).toEqual([{ title: 'Missing hearing record' }]);
  });
  it('preserves substantive legal prose and formatting verbatim', () => {
    const prose = 'The risk depends on Article 146.\n\n- Verify the hearing record.\n- Review the cited contract.';
    expect(withoutLegalScoreText(prose)).toBe(prose);
  });
  it('does not assess a report that has not run', () => {
    expect(assessCase(null).state).toBe('NOT_ASSESSED');
  });
  it.each(['familiar', 'civil', 'penal', 'migratorio', 'future_materia'])('ignores legacy baseline numbers for %s', case_type => {
    const report = { case_type, case_strength_score: 68, risk_score: 0, full_report: { deterministic_scorecard: { dimensions: { evidence: { score: 68, contributor_count: 0 } } } } };
    expect(assessCase(report).state).toBe('INSUFFICIENT_EVIDENCE');
    expect(assessmentLabels(assessCase(report), 'en').caseStrength).toBe('Insufficient record');
    expect(report.case_strength_score).toBe(68);
  });
  it.each([
    [[finding('strength')], 'MATERIAL_STRENGTHS_IDENTIFIED'],
    [[finding('weakness')], 'MATERIAL_WEAKNESSES_IDENTIFIED'],
    [[finding('strength'), finding('weakness')], 'MIXED_OR_CONTESTED'],
    [[{ ...finding('strength'), verification_status: 'quarantined' }], 'INSUFFICIENT_EVIDENCE'],
    [[{ ...finding('strength'), evidence_refs: [] }], 'INSUFFICIENT_EVIDENCE'],
  ])('grounds status in verified directional findings', (findings, state) => {
    expect(assessCase({ full_report: { intelligence: { consolidated_findings: findings } } }).state).toBe(state);
  });
  it('does not infer strength from severity, scores, or generic perspective prose', () => {
    expect(assessCase({ full_report: { intelligence: { consolidated_findings: [finding('fact')], perspectives: [{ strengths: ['certain winner'], strength_score: 99 }] } } }).state).toBe('NOT_ASSESSED');
  });
  it('material gaps qualify a supported strength without inventing coverage', () => {
    const a = assessCase({ missing_evidence_struct: [{ id: 'gap', severity: 'high' }], full_report: { intelligence: { consolidated_findings: [finding('strength')] } } });
    expect(a.state).toBe('MIXED_OR_CONTESTED');
    expect(a.evidenceCoverage).toBe('Partial');
    expect(a.materialUnresolvedIssues).toBe(1);
    expect(a.jurisdiction).toBe('Pending');
    expect(a.applicableAuthority).toBe('Pending');
  });
  it('removes legacy scoring throughout presentation, preserving substantive analysis and the source record', () => {
    const input = { report: { case_strength_score: 68, risk_score: 0, score_breakdown: 'Case strength: 68/100', risk_analysis: 'Risk Score: 0/100. The hearing record is missing.', full_report: { deterministic_scorecard: { score: 68 }, qa_v2: { score: 88 } } }, perspectives: [{ strength_score: 85, strengths: [{ detail: 'Signed receipt supports payment.' }] }], strategy_center: { risk_score: 3, next_actions: ['Obtain hearing record.'] }, findings: [finding('strength')], missing_evidence_struct: [{ title: 'Hearing record' }] };
    const out = subscriberAssessment(input);
    const text = JSON.stringify(out);
    expect(text).not.toMatch(/strength_score|risk_score|68\/100|85\/100|Risk Score/);
    expect(text).toContain('Signed receipt supports payment.');
    expect(text).toContain('Obtain hearing record.');
    expect(text).toContain('The hearing record is missing.');
    expect(out.findings).toEqual(input.findings);
    expect(out.report.full_report.qa_v2).toEqual({ score: 88 });
    expect(input.report.case_strength_score).toBe(68);
  });
  it.each(['LOW RISK - ADVANTAGE FOR THE PUBLIC PROSECUTOR\'S OFFICE', 'HIGH RISK — Defense Advantage', 'Ventaja del Ministerio Público', 'Plaintiff Advantage', 'Defendant Advantage'])('withholds legacy score headline: %s', headline => {
    expect(JSON.stringify(subscriberAssessment({ executive_summary: `${headline}\nA verified contract is available.` }))).not.toContain(headline);
  });
});
