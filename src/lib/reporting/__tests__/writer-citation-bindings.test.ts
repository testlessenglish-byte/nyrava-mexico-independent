import { describe, expect, it } from 'vitest';
import { auditReportCitationIntegrity } from '../citation-integrity';
import { resolveWriterCitationReferences, writerCitationCatalog } from '../citation-production';

// These are the two physical ADR 7286/2017 passages missing from the saved
// executive-summary citation appendix despite appearing inline in its prose.
const question = 'determinar si se satisfacen los requisitos de importancia y trascendencia que permitan la procedencia del presente recurso de revisión.';
const disposition = 'Se desecha por improcedente el recurso de revisión a que este toca 7286/2017 se refiere.';
const pages = [
  { document_id: 'adr-source', filename: 'adr.pdf', page: 1, text: question },
  { document_id: 'adr-source', filename: 'adr.pdf', page: 27, text: disposition },
];
const index = [{ document_id: 'adr-source', doc_n: 1, canonical_source_id: 'adr-source' }];

describe('Writer inline citations bound to canonical source identities', () => {
  it('renders the saved ADR executive-summary references from verified IDs and retains both appendix objects', () => {
    const catalog = writerCitationCatalog([
      { document_id: 'adr-source', page: 1, quote: question },
      { document_id: 'adr-source', page: 27, quote: disposition },
    ], pages, index);
    expect(catalog).toHaveLength(2);
    expect(catalog.every(c => typeof c.writer_ref_id === 'string' && c.writer_ref_id.length > 8)).toBe(true);
    const draft = `“${question}” [CITE ${catalog[0].writer_ref_id}]\n\n“${disposition}” [CITE ${catalog[1].writer_ref_id}]`;
    const bound = resolveWriterCitationReferences(draft, catalog);
    expect(bound.value).toBe(`“${question}” [DOC 1 p.1]\n\n“${disposition}” [DOC 1 p.27]`);
    expect(bound.citations.map(c => [c.document_id, c.page, c.writer_ref_id])).toEqual([
      ['adr-source', 1, catalog[0].writer_ref_id],
      ['adr-source', 27, catalog[1].writer_ref_id],
    ]);
    const payload: any = { case: {}, documents: [{ id: 'adr-source', doc_n: 1, canonical_source_id: 'adr-source' }],
      report: { executive_summary: bound.value, citations: bound.citations,
        full_report: { pre_release_source_pages: pages } } };
    expect(auditReportCitationIntegrity(payload).ok).toBe(true);
  });

  it('blocks an invented identity, unsupported assertion, and raw Writer page references', () => {
    const catalog = writerCitationCatalog([{ document_id: 'adr-source', page: 27, quote: disposition }], pages, index);
    expect(() => resolveWriterCitationReferences(`“${disposition}” [CITE unknown]`, catalog)).toThrow();
    expect(() => resolveWriterCitationReferences(`Se admite el recurso. [CITE ${catalog[0].writer_ref_id}]`, catalog)).toThrow();
    expect(() => resolveWriterCitationReferences(`“${disposition}” [DOC 1 p.27]`, catalog)).toThrow();
    expect(() => resolveWriterCitationReferences('DOC 1 p.27', catalog)).toThrow();
  });
});
