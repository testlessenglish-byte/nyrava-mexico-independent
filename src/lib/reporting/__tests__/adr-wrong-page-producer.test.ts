import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createCanonicalCitation, resolveWriterCitationReferences, writerCitationCatalog } from '../citation-production';

// The private ADR capture is supplied locally for replay and never committed.
describe.skipIf(!process.env.NYRAVA_RELEASE_REPLAY)('ADR 7286/2017 authoritative citation page', () => {
  const saved = process.env.NYRAVA_RELEASE_REPLAY
    ? JSON.parse(readFileSync(process.env.NYRAVA_RELEASE_REPLAY, 'utf8')) : null;

  it('renders the verified damage-rule citation on page 4 and blocks the Writer-invented page 9', () => {
    const ref = saved.reports[0].citations.find((citation: any) =>
      citation.page === 4 && /daño moral por regla general debe ser probado/i.test(citation.quote));
    expect(ref).toBeDefined();
    const pages = saved.document_pages;
    const index = saved.documents.map((doc: any, i: number) => ({
      document_id: doc.id, doc_n: i + 1, canonical_source_id: doc.canonical_source_id,
    }));
    expect(createCanonicalCitation(ref, ref.quote, pages, index)).toMatchObject({ page: 4 });
    expect(createCanonicalCitation({ ...ref, page: 9, page_number: 9, page_located: 9, label: 'p.9',
      page_extraction_ref: `${ref.document_id}:9` }, ref.quote, pages, index)).toBeNull();

    const catalog = writerCitationCatalog([ref], pages, index);
    expect(catalog).toHaveLength(1);
    const sourceBound = resolveWriterCitationReferences(`“${ref.quote}” [CITE ${catalog[0].writer_ref_id}]`, catalog);
    expect(sourceBound.value).toContain('[DOC 1 p.4]');
    expect(sourceBound.citations).toMatchObject([{ document_id: ref.document_id, page: 4 }]);
    expect(() => resolveWriterCitationReferences(`“${ref.quote}” [DOC 1 p.9]`, catalog))
      .toThrow('REPORT_WRITER_CITATION_UNRESOLVED');
  });
});
