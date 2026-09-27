import { describe, expect, it } from 'vitest';
import { auditReportCitationIntegrity } from '../citation-integrity';
import { createCanonicalCitation } from '../citation-production';

const quote = 'Se desecha por improcedente el recurso de revisión a que este toca se refiere.';
const pages = [{ document_id: 'doc-1', filename: 'sentencia.pdf', page: 27, text: quote }];
const index = [{ document_id: 'doc-1', doc_n: 1, canonical_source_id: 'source-1' }];
const verified = { document_id: 'doc-1', doc_n: 1, canonical_source_id: 'source-1', page: 27,
  quote, proposition_supported: quote, verification_status: 'verified' };

function reasons(ref: Record<string, unknown>, documents: Array<Record<string, unknown>> = [
  { id: 'doc-1', doc_n: 1, canonical_source_id: 'source-1' },
]) {
  return auditReportCitationIntegrity({
    case: {}, documents, analysis: null, agents: [], score: null, findings: [],
    report: { citations: [ref], full_report: { pre_release_source_pages: pages } },
  }).errors.join('\n');
}

describe('adversarial citation release gate', () => {
  it('accepts only the unmodified source-bound literal baseline', () => {
    expect(createCanonicalCitation(verified, quote, pages, index)).toMatchObject({
      document_id: 'doc-1', canonical_source_id: 'source-1', page: 27,
      proposition_supported: quote, verification_status: 'verified',
    });
    expect(reasons(verified)).toBe('');
  });

  it.each([
    ['fabricated document ID', { ...verified, document_id: 'invented', doc_n: undefined }, 'source_location_unverified'],
    ['fabricated DOC number', { ...verified, doc_n: 2 }, 'source_location_unverified'],
    ['fabricated page', { ...verified, page: 26 }, 'source_location_unverified'],
    ['fabricated quotation', { ...verified, quote: 'Resolución inventada.' }, 'source_location_unverified'],
    ['unsupported proposition', { ...verified, proposition_supported: 'Se admite el recurso.' }, 'proposition_not_supported'],
    ['missing proposition identity for a paraphrase', { ...verified,
      proposition_supported: 'La Corte admitió el recurso.', finding_id: undefined }, 'proposition_not_supported'],
    ['genuinely unresolved source location', { ...verified, page: undefined }, 'source_location_unverified'],
    ['real source cited for a different claim', { ...verified,
      proposition_supported: 'La Corte condenó al demandado.' }, 'proposition_not_supported'],
    ['LLM supplied proposition_supported=true', { ...verified,
      proposition_supported: true, proposition_verification: { review: { verdict: 'supported' } } }, 'proposition_supported_missing'],
  ])('%s remains blocked', (_label, ref, failure) => {
    expect(reasons(ref)).toContain(failure);
  });

  it('blocks a missing authoritative canonical source identity', () => {
    const documentWithoutCanonicalSource = [{ id: 'doc-1', doc_n: 1 }];
    expect(reasons({ ...verified, canonical_source_id: undefined }, documentWithoutCanonicalSource))
      .toContain('canonical_source_identity_unverified');
    expect(reasons({ ...verified, canonical_source_id: 'fabricated-source' }))
      .toContain('canonical_source_identity_unverified');
  });
});
