import { describe, it, expect } from 'vitest';
import { completedPerspectivesCitations, completedFindingsCitations } from '../citation-production';
import { buildVerifiedLegalAnalysis } from '../legal-analysis';

describe('Canonical Report Artifact Publication', () => {
  it('canonical perspective citation survives into final report', () => {
    const pages = [{ document_id: 'doc', filename: 'source.pdf', page: 27, text: 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.' }] as any;
    const index = [{ document_id: 'doc', doc_n: 1, canonical_source_id: 'doc' }] as any;
    const findings = [] as any;
    const perspectives = [{ key_evidence: [{ citation: { document_id: 'doc', page: 27, quote: 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.', verification_status: 'verified', proposition_supported: 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.' } }] }] as any;
    
    const canonical = completedPerspectivesCitations(perspectives, findings, pages, index);
    expect(canonical[0].key_evidence[0].citation.doc_n).toBe(1);
    expect(canonical[0].key_evidence[0].citation.canonical_source_id).toBe('doc');
  });

  it('canonical finding evidence refs survive into final report', () => {
    const pages = [{ document_id: 'doc', filename: 'source.pdf', page: 27, text: 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.' }] as any;
    const index = [{ document_id: 'doc', doc_n: 1, canonical_source_id: 'doc' }] as any;
    const findings = [{ evidence_refs: [{ document_id: 'doc', page: 27, quote: 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.', verification_status: 'verified', proposition_supported: 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.' }] }] as any;
    
    const canonical = completedFindingsCitations(findings, pages, index);
    expect(canonical[0].evidence_refs[0].doc_n).toBe(1);
  });

  it('IRAC application uses only propositions actually present in canonical writer citations', () => {
    const canonicalFindings = [{ title: 'F1', evidence_refs: [{ document_id: 'doc', page: 27, quote: 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.', verification_status: 'verified', proposition_supported: 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.' }] }] as any;
    const canonicalCitations = [{ document_id: 'doc', page: 27, quote: 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.', verification_status: 'verified', proposition_supported: 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.', doc_n: 1 }] as any;
    const memoAnalysis = buildVerifiedLegalAnalysis(canonicalFindings, canonicalCitations);
    expect(memoAnalysis[0].application).toContain('“Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.”');
    expect(memoAnalysis[0].application).toContain('[DOC 1 p.27]');
  });

  it('unresolved citations remain quarantined and still BLOCK', () => {
    const pages = [{ document_id: 'doc', filename: 'source.pdf', page: 27, text: 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.' }] as any;
    const index = [{ document_id: 'doc', doc_n: 1, canonical_source_id: 'doc' }] as any;
    const findings = [{ evidence_refs: [{ document_id: 'doc', page: 27, quote: 'Not in text.', verification_status: 'verified' }] }] as any;
    
    const canonical = completedFindingsCitations(findings, pages, index);
    expect(canonical[0].evidence_refs[0].publication_status).toBe('QUARANTINED');
  });
});
