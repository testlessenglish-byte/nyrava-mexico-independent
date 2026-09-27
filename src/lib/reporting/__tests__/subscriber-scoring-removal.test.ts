import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaseStrengthCard } from '../../../components/CaseStrengthCard';
import { composeFinalReportPayload } from '../final-report-contract';
import { reconcileReportScorePresentation } from '../report-evidence-integrity';

describe('subscriber scoring removal at real boundaries', () => {
  it('retains the Case Strength card for an insufficient historical report', () => {
    const html = renderToStaticMarkup(createElement(CaseStrengthCard, { language: 'en', report: { case_strength_score: 0, risk_score: 0 }, coverage: true }));
    expect(html).toContain('Case Strength');
    expect(html).toContain('Insufficient evidence to assess');
    expect(html).toContain('Analysis Status');
    expect(html).not.toMatch(/\/100|Critical|Risk Score/);
  });
  it('never regenerates subscriber scores from baseline dimensions', () => {
    const report: any = { case_strength_score: 68, risk_score: 0, full_report: { deterministic_scorecard: { dimensions: { evidence: { score: 68, contributor_count: 0 } } } } };
    reconcileReportScorePresentation(report, true, 'en');
    expect(report.case_strength_score).toBeNull();
    expect(report.risk_score).toBeNull();
    expect(report.score_breakdown).not.toMatch(/68|\/100/);
    expect(report.full_report.deterministic_scorecard.dimensions.evidence.score).toBe(68);
  });
  it.each(['familiar', 'civil', 'penal', 'migratorio', 'future_materia'])('projects legacy %s reports without scoring', case_type => {
    const input: any = { case: { case_type, case_analysis_mode: 'active_litigation', report_language: 'en' }, documents: [], analysis: null, agents: [], score: { case_quality: 68 }, findings: [],
      perspectives: [{ perspective: 'defense', strength_score: 85, summary: 'The signature must be checked.' }], strategy_center: [{ next_actions: [{ action: 'Obtain the original.' }], risk_score: 5 }],
      report: { report_mode: 'FULL', case_strength_score: 68, risk_score: 0, executive_summary: 'LOW RISK - ADVANTAGE FOR THE PUBLIC PROSECUTOR\'S OFFICE\nThe available record supports further documentary review.', full_report: {} } };
    const out = composeFinalReportPayload(input);
    expect(JSON.stringify(out)).not.toMatch(/strength_score|risk_score|case_quality|ADVANTAGE/);
    expect(out.report?.full_report).toHaveProperty('case_assessment.state', 'INSUFFICIENT_EVIDENCE');
    expect(input.report.case_strength_score).toBe(68);
  });
});
