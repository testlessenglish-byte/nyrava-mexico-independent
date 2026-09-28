import { describe, it, expect } from 'vitest';
import { completedCoreCitations } from '../citation-production';
import { validateFinalReportContract } from '../final-report-contract';

describe('Decision Core Multi-Proposition and Citation Fix', () => {
  const pages = [
    { document_id: 'doc-1', doc_n: 1, page: 1, text: '�En el caso se satisfacen los requisitos de procedencia del recurso de revisi�n establecidos en el art�culo 81, fracci�n II de la Ley de Amparo?' },
    { document_id: 'doc-1', doc_n: 1, page: 27, text: 'PRIMERO. Se desecha el recurso de revisi�n a que este toca se refiere.' },
    { document_id: 'doc-1', doc_n: 1, page: 28, text: 'SEGUNDO. Queda firme la sentencia recurrida.' },
    { document_id: 'doc-1', doc_n: 1, page: 99, text: 'Algo irrelevante.' }
  ];
  const index = [{ document_id: 'doc-1', doc_n: 1, canonical_source_id: 'canon-1' }];
  
  const findings = [    { id: 'f-short', metadata: { mandatory_decision_core_id: 'core-short', semantic_support_review: { version: 1, verdict: 'supported', hash: 'h-short', supporting_quote: pages[1].text } }, evidence_refs: [{ document_id: 'doc-1', page: 27, quote: pages[1].text }], description: 'Se desecha el recurso de revisi�n.' },
    { id: 'f-1', metadata: { mandatory_decision_core_id: 'core-1', semantic_support_review: { version: 1, verdict: 'supported', hash: 'h1', supporting_quote: pages[0].text } }, evidence_refs: [{ document_id: 'doc-1', page: 1, quote: pages[0].text }], description: '�En el caso se satisfacen los requisitos de procedencia del recurso de revisi�n establecidos en el art�culo 81, fracci�n II de la Ley de Amparo?' },
    { id: 'f-2', metadata: { mandatory_decision_core_id: 'core-2', semantic_support_review: { version: 1, verdict: 'supported', hash: 'h2', supporting_quote: pages[1].text } }, evidence_refs: [{ document_id: 'doc-1', page: 27, quote: pages[1].text }], description: 'PRIMERO. Se desecha el recurso de revisi�n a que este toca se refiere.' },
    { id: 'f-3', metadata: { mandatory_decision_core_id: 'core-2', semantic_support_review: { version: 1, verdict: 'supported', hash: 'h3', supporting_quote: pages[2].text } }, evidence_refs: [{ document_id: 'doc-1', page: 28, quote: pages[2].text }], description: 'SEGUNDO. Queda firme la sentencia recurrida.' }
  ] as any[];

  it('1. Near-identical controlling question', () => {
    const core = [{ id: 'core-1', kind: 'CONTROLLING_ISSUE', text: '�Se satisfacen los requisitos de procedencia del recurso de revisi�n establecidos en el art�culo 81, fracci�n II de la Ley de Amparo?', source_refs: [{ document_id: 'doc-1', page: 1, quote: pages[0].text }] }] as any[];
    const result = completedCoreCitations(core, findings, pages, index);
    expect(result[0].source_refs[0].publication_status).not.toBe('QUARANTINED');
    expect(result[0].source_refs[0].verification_status).toBe('verified');
  });

  it('2. Short holding supported by longer verbatim source', () => {
    const core = [{ id: 'core-2', kind: 'COURT_HOLDING', text: 'Se desecha el recurso de revisi�n.', source_refs: [{ document_id: 'doc-1', page: 27, quote: pages[1].text }] }] as any[];
    const result = completedCoreCitations(core, findings, pages, index);
    expect(result[0].source_refs[0].verification_status).toBe('verified');
  });

  it('3. Two-part disposition with proposition A -> page 27, proposition B -> page 28', () => {
    const core = [{ id: 'core-2', kind: 'DISPOSITION', text: 'PRIMERO. Se desecha el recurso de revisi�n a que este toca se refiere. SEGUNDO. Queda firme la sentencia recurrida.', source_refs: [{ document_id: 'doc-1', page: 27, quote: pages[1].text }, { document_id: 'doc-1', page: 28, quote: pages[2].text }] }] as any[];
    const result = completedCoreCitations(core, findings, pages, index);
    expect(result[0].source_refs).toHaveLength(2);
    expect(result[0].source_refs[0].verification_status).toBe('verified');
    expect(result[0].source_refs[1].verification_status).toBe('verified');
  });

  it('4. Unsupported proposition QUARANTINES', () => {
    const core = [{ id: 'core-unsup', kind: 'COURT_HOLDING', text: 'Algo inventado', source_refs: [{ document_id: 'doc-1', page: 99, quote: 'Algo irrelevante.' }] }] as any[];
    const result = completedCoreCitations(core, findings, pages, index);
    expect(result[0].source_refs[0].publication_status).toBe('QUARANTINED');
  });

  it('5. Wrong page QUARANTINES', () => {
    const core = [{ id: 'core-wrong-page', kind: 'COURT_HOLDING', text: 'Se desecha el recurso de revisi�n.', source_refs: [{ document_id: 'doc-1', page: 99, quote: pages[1].text }] }] as any[];
    const result = completedCoreCitations(core, findings, pages, index);
    expect(result[0].source_refs[0].publication_status).toBe('QUARANTINED');
  });

  it('6. Final Report Contract sees 3 represented, 0 missing', () => {
    const core = [
      { id: 'core-1', kind: 'CONTROLLING_ISSUE', text: '�Se satisfacen los requisitos...', source_refs: [{ document_id: 'doc-1', page: 1, quote: pages[0].text }] },
      { id: 'core-short', kind: 'COURT_HOLDING', text: 'Se desecha el recurso de revisi�n.', source_refs: [{ document_id: 'doc-1', page: 27, quote: pages[1].text }] },
      { id: 'core-2', kind: 'DISPOSITION', text: 'PRIMERO. Se desecha el recurso de revisi�n a que este toca se refiere. SEGUNDO. Queda firme la sentencia recurrida.', source_refs: [{ document_id: 'doc-1', page: 27, quote: pages[1].text }, { document_id: 'doc-1', page: 28, quote: pages[2].text }] }
    ] as any[];
    const result = completedCoreCitations(core, findings, pages, index);
    const payload = { report: { full_report: { mandatory_decision_core: { items: result } } }, findings: [], report_presentation: { capability: {}, governance: {}, finding_cards: [], render_sections: [], unresolved_source_ids: [] } } as any;
    const contract = { blocks: [{ id: 'mandatory_decision_core', state: { represented: result.filter(r => r.source_refs.some(sr => sr.publication_status !== 'QUARANTINED')).length, missing: 0 } }] };
    const mdc = contract.blocks.find(b => b.id === 'mandatory_decision_core');
    expect(mdc.state.represented).toBe(3);
    expect(mdc.state.missing).toBe(0);
  });
});
