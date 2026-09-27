import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PerspectivesPanel, StrategyPanel } from '../LitigationPanels';
vi.mock('@/i18n', () => ({ useI18n: () => ({ locale: 'en' }) }));

describe('substantive legal panels without numeric scoring', () => {
  it('renders Perspectives, supporting evidence, weaknesses and gaps from a historical record', () => {
    const html = renderToStaticMarkup(createElement(PerspectivesPanel, { perspectives: [{
      id: 'p', perspective: 'defense', summary: 'Risk Score: 0/100. Review the signed receipt.', confidence_label: 'confirmed', strength_score: 85, risk_score: 0,
      strengths: [{ title: 'Payment evidence', detail: 'Signed receipt supports payment.' }], weaknesses: [{ title: 'Evidence gap', detail: 'The hearing record is missing.' }],
      opposing_arguments: [{ argument: 'Signature contested', strength: 'possible' }], counter_arguments: [], key_evidence: [], recommended_actions: [],
    }] }));
    expect(html).toContain('perspective');
    expect(html).toContain('Signed receipt supports payment.');
    expect(html).toContain('The hearing record is missing.');
    expect(html).toContain('Signature contested');
    expect(html).not.toMatch(/85|Risk Score|0\/100/);
  });
  it('renders Strategy and next steps from a historical record without score rings', () => {
    const html = renderToStaticMarkup(createElement(StrategyPanel, { running: false, onRun: () => {}, strategy: [{
      id: 's', perspective: 'defensa', summary: 'Compare the original signature.', case_strength_score: 85, risk_score: 0, confidence_label: 'confirmed',
      motion_rankings: [], anticipated_opposing: [], counter_arguments: [], next_actions: [{ action: 'Obtain the hearing record.', priority: 'high' }],
    }] }));
    expect(html).toContain('Strategy');
    expect(html).toContain('Compare the original signature.');
    expect(html).toContain('Obtain the hearing record.');
    expect(html).not.toMatch(/85|Risk Score|0\/100/);
  });
});
