import { beforeEach, describe, expect, it, vi } from "vitest";
import { reconcileCaseFindingsClaims } from "../claim-level-reconciliation.server";
import { attributeFindingsFromSource } from "../source-speaker-provenance";
import {
  supportInput,
  invalidateChangedFindingReview,
  restoreFindingSourceContext,
} from "../claim-support-review";
import { reviewClaimSupport } from "../claim-support-review.server";
import {
  composeFinalReportPayload,
  validateFinalReportContract,
} from "../../reporting/final-report-contract";
const provider = vi.hoisted(() => vi.fn());
vi.mock("../../groq.server", () => ({
  callGroq: provider,
  parseJsonLoose: (text: string) => JSON.parse(text),
}));
beforeEach(() => provider.mockReset());

function finding(): any {
  return {
    id: "finding",
    case_id: "case",
    execution_id: "execution",
    title: "Omisión en el análisis del derecho de defensa",
    description:
      "Los recurrentes sostuvieron que el Tribunal Colegiado no realizó un análisis del derecho fundamental de defensa.",
    source_document_id: "doc",
    source_page: 2,
    source_quote:
      "El Tribunal Colegiado omitió realizar una interpretación del artículo 17 constitucional, consistente en el derecho fundamental de defensa.",
    speaker_role: "quejoso",
    proposition_type: null,
    adoption_status: null,
    severity: "high",
    finding_status: "verified",
    verification_status: "verified",
    verified_at: "old",
    metadata: {
      execution_id: "execution",
      semantic_support_review: { version: 1, verdict: "supported", hash: "old-review" },
      published_claim: {
        claim_id: "finding",
        publication_status: "APPROVED",
        canonical_title: "La SCJN declaró la violación",
        canonical_description: "La SCJN declaró una violación constitucional.",
      },
    },
    evidence_refs: [],
  };
}
function database(input: any) {
  let stored = structuredClone(input);
  const writes: any[] = [];
  const db: any = {
    from: (table: string) => {
      if (table !== "case_findings") throw new Error("Unexpected table " + table);
      return {
        select: () => {
          const query: any = {
            eq: () => query,
            then: (resolve: any) =>
              Promise.resolve({ data: [structuredClone(stored)], error: null }).then(resolve),
          };
          return query;
        },
        update: (patch: any) => ({
          eq: async () => {
            writes.push(structuredClone(patch));
            stored = { ...stored, ...structuredClone(patch) };
            return { error: null };
          },
        }),
      };
    },
  };
  return {
    db,
    writes,
    get row() {
      return stored;
    },
  };
}
function report(f: any, pages: any[]): any {
  f.evidence_refs = [{ document_id: "doc", page: 2, quote: f.source_quote }];
  return {
    case: { id: "case", execution_id: "execution", case_type: "familiar", report_language: "es" },
    findings: [f],
    documents: [{ id: "doc", doc_n: 1, canonical_source_id: "source", filename: "source.pdf" }],
    agents: [],
    analysis: null,
    score: null,
    report: {
      report_mode: "LIMITED",
      executive_summary:
        "El informe recoge las proposiciones verificadas del documento aportado para revisión jurídica.",
      full_report: { pre_release_source_pages: pages },
    },
  };
}
describe("current finding review/publication lifecycle", () => {
  it("a later metadata-only merge cannot restore an invalidated approval", () => {
    const original = finding();
    const repaired = invalidateChangedFindingReview(original, {
      ...original,
      proposition_type: "allegation",
      adoption_status: "party_position",
    });
    const merged = invalidateChangedFindingReview(repaired, {
      ...repaired,
      lifecycle_status: "superseded",
      metadata: { ...original.metadata, superseded_by: "primary" },
    });
    expect(merged.metadata.semantic_support_review).toBeUndefined();
    expect(merged.metadata.published_claim).toBeUndefined();
    expect(merged.metadata.superseded_by).toBe("primary");
  });
  it("restoring a source page invalidates its previous claim review and publication", () => {
    const f = { ...finding(), source_page: null };
    const current = restoreFindingSourceContext(f, [
      { document_id: "doc", page: 2, text: f.source_quote },
    ]);
    expect(current.source_page).toBe(2);
    expect(current.metadata.semantic_support_review).toBeUndefined();
    expect(current.metadata.published_claim).toBeUndefined();
  });
  it("claim reconciliation preserves a prior final-narrative block", async () => {
    const store = database(finding());
    await reconcileCaseFindingsClaims(store.db, "case", "execution", { syncReport: false });
    const f = store.row,
      pages = [{ document_id: "doc", page: 2, text: f.source_quote }];
    f.metadata.semantic_support_review = {
      version: 1,
      verdict: "supported",
      hash: supportInput(f, pages).hash,
      supporting_quote: f.source_quote,
    };
    f.verification_status = "verified";
    const writes: any[] = [];
    const blocked = {
      executive_summary: "Revisión del documento aportado.",
      full_report: {},
      quality_blocked: true,
      quality_block_reasons: ["Final narrative has unsupported assertions."],
    };
    const db: any = {
      from: (table: string) =>
        table === "case_findings"
          ? store.db.from(table)
          : {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: blocked }) }) }),
              update: (patch: any) => ({
                eq: async () => {
                  writes.push(patch);
                  return { error: null };
                },
              }),
            },
    };
    await reconcileCaseFindingsClaims(db, "case", "execution");
    expect(writes[0].quality_blocked).toBe(true);
    expect(writes[0].quality_block_reasons).toContain(
      "Final narrative has unsupported assertions.",
    );
  });

  it("reconciliation does not publish or release a repaired case before semantic review", async () => {
    const stored = database(finding()),
      caseWrites: any[] = [],
      reportWrites: any[] = [];
    const saved = {
      executive_summary: "Revisión del documento aportado.",
      full_report: {},
      quality_block_reasons: [],
    };
    const db: any = {
      from: (table: string) => {
        if (table === "case_findings") return stored.db.from(table);
        if (table === "reports")
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: saved }) }) }),
            update: (patch: any) => ({
              eq: async () => {
                reportWrites.push(patch);
                return { error: null };
              },
            }),
          };
        if (table === "cases")
          return {
            update: (patch: any) => ({
              eq: async () => {
                caseWrites.push(patch);
                return { error: null };
              },
            }),
          };
        throw new Error("Unexpected table");
      },
    };
    await reconcileCaseFindingsClaims(db, "case", "execution");
    expect(caseWrites.some((p) => p.status === "released")).toBe(false);
    expect(reportWrites[0].full_report.verification_status).not.toBe("RELEASED");
    expect(reportWrites[0].quality_blocked).toBe(true);
  });
  it("an unchanged reconciled finding retains its fresh review on a second pass", async () => {
    const store = database(finding());
    await reconcileCaseFindingsClaims(store.db, "case", "execution", { syncReport: false });
    const pages = [{ document_id: "doc", page: 2, text: store.row.source_quote }];
    const review = {
      version: 1,
      verdict: "supported",
      hash: supportInput(store.row, pages).hash,
      supporting_quote: store.row.source_quote,
      reason: "Current review.",
    };
    store.row.metadata.semantic_support_review = review;
    store.row.verification_status = "verified";
    const again = await reconcileCaseFindingsClaims(store.db, "case", "execution", {
      syncReport: false,
    });
    expect(again.activeFindings[0].metadata.semantic_support_review).toEqual(review);
    expect(store.row.verification_status).toBe("verified");
  });
  it.each(["insufficient", "contradicted"])(
    "does not publish a %s fresh semantic review",
    async (verdict) => {
      const store = database(finding());
      await reconcileCaseFindingsClaims(store.db, "case", "execution", { syncReport: false });
      const f = store.row,
        pages = [{ document_id: "doc", page: 2, text: f.source_quote }];
      provider.mockResolvedValue({
        text: JSON.stringify({
          reviews: [
            {
              id: "finding",
              verdict,
              reason: "Support not established.",
              supporting_quote: f.source_quote,
            },
          ],
        }),
      });
      const reviews = await reviewClaimSupport([f], pages, "user");
      f.metadata.semantic_support_review = reviews.get("finding");
      f.verification_status = "unverified";
      expect(reviews.get("finding")?.verdict).toBe(verdict);
      expect(() => composeFinalReportPayload(report(f, pages))).toThrow(
        "REPORT_SUBSTANTIVE_CONTENT_MISSING",
      );
    },
  );

  it("invalidates old review and publication in both stored and returned reclassified findings", async () => {
    const original = finding(),
      store = database(original);
    const result = await reconcileCaseFindingsClaims(store.db, "case", "execution", {
      syncReport: false,
    });
    expect(result.reclassifiedCount, JSON.stringify(result.diagnostics)).toBe(1);
    for (const current of [store.row, result.activeFindings[0]]) {
      expect(current.metadata.semantic_support_review).toBeUndefined();
      expect(current.metadata.published_claim).toBeUndefined();
      expect(current.verification_status).not.toBe("verified");
      expect(current.verified_at).toBeNull();
      expect(current.proposition_type).toBe("allegation");
    }
    expect(original.metadata.semantic_support_review.hash).toBe("old-review");
  });
  it("invalidates old approval when a compound finding is repaired", async () => {
    const f = finding();
    f.title = "Privación ilegal de la libertad";
    f.description =
      "El quejoso permaneció privado de la libertad cuatro meses, lo que vulnera flagrantemente sus derechos humanos constitucionales.";
    f.source_quote = "permaneció cuatro meses bajo medida cautelar de privación de la libertad";
    f.audit_classification = "SUPPORTED_INFERENCE";
    f.finding_type = "DIRECT_EVIDENCE";
    const store = database(f);
    const result = await reconcileCaseFindingsClaims(store.db, "case", "execution", {
      syncReport: false,
    });
    expect(result.repairedCount).toBe(1);
    expect(store.row.description).not.toContain("vulnera flagrantemente");
    expect(store.row.metadata.semantic_support_review).toBeUndefined();
    expect(store.row.metadata.published_claim).toBeUndefined();
  });
  it("invalidates the cached publication when source attribution changes", () => {
    const f = finding();
    f.description =
      "El Tribunal Colegiado omitió realizar una interpretación del artículo 17 constitucional.";
    const pages = [
      {
        document_id: "doc",
        page: 2,
        text: "Los recurrentes alegan una omisión. " + f.source_quote,
      },
    ];
    const [current] = attributeFindingsFromSource([f], pages);
    expect(current.speaker_role).toBe("quejoso");
    expect(current.metadata.semantic_support_review).toBeUndefined();
    expect(current.metadata.published_claim).toBeUndefined();
    expect(current.verified_at).toBeNull();
  });
  it("publishes the current reviewed proposition instead of a stale cached claim", () => {
    const f = finding();
    f.speaker_role = "quejoso";
    f.proposition_type = "allegation";
    f.adoption_status = "party_position";
    const pages = [{ document_id: "doc", page: 2, text: f.source_quote }];
    f.metadata.semantic_support_review = {
      version: 1,
      verdict: "supported",
      hash: supportInput(f, pages).hash,
      supporting_quote: f.source_quote,
      reason: "Current review.",
    };
    const input = report(f, pages),
      original = structuredClone(input),
      out = composeFinalReportPayload(input);
    expect(out.findings![0].description).toBe(f.description);
    expect(out.findings![0].title).toBe(f.title);
    expect(out.findings![0].evidence_refs[0].proposition_supported).toBe(f.description);
    expect(validateFinalReportContract(out).blocking_errors).toEqual([]);
    expect(input).toEqual(original);
  });
  it("a fresh supported review after reclassification can certify the current proposition", async () => {
    const store = database(finding());
    await reconcileCaseFindingsClaims(store.db, "case", "execution", { syncReport: false });
    const f = store.row,
      pages = [{ document_id: "doc", page: 2, text: f.source_quote }];
    provider.mockResolvedValue({
      text: JSON.stringify({
        reviews: [
          {
            id: "finding",
            verdict: "supported",
            reason: "Party allegation, not judicial adoption.",
            supporting_quote: f.source_quote,
          },
        ],
      }),
    });
    const reviews = await reviewClaimSupport([f], pages, "user");
    expect(reviews.get("finding")?.verdict).toBe("supported");
    expect(reviews.get("finding")?.hash).not.toBe("old-review");
    f.metadata.semantic_support_review = reviews.get("finding");
    f.verification_status = "verified";
    const out = composeFinalReportPayload(report(f, pages));
    expect(out.findings![0].evidence_refs[0].proposition_supported).toBe(f.description);
    expect(validateFinalReportContract(out).blocking_errors).toEqual([]);
  });
});
