import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyEvidenceGate, completeEvidenceCitation } from '../evidence-gate.server';
import { buildGroundingCorpus } from '../grounding.server';
import { completePerspectiveKeyEvidence } from '../litigation.server';

describe.skipIf(!process.env.NYRAVA_RELEASE_REPLAY)('captured producer citation shapes', () => {
  it('keeps physical source verification on a theory citation before persistence', () => {
    const captured = JSON.parse(readFileSync(process.env.NYRAVA_RELEASE_REPLAY!, 'utf8'));
    const theory = captured.reports[0].full_report.reviewed_sections.theories[0];
    const located = theory.citations.find((ref: any) => Number.isInteger(ref.page));
    const unresolved = theory.citations.find((ref: any) => !Number.isInteger(ref.page));
    expect(Boolean(located && unresolved)).toBe(true);
    const corpus = buildGroundingCorpus(
      captured.documents.map((doc: any) => ({ id: doc.id, filename: doc.filename, extracted_text: doc.extracted_text })),
      3000,
      captured.document_pages,
    );
    const gated = applyEvidenceGate([{ title: 'Teoría documentada', description: theory.narrative,
      citations: theory.citations, confidence: theory.confidence }], { mode: 'exploratory', corpus }).items;
    expect(gated).toHaveLength(1);
    const completed = gated[0].citations.find((ref: any) => ref.quote === located.quote);
    const stillUnresolved = gated[0].citations.find((ref: any) => ref.quote === unresolved.quote);
    expect(completed?.document_id === located.document_id && completed?.page === located.page &&
      completed?.proposition_supported === located.quote && completed?.verification_status === 'verified').toBe(true);
    expect(gated[0].source_page === located.page && gated[0].source_quote === located.quote).toBe(true);
    expect(stillUnresolved?.quote === unresolved.quote && !stillUnresolved?.proposition_supported &&
      stillUnresolved?.verification_status !== 'verified').toBe(true);
  });

  it('completes perspective key-evidence citations without dropping source-backed items', () => {
    const captured = JSON.parse(readFileSync(process.env.NYRAVA_RELEASE_REPLAY!, 'utf8'));
    const perspective = captured.reports[0].full_report.reviewed_sections.perspectives.find(
      (row: any) => Array.isArray(row.key_evidence) && row.key_evidence.length > 0,
    );
    expect(perspective).toBeDefined();
    const corpus = buildGroundingCorpus(
      captured.documents.map((doc: any) => ({ id: doc.id, filename: doc.filename, extracted_text: doc.extracted_text })),
      3000,
      captured.document_pages,
    );
    const completed = completePerspectiveKeyEvidence(perspective.key_evidence, corpus);
    expect(Array.isArray(completed) && completed.length === perspective.key_evidence.length &&
      completed.every((item: any, i: number) => item.citation?.quote === perspective.key_evidence[i].citation.quote &&
        item.citation?.proposition_supported === item.citation?.quote &&
        item.citation?.verification_status === 'verified')).toBe(true);
  });
});

describe('producer citation verification', () => {
  const quote = 'El tribunal confirmó la sentencia recurrida mediante resolución definitiva.';
  const corpus = buildGroundingCorpus([
    { id: 'doc-a', filename: 'decision.pdf', extracted_text: quote },
    { id: 'doc-b', filename: 'other.pdf', extracted_text: 'El documento B trata otro asunto.' },
  ], 3000, [
    { document_id: 'doc-a', page: 27, text: quote },
    { document_id: 'doc-b', page: 27, text: 'El documento B trata otro asunto.' },
  ]);

  it('preserves provenance and corrects a stale page only through the exact physical passage', () => {
    const completed = completeEvidenceCitation({ id: 'citation-1', document_id: 'doc-a', doc_n: 1,
      page: 26, quote, chunk_index: 4, chunk_hash: 'existing-hash' }, corpus);
    expect(completed).toMatchObject({ id: 'citation-1', document_id: 'doc-a', doc_n: 1,
      page: 27, page_number: 27, proposition_supported: quote, verification_status: 'verified',
      chunk_index: 4, chunk_hash: 'existing-hash' });
  });

  it('retains wrong-document and false quotations unresolved for the release gate', () => {
    const wrongDocument = { id: 'wrong-document', document_id: 'doc-b', doc_n: 2, page: 27, quote };
    const falseQuote = { id: 'false-quote', document_id: 'doc-a', doc_n: 1, page: 27,
      quote: 'El tribunal revocó una sentencia que no aparece en el expediente.' };
    const first = completeEvidenceCitation(wrongDocument, corpus);
    const second = completeEvidenceCitation(falseQuote, corpus);
    expect(first.id === wrongDocument.id && first.quote === quote && first.verification_status !== 'verified' &&
      second.id === falseQuote.id && second.quote === falseQuote.quote && second.verification_status !== 'verified').toBe(true);
  });

  it('does not override an explicitly unverified citation or a conflicting claimed proposition', () => {
    const pending = completeEvidenceCitation({ document_id: 'doc-a', doc_n: 1, page: 27, quote,
      verification_status: 'unverified' }, corpus);
    const conflicting = completeEvidenceCitation({ document_id: 'doc-a', doc_n: 1, page: 27, quote,
      proposition_supported: 'El tribunal revocó la sentencia.' }, corpus);
    expect(pending.verification_status === 'unverified' && !pending.proposition_supported &&
      conflicting.proposition_supported === 'El tribunal revocó la sentencia.' &&
      conflicting.verification_status !== 'verified').toBe(true);
  });
});
