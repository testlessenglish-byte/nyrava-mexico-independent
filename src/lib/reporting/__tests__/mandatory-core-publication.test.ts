import { describe, it, expect } from "vitest";
import {
  completedCoreCitations,
  completedFindingsCitations,
  createCanonicalCitation,
  findingCitationReviews,
} from "../citation-production";
import { composeFinalReportPayload, validateFinalReportContract } from "../final-report-contract";
import {
  decisionCoreAtoms,
  alignDecisionCoreFindings,
} from "../../intelligence/mandatory-decision-core";
import { groundedDecisionSummary } from "../../intelligence/decision-summary";
import { supportInput } from "../../intelligence/claim-support-review";
const question =
  "¿El artículo 146, fracción II, inciso b), del Código, es contrario a los supuestos de detención por flagrancia contemplados en el artículo 16 constitucional?";
function fixture(materia = "penal"): any {
  const pages = [
    { document_id: "doc", page: 2, text: question },
    {
      document_id: "doc",
      page: 3,
      text: "Antecedentes procesales del recurso interpuesto por la parte recurrente.",
    },
  ];
  const refs = [
    {
      document_id: "doc",
      page: 2,
      quote: question,
      verification_status: "unverified",
      publication_status: "QUARANTINED",
    },
    { document_id: "doc", page: 3, quote: pages[1].text },
    { document_id: "doc", page: 4, quote: "Texto sin ubicación acreditada." },
  ];
  const core = {
    id: "core-question",
    kind: "CONTROLLING_ISSUE",
    text: question,
    speaker_role: "scjn",
    proposition_type: "issue",
    adoption_status: "unresolved",
    source_refs: refs,
  };
  const f: any = {
    id: "issue-finding",
    case_id: "case",
    execution_id: "run",
    title: "Cuestión controlante",
    description: question,
    source_module: "decision_core",
    source_document_id: "doc",
    source_page: 2,
    source_quote: question,
    speaker_role: "scjn",
    proposition_type: "issue",
    adoption_status: "unresolved",
    verification_status: "verified",
    finding_status: "verified",
    evidence_refs: refs,
    metadata: { mandatory_decision_core_id: core.id, mandatory_decision_kind: core.kind },
  };
  f.metadata.semantic_support_review = {
    version: 1,
    verdict: "supported",
    hash: supportInput(f, pages).hash,
    supporting_quote: question,
    reason: "La fuente formula expresamente esta pregunta, sin decidir su respuesta.",
  };
  return {
    f,
    core,
    pages,
    index: [{ document_id: "doc", doc_n: 1, canonical_source_id: "source" }],
    input: {
      case: {
        id: "case",
        execution_id: "run",
        case_type: materia,
        case_analysis_mode: "concluded_audit",
        procedural_posture: "concluded",
        report_language: "es",
      },
      documents: [
        { id: "doc", doc_n: 1, canonical_source_id: "source", filename: "sentencia.pdf" },
      ],
      findings: [f],
      agents: [],
      analysis: null,
      score: null,
      report: {
        report_mode: "LIMITED",
        executive_summary: "",
        full_report: {
          pre_release_source_pages: pages,
          mandatory_decision_core: { items: [core] },
        },
      },
    },
  };
}
describe("finding proof registry remains authoritative", () => {
  it("withholds a changed full input even if caller metadata was stripped", () => {
    const { f, pages, index } = fixture();
    const reviewed = structuredClone(f);
    delete f.metadata.semantic_support_review;
    f.legal_significance = "A different legal assertion.";
    f.evidence_refs = [{ document_id: "doc", page: 2, quote: question }];
    expect(completedFindingsCitations([f], pages, index, [reviewed])).toEqual([]);
  });
  it("does not publish literal secondary support when the current review is insufficient", () => {
    const { f, pages, index } = fixture();
    f.metadata.semantic_support_review.verdict = "insufficient";
    f.evidence_refs = [{ document_id: "doc", page: 2, quote: question }];
    expect(completedFindingsCitations([f], pages, index)).toEqual([]);
  });
});
describe("mandatory citation explicit identity", () => {
  it.each(["finding_id", "claim_id", "proposition_id", "case_id", "execution_id"])(
    "rejects a conflicting %s without relabeling it",
    (key) => {
      const { f, core, pages, index } = fixture();
      core.source_refs[0][key] = "other";
      const [out] = completedCoreCitations([core], [f], pages, index);
      expect(out.source_refs).toEqual([]);
      expect(out.metadata.citation_diagnostics[0][key]).toBe("other");
      expect(out.certification_error).toBe("CORE_PROPOSITION_NOT_CERTIFIED");
    },
  );
});
describe("mandatory core publication uses current independently certified propositions", () => {
  it("keeps a wrapped controlling question as one unchanged atom", () =>
    expect(decisionCoreAtoms(question.replace("es contrario", "es\ncontrario"))).toEqual([
      question,
    ]));
  it("clears approvals when core alignment changes its proposition", () => {
    const { f, core } = fixture();
    const old = {
      ...f,
      description: "¿Otra pregunta?",
      metadata: { ...f.metadata, published_claim: { publication_status: "APPROVED" } },
    };
    const [current] = alignDecisionCoreFindings([old], [core], "es");
    expect(current.metadata.semantic_support_review).toBeUndefined();
    expect(current.metadata.published_claim).toBeUndefined();
  });
  it("certifies the current issue without requiring an answer and omits raw secondary refs", () => {
    const { f, core, pages, index } = fixture();
    const [out] = completedCoreCitations([core], [f], pages, index);
    expect(out.source_refs).toHaveLength(1);
    expect(out.source_refs[0]).toMatchObject({
      verification_status: "verified",
      proposition_supported: question,
      source_location_verified: true,
    });
    expect(out.source_refs[0].writer_ref_id).toMatch(/^cite_/);
    expect(out.certification_error).toBeUndefined();
    const [finding] = completedFindingsCitations([f], pages, index);
    expect(finding.evidence_refs).toHaveLength(1);
    expect(finding.evidence_refs[0].proposition_supported).toBe(question);
    expect(finding.metadata.citation_diagnostics.length).toBe(2);
  });
  it("does not certify a mandatory atom from location or literal text alone", () => {
    const { core, pages, index } = fixture();
    const [out] = completedCoreCitations([core], [], pages, index);
    expect(out.source_refs).toEqual([]);
    expect(out.certification_error).toBe("CORE_PROPOSITION_NOT_CERTIFIED");
    expect(out.text).toBe(question);
  });
  it("does not reuse a cached canonical citation without the corresponding current core review", () => {
    const { f, core, pages, index } = fixture();
    const citation = createCanonicalCitation(
      { document_id: "doc", page: 2, quote: question },
      question,
      pages,
      index,
      findingCitationReviews([f])[0],
    )!;
    const cached = { ...citation };
    delete cached.proposition_verification;
    expect(completedCoreCitations([core], [], pages, index, [cached])[0].source_refs).toEqual([]);
  });
  it("cannot promote an exact party quotation to an adopted court holding", () => {
    const { f, core, pages, index } = fixture();
    const quote = "El recurrente sostiene que se debe confirmar la sentencia recurrida.";
    f.title = quote;
    f.description = quote;
    f.source_quote = quote;
    f.speaker_role = "quejoso";
    f.proposition_type = "allegation";
    f.adoption_status = "party_position";
    pages[0].text = quote;
    f.metadata.semantic_support_review = {
      version: 1,
      verdict: "supported",
      hash: supportInput(f, pages).hash,
      supporting_quote: quote,
    };
    core.text = quote;
    core.kind = "COURT_HOLDING";
    core.proposition_type = "holding";
    core.adoption_status = "adopted";
    core.source_refs = [{ document_id: "doc", page: 2, quote }];
    expect(completedCoreCitations([core], [f], pages, index)[0].source_refs).toEqual([]);
  });
  it("retains rejected source diagnostics through repeated producer calls", () => {
    const { f, core, pages, index } = fixture();
    const first = completedCoreCitations([core], [f], pages, index);
    expect(
      completedCoreCitations(first, [f], pages, index)[0].metadata.citation_diagnostics,
    ).toHaveLength(2);
    const findings = completedFindingsCitations([f], pages, index);
    expect(
      completedFindingsCitations(findings, pages, index)[0].metadata.citation_diagnostics,
    ).toHaveLength(2);
  });
  it("independently certifies a literal secondary source for the same current assertion", () => {
    const { f, pages, index } = fixture();
    pages[1].text = question;
    f.evidence_refs[1] = { document_id: "doc", page: 3, quote: question };
    const [out] = completedFindingsCitations([f], pages, index);
    expect(out.evidence_refs).toHaveLength(2);
    expect(out.evidence_refs[1].proposition_supported).toBe(question);
    expect(out.evidence_refs[1].proposition_verification).toBeUndefined();
  });
  it("does not certify a different secondary assertion or a changed full finding input", () => {
    const { f, pages, index } = fixture();
    f.evidence_refs[1].proposition_supported = pages[1].text;
    expect(completedFindingsCitations([f], pages, index)[0].evidence_refs).toHaveLength(1);
    const original = structuredClone(f);
    f.legal_significance = "A new unreviewed legal consequence.";
    expect(completedFindingsCitations([f], pages, index, [original])).toEqual([]);
  });
  it("withholds findings with no certified current support", () => {
    const { f, pages, index } = fixture();
    f.metadata.semantic_support_review.hash = "stale";
    expect(completedFindingsCitations([f], pages, index)).toEqual([]);
  });
  it("summary refuses raw source-location-only references", () => {
    const { core, index } = fixture();
    core.source_refs = core.source_refs.map((r: any) => ({ ...r, source_location_verified: true }));
    expect(groundedDecisionSummary([core], index)).toBe("");
  });
  it.each(["penal", "familiar", "administrativo"])(
    "publishes exact certified issue and summary universally in %s",
    (materia) => {
      const { input } = fixture(materia);
      const out = composeFinalReportPayload(input);
      expect(out.findings).toHaveLength(1);
      expect(out.findings![0].evidence_refs).toHaveLength(1);
      expect(
        (out.report!.full_report as any).mandatory_decision_core.items[0].source_refs,
      ).toHaveLength(1);
      expect(out.report!.executive_summary).toContain(question);
      expect(out.report!.executive_summary).toContain("[DOC 1 p.2]");
      expect(validateFinalReportContract(out).blocking_errors).toEqual([]);
    },
  );
  it("preserves the authoritative core review snapshot through actual PDF preflight", async () => {
    const { f, input } = fixture();
    input.findings = [];
    const projected = composeFinalReportPayload(input, [f]);
    const { prepareFinalReportForRelease } = await import("../../export");
    const rendered = await prepareFinalReportForRelease(projected);
    expect(validateFinalReportContract(rendered).blocking_errors).toEqual([]);
    expect(
      (rendered.report!.full_report as any).mandatory_decision_core.items[0].source_refs[0]
        .proposition_supported,
    ).toBe(question);
  });
  it("keeps release blocked when a mandatory atom has no current supporting review", () => {
    const { input } = fixture();
    input.findings[0].metadata.semantic_support_review.hash = "stale";
    const out = composeFinalReportPayload(input);
    expect(validateFinalReportContract(out).blocking_errors.join(" ")).toContain(
      "atomic_binding_missing",
    );
    expect((out.report!.full_report as any).mandatory_decision_core.items[0].text).toBe(question);
  });
});
