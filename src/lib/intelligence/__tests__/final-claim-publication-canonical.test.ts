import { describe, it, expect } from "vitest";
import {
  classifyValidatePublishClaim,
  classifyValidatePublishClaims,
  sweepReportForPdfPublication,
  type StandardClaimObject,
} from "../final-claim-publication";
import { composeFinalReportPayload } from "../../reporting/final-report-contract";

describe("Priority #3 Regression Tests — Final Published Claim Canonical Invariant", () => {
  // Test 1: Supported claim publishes unchanged
  it("1. A supported claim publishes unchanged", () => {
    const supportedClaim = {
      id: "claim-supp-1",
      title: "Constancia de Notificación Personal",
      description: "La notificación personal fue realizada el 15 de marzo de 2024 conforme a las formalidades de ley.",
      finding_type: "DIRECT_EVIDENCE",
      source_document_id: "doc-test-1",
      source_page: 3,
      source_quote: "notificación personal fue realizada el 15 de marzo de 2024",
      speaker_role: "autoridad_responsable",
      audit_classification: "DIRECT_EVIDENCE",
    };

    const pub = classifyValidatePublishClaim(supportedClaim);
    expect(pub.publication_status).toBe("APPROVED");
    expect(pub.canonical_title).toBe(supportedClaim.title);
    expect(pub.canonical_description).toBe(supportedClaim.description);

    // Verify in composed report payload
    const exportData: any = {
      case: { id: "c1", case_type: "amparo" },
      documents: [{ id: "doc-test-1", filename: "notificacion.pdf" }],
      findings: [supportedClaim],
      report: {
        executive_summary: "El tribunal analizó las constancias del expediente y resolvió el asunto de conformidad.",
        full_report: {},
      },
    };

    const swept = sweepReportForPdfPublication(exportData);
    expect(swept.findings.length).toBe(1);
    expect(swept.findings[0].title).toBe(supportedClaim.title);
    expect(swept.findings[0].description).toBe(supportedClaim.description);
    expect(swept.findings[0].finding_status).toBe("verified");

    const composed = composeFinalReportPayload(swept);
    expect(composed.findings!.length).toBe(1);
    expect(composed.findings![0].title).toBe(supportedClaim.title);
    expect(composed.findings![0].description).toBe(supportedClaim.description);
  });

  // Test 2: Partially supported claim publishes repaired text, not raw text
  it("2. A partially supported claim publishes repaired text, not raw text", () => {
    const rawTitle = "Privación ilegal de la libertad";
    const rawDesc = "El quejoso permaneció privado de la libertad cuatro meses, lo que vulnera flagrantemente sus derechos humanos constitucionales.";
    const partiallySupportedClaim = {
      id: "claim-part-2",
      title: rawTitle,
      description: rawDesc,
      finding_type: "DIRECT_EVIDENCE",
      source_document_id: "doc-test-2",
      source_page: 8,
      source_quote: "permaneció cuatro meses bajo medida cautelar de privación de la libertad",
      speaker_role: null,
      audit_classification: "SUPPORTED_INFERENCE",
    };

    const pub = classifyValidatePublishClaim(partiallySupportedClaim);
    expect(pub.publication_status).toBe("REPAIRED");
    // Repaired text strips the unproven constitutional violation conclusion
    expect(pub.canonical_description).not.toContain("vulnera flagrantemente sus derechos humanos");
    expect(pub.canonical_description).toContain("cuatro meses");

    // In report sweep
    const exportData: any = {
      case: { id: "c2", case_type: "amparo" },
      documents: [{ id: "doc-test-2", filename: "auto_cautelar.pdf" }],
      findings: [partiallySupportedClaim],
      report: {
        executive_summary: "El tribunal revisó las medidas cautelares aplicadas en el procedimiento analizado.",
        full_report: {},
      },
    };

    const swept = sweepReportForPdfPublication(exportData);
    expect(swept.findings.length).toBe(1);
    const sweptFinding = swept.findings[0];
    expect(sweptFinding.description).not.toContain("vulnera flagrantemente sus derechos humanos");
    expect(sweptFinding.description).toBe(pub.canonical_description);
    // Raw text preserved only in metadata audit trail
    expect(sweptFinding.metadata.raw_unreconciled_description).toBe(rawDesc);

    // In composed presentation
    const composed = composeFinalReportPayload(swept);
    expect(composed.findings!.length).toBe(1);
    expect(composed.findings![0].description).toBe(pub.canonical_description);
    expect(composed.findings![0].description).not.toContain("vulnera flagrantemente sus derechos humanos");

    const card = composed.report_presentation.finding_cards[0];
    expect(card.finding.description).toBe(pub.canonical_description);
    expect(card.finding.description).not.toContain("vulnera flagrantemente sus derechos humanos");
  });

  // Test 3: Unsupported claim does not publish
  it("3. An unsupported claim does not publish", () => {
    const unsupportedClaim = {
      id: "claim-unsupp-3",
      title: "Contrainterrogatorio: Presunta falsedad de firmas",
      description: "El testigo mintió deliberadamente sobre la suscripción del documento contractual.",
      finding_type: "AI_THEORY",
      source_document_id: null,
      source_page: null,
      source_quote: "",
      speaker_role: null,
      audit_classification: "UNSUPPORTED",
    };

    const pub = classifyValidatePublishClaim(unsupportedClaim);
    expect(pub.publication_status).toBe("SUPPRESSED");

    const exportData: any = {
      case: { id: "c3", case_type: "amparo" },
      documents: [{ id: "doc-test-3", filename: "contrato.pdf" }],
      findings: [unsupportedClaim],
      report: {
        executive_summary: "Informe de auditoría documental del juicio de amparo correspondiente.",
        full_report: {},
      },
    };

    const swept = sweepReportForPdfPublication(exportData);
    expect(swept.findings.length).toBe(0);

    const composed = composeFinalReportPayload(exportData);
    expect(composed.findings!.length).toBe(0);
    expect(composed.report_presentation.finding_cards.length).toBe(0);
  });

  // Test 4: Reclassified party allegation publishes with party attribution, not court holding
  it("4. A reclassified party allegation publishes with party attribution, not court holding", () => {
    const rawAllegation = {
      id: "claim-party-4",
      title: "Violación al debido proceso",
      description: "El quejoso argumenta que la autoridad responsable omitió valorar la prueba testimonial ofrecida.",
      finding_type: "COURT_HOLDING", // Erroneously labeled as court holding by agent
      audit_classification: "VERIFIED_COURT_HOLDING", // Erroneously tagged by agent
      adoption_status: "adopted", // Erroneously claimed adopted
      proposition_type: "holding",
      source_document_id: "doc-test-4",
      source_page: 12,
      source_quote: "el quejoso argumenta que no se tomó en consideración su probanza",
      speaker_role: "scjn", // Erroneously labeled as SCJN court
    };

    const pub = classifyValidatePublishClaim(rawAllegation);
    expect(pub.claim_type).toBe("PARTY_ALLEGATION");
    expect(pub.speaker).toBe("party");
    expect(pub.attribution).toBe("ARGUMENTO DEL QUEJOSO");
    expect(pub.attribution).not.toBe("DETERMINACIÓN ADOPTADA POR EL TRIBUNAL REVISOR");

    const exportData: any = {
      case: { id: "c4", case_type: "amparo" },
      documents: [{ id: "doc-test-4", filename: "demanda_amparo.pdf" }],
      findings: [rawAllegation],
      report: {
        executive_summary: "Revisión documental integral del juicio de amparo indirecto.",
        full_report: {
          mandatory_decision_core: {
            items: [
              {
                id: "core-1",
                kind: "COURT_HOLDING",
                text: "Se sobresee en el juicio de amparo.",
                speaker_role: "scjn",
                source_refs: [{ document_id: "doc-test-4", page: 12, quote: "el quejoso argumenta que no se tomó en consideración su probanza" }],
              },
            ],
          },
        },
      },
    };

    const swept = sweepReportForPdfPublication(exportData);
    expect(swept.findings.length).toBe(1);
    const f = swept.findings[0];
    expect(f.speaker_role).toBe("quejoso");
    expect(f.speaker_role_label).toBe("ARGUMENTO DEL QUEJOSO");
    expect(f.audit_classification).toBe("PARTY_ALLEGATION");
    expect(f.content_class).toBe("PARTY_ARGUMENT");
    expect(f.proposition_type).toBe("party_argument");
    expect(f.adoption_status).toBe("party_position");

    const composed = composeFinalReportPayload(swept);
    expect(composed.findings!.length).toBe(1);
    const composedFinding = composed.findings![0];
    expect(composedFinding.speaker_role).toBe("quejoso");
    expect(composedFinding.speaker_role_label).toBe("ARGUMENTO DEL QUEJOSO");
    expect(composedFinding.content_class).toBe("PARTY_ARGUMENT");
    expect(composedFinding.audit_classification).toBe("PARTY_ALLEGATION");

    const card = composed.report_presentation.finding_cards[0];
    expect(card.finding.speaker_role).toBe("quejoso");
    expect(card.finding.speaker_role_label).toBe("ARGUMENTO DEL QUEJOSO");
  });

  // Test 5: Original/raw claim cannot reappear after reconciliation
  it("5. The original/raw claim cannot reappear after reconciliation", () => {
    const rawTitle = "Tratamiento Inconstitucional";
    const rawDesc = "El quejoso estuvo 4 meses detenido, lo que resulta ilegal y violatorio de garantías.";
    const candidateClaim = {
      id: "claim-canonical-5",
      title: rawTitle,
      description: rawDesc,
      repaired_title: "Detención Cautelar Verificada",
      repaired_description: "El quejoso estuvo 4 meses detenido de conformidad con el registro judicial.",
      finding_type: "DIRECT_EVIDENCE",
      source_document_id: "doc-test-5",
      source_page: 20,
      source_quote: "el quejoso estuvo 4 meses detenido",
      speaker_role: "autoridad_responsable",
    };

    // First sweep
    const exportData: any = {
      case: { id: "c5", case_type: "amparo" },
      documents: [{ id: "doc-test-5", filename: "expediente.pdf" }],
      findings: [candidateClaim],
      report: {
        executive_summary: "Revisión documental del expediente y sus constancias de detención.",
        full_report: {},
      },
    };

    const swept = sweepReportForPdfPublication(exportData);
    expect(swept.findings[0].title).toBe("Detención Cautelar Verificada");
    expect(swept.findings[0].description).toBe("El quejoso estuvo 4 meses detenido de conformidad con el registro judicial.");
    expect(swept.findings[0].title).not.toBe(rawTitle);
    expect(swept.findings[0].description).not.toBe(rawDesc);

    // Composing payload from swept output
    const composed = composeFinalReportPayload(swept);
    expect(composed.findings![0].title).toBe("Detención Cautelar Verificada");
    expect(composed.findings![0].description).toBe("El quejoso estuvo 4 meses detenido de conformidad con el registro judicial.");
    expect(composed.findings![0].title).not.toBe(rawTitle);
    expect(composed.findings![0].description).not.toBe(rawDesc);

    // Finding card in presentation must NOT contain raw title or raw desc
    const card = composed.report_presentation.finding_cards[0];
    expect(card.finding.title).toBe("Detención Cautelar Verificada");
    expect(card.finding.description).toBe("El quejoso estuvo 4 meses detenido de conformidad con el registro judicial.");
    expect(card.finding.title).not.toBe(rawTitle);
    expect(card.finding.description).not.toBe(rawDesc);

    // Even if composeFinalReportPayload is called multiple times or re-composed, raw text never reappears
    const recomposed = composeFinalReportPayload(composed);
    expect(recomposed.findings![0].title).toBe("Detención Cautelar Verificada");
    expect(recomposed.findings![0].description).toBe("El quejoso estuvo 4 meses detenido de conformidad con el registro judicial.");
    expect(recomposed.findings![0].title).not.toBe(rawTitle);
    expect(recomposed.findings![0].description).not.toBe(rawDesc);
  });
});
