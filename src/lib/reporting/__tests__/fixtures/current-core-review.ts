import {
  supportInput,
  type SupportClaim,
  type SupportPage,
} from "../../../intelligence/claim-support-review";
import { composeFinalReportPayload, releaseFinalReportPayload } from "../../final-report-contract";
import type { CaseExportData } from "../../../export";

type SyntheticCoreClaim = SupportClaim & { core_id: string };
const snapshots = new WeakMap<object, Record<string, any>[]>();

/** Test-only reviewer verdicts for explicitly supplied, hand-checked synthetic
 * atoms. This does not infer support, split arbitrary claims, or approve inputs
 * after mutation. The snapshot keeps the original source-context hash. */
export function currentCoreReview(claim: SyntheticCoreClaim, pages: readonly SupportPage[]) {
  const { core_id, ...fields } = claim;
  const quote = fields.source_quote ?? "";
  const input = supportInput(fields, pages);
  if (
    quote.length < 20 ||
    !input.context.includes(quote.normalize("NFC").replace(/\s+/g, " ").trim())
  )
    throw new Error("Synthetic supported verdict requires its exact physical source passage");
  return {
    ...fields,
    source_module: "decision_core",
    verification_status: "verified",
    finding_status: "verified",
    evidence_refs: [{ document_id: fields.source_document_id, page: fields.source_page, quote }],
    metadata: {
      mandatory_decision_core_id: core_id,
      semantic_support_review: {
        version: 1,
        verdict: "supported",
        reason: "Explicit supported verdict for this hand-checked synthetic regression atom.",
        supporting_quote: quote,
        hash: input.hash,
      },
    },
  };
}

export function registerCurrentCoreReviews<T extends CaseExportData>(
  input: T,
  claims: SyntheticCoreClaim[],
): T {
  const pages = (input.report?.full_report as any).pre_release_source_pages as SupportPage[];
  snapshots.set(
    input,
    claims.map((claim) => currentCoreReview(claim, pages)),
  );
  return input;
}
export function fixtureReviewSnapshot(input: CaseExportData) {
  return snapshots.get(input) ?? input.findings;
}
export function composeReviewedFixture(input: CaseExportData) {
  const reviews = fixtureReviewSnapshot(input);
  const output = composeFinalReportPayload(input, reviews);
  snapshots.set(output, reviews ?? []);
  return output;
}
export function releaseReviewedFixture(input: CaseExportData) {
  return releaseFinalReportPayload(input, fixtureReviewSnapshot(input));
}
