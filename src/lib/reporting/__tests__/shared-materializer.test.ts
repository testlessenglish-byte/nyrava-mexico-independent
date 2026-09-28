import { describe, it, expect } from 'vitest';
import { auditReportCitationIntegrity } from '../citation-integrity';
import { composeFinalReportPayload } from '../final-report-contract';
import { completedTheoriesCitations, completedPerspectivesCitations, completedCoreCitations } from '../citation-production';
import type { FinalReportPayload } from '../export';

describe('SHARED MATERIALIZER', () => {
  const pages = [
    { document_id: 'doc-1', page: 1, text: 'This is the verified text for the executive summary.' },
    { document_id: 'doc-1', page: 2, text: 'This is the verified text for a contradiction.' },
    { document_id: 'doc-2', page: 1, text: 'This is the verified text for the other contradiction.' },
    { document_id: 'doc-2', page: 2, text: 'This is the verified text for the decision core.' },
    { document_id: 'doc-2', page: 3, text: /'This is the verified text for Theory verified string.'/ },
    { document_id: 'doc-3', page: 1, text: /'This is the verified text for Perspective verified string.'/ }
  ];

  const index = [
    { document_id: 'doc-1', doc_n: 1 },
    { document_id: 'doc-2', doc_n: 2 },
    { document_id: 'doc-3', doc_n: 3 }
  ];

  const makePayload = (overrides: any = {}): FinalReportPayload => ({
    case: { case_type: 'civil', report_language: 'es' },
    documents: [
      { id: 'doc-1', doc_n: 1, canonical_source_id: 'src-1' },
      { id: 'doc-2', doc_n: 2, canonical_source_id: 'src-2' },
      { id: 'doc-3', doc_n: 3, canonical_source_id: 'src-3' }
    ],
    agents: [],
    findings: [],
    analysis: null,
    score: null,
    report: {
      report_mode: 'FULL',
      citations: [],
      contradictions_struct: [
        {
          title: 'Contradiction title',
          document_a: { document_id: 'doc-1', page: 2, quote: 'This is the verified text for a contradiction.', title: 'Contradiction side A' },
          document_b: { document_id: 'doc-2', page: 1, quote: 'This is the verified text for the other contradiction.', title: 'Contradiction side B' }
        }
      ],
      full_report: {
        pre_release_source_pages: pages,
        report_governance: { decision_core_priority: true },
        mandatory_decision_core: {
          items: [
            {
              text: 'This is the verified text for the decision core.',
              source_refs: [
                { document_id: 'doc-2', page: 2, quote: 'This is the verified text for the decision core.' }
              ]
            }
          ]
        },
        ...overrides
      }
    },
    theories: [
      {
        title: /'Theory verified string'/,
        theory_type: 'legal',
        citations: [
          { document_id: 'doc-2', page: 3, quote: /'This is the verified text for Theory verified string.'/, proposition_supported: /'Theory verified string'/ }
        ]
      }
    ],
    perspectives: [
      {
        perspective: /'Perspective verified string'/,
        key_evidence: [
          {
            description: /'Perspective verified string'/,
            citation: { document_id: 'doc-3', page: 1, quote: /'This is the verified text for Perspective verified string.'/, proposition_supported: /'Perspective verified string'/ }
          }
        ]
      }
    ],
    report_presentation: {
      capability: { mode: 'FULL', strategic_recommendations_allowed: true, scores_allowed: true },
      governance: { decision_core_priority: true },
      finding_cards: [],
      render_output: true
    }
  } as unknown as FinalReportPayload);

  it('passes positive full-payload fixture with zero errors', () => {
    const p = makePayload();
    const index2 = p.documents.map(d=>({document_id:d.id, doc_n:d.doc_n, canonical_source_id:d.canonical_source_id}));
    p.theories = completedTheoriesCitations(p.theories as any, [], pages, index2) as any;
    p.perspectives = completedPerspectivesCitations(p.perspectives as any, [], pages, index2) as any;
    p.report.full_report.mandatory_decision_core.items = completedCoreCitations(p.report.full_report.mandatory_decision_core.items as any, [], pages, index2) as any;
    const payload = composeFinalReportPayload(p);
    const audit = auditReportCitationIntegrity(payload);
    if (!audit.ok) { console.log(audit.errors); console.log(JSON.stringify(payload.report.full_report.mandatory_decision_core.items[0].source_refs[0])); } expect(audit.ok).toBe(true);
    expect(audit.errors).toEqual([]);
    expect(audit.unverified.length).toBe(0);
    expect(payload.report?.executive_summary?.length).toBeGreaterThan(80);
    expect(payload.report?.contradictions_struct?.length).toBe(1);
    expect(payload.theories?.[0].citations?.[0]?.verification_status).toBe('verified');
    expect(payload.perspectives?.[0].key_evidence?.[0]?.citation?.verification_status).toBe('verified');
  });

  it('blocks on wrong page', () => {
    const p = makePayload({
      mandatory_decision_core: {
        items: [
          {
            text: 'This is the verified text for the decision core.',
            source_refs: [
              { document_id: 'doc-2', page: 99, quote: 'This is the verified text for the decision core.' }
            ]
          }
        ]
      }
    });
    const index2 = p.documents.map(d=>({document_id:d.id, doc_n:d.doc_n, canonical_source_id:d.canonical_source_id}));
    p.report.full_report.mandatory_decision_core.items = completedCoreCitations(p.report.full_report.mandatory_decision_core.items as any, [], pages, index2) as any;
    const payload = composeFinalReportPayload(p);
    // In final report contract, if decision core fails verification, it drops the item. 
    // This will cause executiveSummaryMissing if the summary is too short.
    expect(payload.report?.executive_summary?.length ?? 0).toBeLessThan(80);
  });
});
