import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { scopedReviewPages } from '../../intelligence/review-source-snapshot.server';
import { supportInput, restoreFindingSourceContext } from '../../intelligence/claim-support-review';
import { reviewClaimSupport } from '../../intelligence/claim-support-review.server';
import { completedCoreCitations, writerCitationCatalog, assertWriterCitationReferences, findingCitationReviews } from '../citation-production';
import { auditReportCitationIntegrity } from '../citation-integrity';
import { composeFinalReportPayload, validateFinalReportContract } from '../final-report-contract';
import { validateRenderedReport } from '../../canonical/prerender-validate.server';
import { auditText } from '../../intelligence/mx-terminology';

// Opt-in local replay. Captured records and credentials are never committed.
describe.skipIf(!process.env.NYRAVA_RELEASE_REPLAY)('captured release artifact', () => {
  const data = process.env.NYRAVA_RELEASE_REPLAY ? JSON.parse(readFileSync(process.env.NYRAVA_RELEASE_REPLAY, 'utf8')) : null;
  it('replays the actual source context and preserves blocking of the old unsupported report', () => {
    const report = data.reports[0], core = report.full_report.mandatory_decision_core.items;
    expect(data.case_findings.filter((f: any) => f.source_module === 'decision_core').every((f: any) => f.source_page === null)).toBe(true);
    expect(validateRenderedReport(report, 'civil').filter(i => i.code === 'SPANISH_CASE_TYPE_LEAK')).toEqual([]);
    for (const page of data.document_pages)
      expect(auditText(page.text, { profile: 'civil', locale: 'es' }).filter(i => i.kind === 'us_jurisdiction_reference')).toEqual([]);
    const pages = scopedReviewPages({ pages: data.document_pages, documents: data.documents }) as any;
    const index = data.documents.map((d: any, i: number) => ({ document_id: d.id, doc_n: i + 1 }));
    const catalog = writerCitationCatalog([...report.citations, ...core.flatMap((c: any) => c.source_refs)], pages, index);
    expect(catalog.length).toBeGreaterThanOrEqual(report.citations.length);
    const regenerated = catalog.map(c => '“' + c.proposition_supported + '” [DOC ' + c.doc_n + ' p.' + c.page + ']').join('\n\n');
    expect(() => assertWriterCitationReferences(regenerated, catalog)).not.toThrow();
    const payload: any = { case: {}, documents: data.documents, report: { executive_summary: regenerated, citations: catalog,
      full_report: { pre_release_source_pages: pages } } };
    expect(auditReportCitationIntegrity(payload).ok).toBe(true);
    expect(auditReportCitationIntegrity({ ...payload, report }).ok).toBe(false);
  });
  it.skipIf(process.env.NYRAVA_LIVE_SOURCE_REVIEW !== '1')('uses the existing real semantic reviewer after restoring source pages', async () => {
    const pages = scopedReviewPages({ pages: data.document_pages, documents: data.documents }) as any;
    const core = data.reports[0].full_report.mandatory_decision_core.items;
    const findings = data.case_findings.filter((f: any) => f.source_module === 'decision_core').map((f: any) => {
      return restoreFindingSourceContext(f, pages);
    });
    findings.forEach((f: any) => expect(supportInput(f, pages).context).not.toBe(''));
    const cached = process.env.NYRAVA_REPLAY_REVIEW_CACHE ? JSON.parse(readFileSync(process.env.NYRAVA_REPLAY_REVIEW_CACHE, 'utf8')).verdicts : null;
    const reviewed = cached ? new Map<string, any>(findings.map((f: any) => [f.id, cached.find((v: any) => v.hash === supportInput(f, pages).hash)]))
      : await reviewClaimSupport(findings, pages, data.cases[0].user_id);
    for (const f of findings) {
      const verdict = reviewed.get(f.id)!;
      expect(verdict.verdict, verdict.reason).toBe('supported');
      f.metadata = { ...f.metadata, semantic_support_review: verdict };
      f.verification_status = 'verified';
    }
    const index = data.documents.map((d: any, i: number) => ({ document_id: d.id, doc_n: i + 1 }));
    const verifiedCore = completedCoreCitations(core, findings, pages, index);
    const citations = verifiedCore.flatMap(c => c.source_refs);
    expect(citations.every(c => c.verification_status === 'verified')).toBe(true);
    const payload: any = { case: {}, documents: data.documents, citation_review_registry: findingCitationReviews(findings), report: { citations,
      full_report: { pre_release_source_pages: pages, mandatory_decision_core: { items: verifiedCore } } } };
    const result = auditReportCitationIntegrity(payload);
    writeFileSync('work/release-live-review-result.json', JSON.stringify({ verdicts: [...reviewed.values()], citationAudit: result }, null, 2));
    expect(result.errors).toEqual([]);
    const finalPayload = composeFinalReportPayload({ ...payload, agents: [], analysis: null, score: null,
      case: { case_type: 'civil', case_analysis_mode: 'concluded_audit', report_language: 'es' },
      findings, report: { ...payload.report, report_mode: 'LIMITED', scores_suppressed: true, motions_suppressed: true,
        citations: writerCitationCatalog(citations, pages, index),
        full_report: { ...payload.report.full_report, source_audit: data.reports[0].full_report.source_audit },
        executive_summary: citations.map(c => '“' + c.quote + '” [DOC 1 p.' + c.page + ']').join('\n\n') } });
    const final = validateFinalReportContract(finalPayload);
    expect(final.blocking_errors).toEqual([]);
  }, 120000);
});
