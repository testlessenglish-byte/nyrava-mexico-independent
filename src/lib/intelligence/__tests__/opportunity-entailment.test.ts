import { describe, expect, it } from "vitest";
import { evaluateClaimEntailment } from "../claim-evidence-entailment";

describe("opportunity proposition entailment", () => {
  it("does not allow a verified quote to certify a broader unsupported opportunity description", () => {
    const quote =
      "Concede el amparo en contra de la emisión y promulgación del artículo 111 de la Ley de Migración";

    const diagnostic = evaluateClaimEntailment({
      id: "opportunity-live-regression",
      title: "Amparo por detención arbitraria",
      description:
        "Se concede el amparo en contra del artículo 111 de la Ley de Migración, lo que establece un precedente sobre la inconstitucionalidad de la detención prolongada de solicitantes de refugio.",
      source_document_id: "doc-2",
      source_page: 6,
      source_quote: quote,
      source_doc_ids: ["doc-2"],
      evidence_refs: [
        {
          document_id: "doc-2",
          page: 6,
          quote,
          verification_status: "verified",
        },
      ],
      finding_type: "DIRECT_EVIDENCE",
    });

    expect(
      diagnostic.final_reportable === false ||
        diagnostic.claim_action === "REPAIR",
    ).toBe(true);

    if (diagnostic.claim_action === "REPAIR") {
      expect(diagnostic.repaired_description).toBe(
        "Se concede el amparo en contra del artículo 111 de la Ley de Migración.",
      );

      expect(diagnostic.repaired_description).not.toContain(
        "detención prolongada de solicitantes de refugio",
      );

      expect(diagnostic.stripped_propositions).toContain(
        "establece un precedente sobre la inconstitucionalidad de la detención prolongada de solicitantes de refugio",
      );
    }
  });

  it("keeps an opportunity proposition that the cited passage actually entails", () => {
    const quote =
      "Concede el amparo en contra de la emisión y promulgación del artículo 111 de la Ley de Migración";

    const diagnostic = evaluateClaimEntailment({
      id: "opportunity-supported",
      title: "Concesión del amparo",
      description:
        "Se concede el amparo en contra de la emisión y promulgación del artículo 111 de la Ley de Migración.",
      source_document_id: "doc-2",
      source_page: 6,
      source_quote: quote,
      source_doc_ids: ["doc-2"],
      evidence_refs: [
        {
          document_id: "doc-2",
          page: 6,
          quote,
          verification_status: "verified",
        },
      ],
      finding_type: "DIRECT_EVIDENCE",
    });

    expect(diagnostic.final_reportable).toBe(true);
    expect(["KEEP", "REPAIR"]).toContain(diagnostic.claim_action);

    if (diagnostic.claim_action === "REPAIR") {
      expect(diagnostic.repaired_description).not.toContain(
        "detención prolongada de solicitantes de refugio",
      );
    }
  });
});