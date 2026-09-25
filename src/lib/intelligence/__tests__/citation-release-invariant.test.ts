import { describe, it, expect } from "vitest";
import {
  reconcileCitationsAndDependentClaims,
  attemptCitationFuzzyOrPageOffset,
} from "../final-claim-publication";
import { resolveFinalReleaseDecision } from "../../reporting/final-release-decision";

describe("Priority #1 & #2 Release Invariant — Citation Verification and Claim Quarantine", () => {
  const pages = [
    {
      document_id: "doc-1",
      filename: "1_sentencia_amparo.pdf",
      page: 1,
      text: "VISTOS para resolver los autos del juicio de amparo directo 123/2022.",
    },
    {
      document_id: "doc-1",
      filename: "1_sentencia_amparo.pdf",
      page: 2,
      text: "La Justicia de la Unión ampara y protege a la parte quejosa contra el acto reclamado.",
    },
    {
      document_id: "doc-1",
      filename: "1_sentencia_amparo.pdf",
      page: 3,
      text: "PRIMERO. Se sobresee en el juicio respecto de las autoridades señaladas en el considerando segundo.",
    },
  ];

  const docIndex = [{ doc_n: 1, document_id: "doc-1" }];

  it("attempts fuzzy/page-offset verification and recovers quote when page offset by 1", () => {
    // Quote is on page 2, but citation claimed page 1
    const ref = {
      document_id: "doc-1",
      doc_n: 1,
      page: 1,
      quote: "La Justicia de la Unión ampara y protege a la parte quejosa contra el acto reclamado.",
    };

    const recovered = attemptCitationFuzzyOrPageOffset(ref, pages, docIndex);
    expect(recovered).not.toBeNull();
    expect(recovered?.page).toBe(2);
    expect(recovered?.quote).toBe("La Justicia de la Unión ampara y protege a la parte quejosa contra el acto reclamado.");
  });

  it("attempts fuzzy/whitespace-folded verification and recovers contiguous slice", () => {
    // Quote has newline / extra spaces not present in raw page text
    const ref = {
      document_id: "doc-1",
      doc_n: 1,
      page: 2,
      quote: "La  Justicia de la Unión\n  ampara y protege",
    };

    const recovered = attemptCitationFuzzyOrPageOffset(ref, pages, docIndex);
    expect(recovered).not.toBeNull();
    expect(recovered?.page).toBe(2);
    expect(recovered?.quote).toBe("La Justicia de la Unión ampara y protege");
  });

  it("quarantines unsupported claim when citation fails all verification (CLEAN TEST 3 regression scenario)", async () => {
    const verifiedFinding = {
      id: "finding-1",
      title: "Concesión del amparo",
      description: "El tribunal ampara y protege al quejoso.",
      speaker_role: "quejoso",
      source_document_id: "doc-1",
      source_page: 2,
      source_quote: "La Justicia de la Unión ampara y protege a la parte quejosa contra el acto reclamado.",
      evidence_refs: [
        {
          document_id: "doc-1",
          doc_n: 1,
          page: 2,
          quote: "La Justicia de la Unión ampara y protege a la parte quejosa contra el acto reclamado.",
        },
      ],
    };

    // Unsupported finding with completely bogus quote (Cita 24 equivalent)
    const failedFinding = {
      id: "finding-2",
      title: "Violación inexistente",
      description: "La autoridad cometió una violación procesal grave no demostrada.",
      speaker_role: "quejoso",
      source_document_id: "doc-1",
      source_page: 99,
      source_quote: "Cita totalmente inexistente que jamás ocurrió en el documento fuente.",
      evidence_refs: [
        {
          document_id: "doc-1",
          doc_n: 1,
          page: 99,
          quote: "Cita totalmente inexistente que jamás ocurrió en el documento fuente.",
        },
      ],
    };

    const reportRow: Record<string, any> = {
      id: "report-123",
      case_id: "case-123",
      findings_count: 2,
      executive_summary: "Resumen inicial con dos hallazgos.",
      citations: [
        {
          id: "cite-1",
          document_id: "doc-1",
          doc_n: 1,
          page: 2,
          quote: "La Justicia de la Unión ampara y protege a la parte quejosa contra el acto reclamado.",
          finding_id: "finding-1",
        },
        {
          id: "cite-24",
          document_id: "doc-1",
          doc_n: 1,
          page: 99,
          quote: "Cita totalmente inexistente que jamás ocurrió en el documento fuente.",
          finding_id: "finding-2",
        },
      ],
      full_report: {
        prose: { executive_summary: "Resumen inicial con dos hallazgos." },
        active_findings_count: 2,
        quarantined_findings_count: 0,
      },
    };

    const result = await reconcileCitationsAndDependentClaims({
      reportRow,
      findings: [verifiedFinding, failedFinding],
      pages,
      docIndex,
    });

    // 1. Dependent finding was quarantined
    expect(result.quarantinedFindings.length).toBe(1);
    expect(result.quarantinedFindings[0].id).toBe("finding-2");
    expect(result.quarantinedFindings[0].lifecycle_status).toBe("quarantined");
    expect(result.quarantinedFindings[0].finding_status).toBe("suppressed");
    expect(result.quarantinedFindings[0].verification_status).toBe("unverified");

    // 2. Active findings contains only the verified finding
    expect(result.activeFindings.length).toBe(1);
    expect(result.activeFindings[0].id).toBe("finding-1");

    // 3. Surviving citations contains only cite-1; cite-24 was removed
    expect(result.survivingCitations.length).toBe(1);
    expect(result.survivingCitations[0].id).toBe("cite-1");

    // 4. Counters were rebuilt
    expect(result.reportRow.findings_count).toBe(1);
    expect(result.reportRow.full_report.active_findings_count).toBe(1);
    expect(result.reportRow.full_report.quarantined_findings_count).toBe(1);

    // 5. Invariant: Report is NOT quality_blocked because verified content exists
    expect(result.hasVerifiedContent).toBe(true);
    expect(result.reportRow.quality_blocked).toBe(false);
    expect(result.reportRow.quality_block_reasons).toEqual([]);

    // 6. Diagnostic warnings and audit trail are preserved
    expect(result.diagnosticWarnings.length).toBeGreaterThan(0);
    expect(result.diagnosticWarnings.some((w) => w.includes("finding-2") || w.includes("Violación inexistente"))).toBe(true);
    expect(result.locationsAudit.ok).toBe(true);
    expect(result.locationsAudit.quarantined_citations.length).toBeGreaterThan(0);
    expect(result.locationsAudit.quarantined_claims).toEqual([{ id: "finding-2", title: "Violación inexistente" }]);
  });

  it("resolveFinalReleaseDecision never independently blocks report when other verified content exists", () => {
    const report = {
      quality_blocked: false,
      full_report: {
        final_published_claims: [{ claim_id: "c-1", claim_text: "Amparo concedido", publication_status: "APPROVED" }],
        qa_statuses: [],
      },
    };

    const release = resolveFinalReleaseDecision({
      report,
      contract: { ok: true, blocking_errors: [] },
      errors: ["Cita 24: no se pudo verificar la cita literal en el documento y la página indicados."],
      warnings: [],
    });

    expect(release.released).toBe(true);
    expect(release.decision).toBe("PASS_WITH_WARNINGS");
    expect(release.quality_blocked).toBe(false);
    expect(release.warnings).toContain("Cita 24: no se pudo verificar la cita literal en el documento y la página indicados.");
    expect(release.errors).not.toContain("Cita 24: no se pudo verificar la cita literal en el documento y la página indicados.");
  });
});
