import { describe, it, expect } from "vitest";
import {
  classifyValidatePublishClaim,
  sweepReportForPdfPublication,
  enforceNoAddedPropositions,
  scrubUnsupportedPropositionsFromSections,
} from "../final-claim-publication";
import { composeFinalReportPayload, validateFinalReportContract } from "../../reporting/final-report-contract";

describe("Atomic Claim Enforcement at Final Publication — Universal Across Materias", () => {
  // 1. supported P1 + unsupported P2 → only P1 publishes
  it("1. supported P1 + unsupported P2 -> only P1 publishes (strips unverified consequence)", () => {
    // Materia Amparo / Administrativo
    const compoundClaim = {
      id: "claim-atomic-1",
      title: "Admisión de demanda de amparo",
      description:
        "El quejoso promovió juicio de amparo indirecto el 14 de marzo de 2023, por lo que la autoridad responsable debió suspender de inmediato el acto reclamado.",
      finding_type: "DIRECT_EVIDENCE",
      source_document_id: "doc-amp-1",
      source_page: 2,
      source_quote: "El quejoso promovió juicio de amparo indirecto el 14 de marzo de 2023 en contra del acuerdo recurrido.",
      speaker_role: null,
      audit_classification: "DIRECT_EVIDENCE",
    };

    const pub = classifyValidatePublishClaim(compoundClaim);
    expect(pub.publication_status).toBe("REPAIRED");
    // P1 (fact of amparo filing on March 14, 2023) is preserved
    expect(pub.canonical_description).toContain("14 de marzo de 2023");
    // P2 (unsupported legal consequence of immediate suspension) is stripped
    expect(pub.canonical_description).not.toContain("debió suspender");
    expect(pub.canonical_description).not.toContain("suspender de inmediato");

    // Diagnostic tracks atomic split
    const diag = pub.metadata?.claim_entailment_diagnostic as any;
    expect(diag.atomic_evaluation).toBeDefined();
    expect(diag.atomic_evaluation.passed).toBeGreaterThanOrEqual(1);
    expect(diag.atomic_evaluation.failed).toBeGreaterThanOrEqual(1);
    expect(diag.stripped_propositions.some((p: string) => p.includes("suspender"))).toBe(true);

    // Full export data and PDF sweep
    const exportData: any = {
      case: { id: "c-atomic-1", case_type: "amparo" },
      documents: [{ id: "doc-amp-1", filename: "demanda.pdf" }],
      findings: [compoundClaim],
      report: {
        executive_summary: "El tribunal admitió la demanda a trámite y requirió informe justificado.",
        full_report: {},
      },
    };

    const swept = sweepReportForPdfPublication(exportData);
    expect(swept.findings.length).toBe(1);
    expect(swept.findings[0].description).toContain("14 de marzo de 2023");
    expect(swept.findings[0].description).not.toContain("debió suspender");

    // In composed presentation
    const composed = composeFinalReportPayload(swept);
    expect(composed.findings!.length).toBe(1);
    expect(composed.findings![0].description).toContain("14 de marzo de 2023");
    expect(composed.findings![0].description).not.toContain("debió suspender");

    const card = composed.report_presentation.finding_cards[0];
    expect(card.finding.description).toContain("14 de marzo de 2023");
    expect(card.finding.description).not.toContain("debió suspender");
  });

  // 2. supported P1 + supported P2 → both publish
  it("2. supported P1 + supported P2 -> both publish when evidence entails both propositions", () => {
    // Materia Laboral / Mercantil
    const dualSupportedClaim = {
      id: "claim-atomic-2",
      title: "Demanda y suspensión de plano",
      description:
        "El quejoso promovió juicio de amparo indirecto el 14 de marzo de 2023, y la autoridad responsable suspendió de plano el acto reclamado.",
      finding_type: "DIRECT_EVIDENCE",
      source_document_id: "doc-amp-2",
      source_page: 5,
      source_quote: "El quejoso promovió juicio de amparo indirecto el 14 de marzo de 2023. La autoridad responsable suspendió de plano el acto reclamado mediante proveído.",
      speaker_role: "autoridad_responsable",
      audit_classification: "DIRECT_EVIDENCE",
    };

    const pub = classifyValidatePublishClaim(dualSupportedClaim);
    expect(pub.publication_status).toBe("APPROVED");
    expect(pub.canonical_description).toContain("14 de marzo de 2023");
    expect(pub.canonical_description).toContain("suspendió de plano");

    const exportData: any = {
      case: { id: "c-atomic-2", case_type: "laboral" },
      documents: [{ id: "doc-amp-2", filename: "proveido.pdf" }],
      findings: [dualSupportedClaim],
      report: {
        executive_summary: "Constancia de actuaciones procesales en el juicio de amparo correspondiente.",
        full_report: {},
      },
    };

    const swept = sweepReportForPdfPublication(exportData);
    expect(swept.findings.length).toBe(1);
    expect(swept.findings[0].description).toContain("14 de marzo de 2023");
    expect(swept.findings[0].description).toContain("suspendió de plano");

    const composed = composeFinalReportPayload(swept);
    expect(composed.findings![0].description).toContain("14 de marzo de 2023");
    expect(composed.findings![0].description).toContain("suspendió de plano");
  });

  // 3. unsupported proposition cannot reappear in another report section
  it("3. unsupported proposition cannot reappear in another report section", () => {
    // Materia Civil / Familiar
    const partiallySupportedClaim = {
      id: "claim-atomic-3",
      title: "Ocupación del inmueble litigioso",
      description:
        "El demandado ocupó el inmueble desde junio de 2021, lo que hace procedente una indemnización económica millonaria por daños patrimoniales.",
      finding_type: "DIRECT_EVIDENCE",
      source_document_id: "doc-civ-1",
      source_page: 10,
      source_quote: "Consta que el demandado ocupó el inmueble a partir del mes de junio de 2021.",
      speaker_role: null,
      audit_classification: "DIRECT_EVIDENCE",
    };

    const suppressedClaim = {
      id: "claim-atomic-supp",
      title: "Falsedad de firmas y simulación",
      description: "El contrato de arrendamiento contiene firmas apócrifas simuladas por el arrendador.",
      finding_type: "AI_THEORY",
      source_document_id: null,
      source_page: null,
      source_quote: "",
      speaker_role: null,
    };

    const exportData: any = {
      case: { id: "c-atomic-3", case_type: "civil" },
      documents: [{ id: "doc-civ-1", filename: "inspeccion.pdf" }],
      findings: [partiallySupportedClaim, suppressedClaim],
      report: {
        executive_summary:
          "El tribunal valoró las pruebas de posesión. Dicha determinación hace procedente una indemnización económica millonaria por daños patrimoniales. Se concluyó la fase probatoria.",
        next_actions: [
          { action: "Exigir indemnización económica millonaria por daños patrimoniales", why: "Daños alegados" },
          { action: "Presentar alegatos finales", why: "Cierre de instrucción" },
        ],
        full_report: {
          objective: {
            answer: "Se acreditó la ocupación. Dicha determinación hace procedente una indemnización económica millonaria por daños patrimoniales.",
            decision_points: [
              { issue: "Posesión", impact: "Indemnización económica millonaria por daños patrimoniales", next_action: "Revisar engrose" },
            ],
          },
        },
      },
      report_presentation: {
        snapshot: {
          priorityReview: [
            "Falsedad de firmas y simulación",
            "Inspección judicial del inmueble",
          ],
        },
        executive_questions: [
          { question: "¿Procede la indemnización económica millonaria por daños patrimoniales?", answer: "Pendiente" },
          { question: "¿Se acreditó la fecha de ocupación?", answer: "Sí, junio de 2021" },
        ],
      },
    };

    const swept = sweepReportForPdfPublication(exportData);

    // 1. Findings: suppressed claim is removed, repaired claim strips the unsupported proposition
    expect(swept.findings.length).toBe(1);
    expect(swept.findings[0].description).not.toContain("indemnización económica millonaria");

    // 2. Executive summary: unsupported proposition scrubbed
    expect(swept.report.executive_summary).not.toContain("indemnización económica millonaria");
    expect(swept.report.executive_summary).toContain("El tribunal valoró las pruebas de posesión");

    // 3. Next actions: unsupported proposition scrubbed, valid action remains
    expect(swept.report.next_actions.some((a: any) => a.action.includes("indemnización económica millonaria"))).toBe(false);
    expect(swept.report.next_actions.some((a: any) => a.action.includes("alegatos finales"))).toBe(true);

    // 4. Snapshot priorityReview: suppressed claim scrubbed, valid item remains
    expect(swept.report_presentation.snapshot.priorityReview).not.toContain("Falsedad de firmas y simulación");
    expect(swept.report_presentation.snapshot.priorityReview).toContain("Inspección judicial del inmueble");

    // 5. Executive questions: unsupported proposition scrubbed
    expect(swept.report_presentation.executive_questions.some((q: any) =>
      q.question.includes("indemnización económica millonaria"),
    )).toBe(false);
    expect(swept.report_presentation.executive_questions.some((q: any) =>
      q.question.includes("fecha de ocupación"),
    )).toBe(true);

    // 6. Objective: scrubbed
    expect(swept.report.full_report.objective.answer).not.toContain("indemnización económica millonaria");
  });

  // 4. downstream prose cannot add a new proposition after verification
  it("4. downstream prose cannot add a new proposition after verification (formatting allowed, adding meaning blocked)", () => {
    // Materia Penal / Fiscal
    const verifiedClaim = classifyValidatePublishClaim({
      id: "claim-atomic-4",
      title: "Registro de detención",
      description: "El imputado fue puesto a disposición del Ministerio Público a las 16:30 horas del día de su detención.",
      finding_type: "DIRECT_EVIDENCE",
      source_document_id: "doc-pen-1",
      source_page: 4,
      source_quote: "El imputado fue puesto a disposición del Ministerio Público a las 16:30 horas del día de su detención.",
      speaker_role: "autoridad_responsable",
    });

    expect(verifiedClaim.publication_status).toBe("APPROVED");

    // A. Downstream formatting or shortening is allowed
    const formattedShort = "El imputado fue puesto a disposición del Ministerio Público a las 16:30 horas.";
    const allowed = enforceNoAddedPropositions(formattedShort, verifiedClaim);
    expect(allowed).toBe(formattedShort);

    // B. Downstream prose attempting to add a new unverified conclusion is blocked
    const hallucinatedDownstreamProse =
      "El imputado fue puesto a disposición del Ministerio Público a las 16:30 horas, lo cual demuestra la flagrante arbitrariedad del ministerio público y la nulidad de todas las actuaciones.";

    const blocked = enforceNoAddedPropositions(hallucinatedDownstreamProse, verifiedClaim);
    // Extra unverified substantive conclusion is stripped
    expect(blocked).not.toContain("flagrante arbitrariedad");
    expect(blocked).not.toContain("nulidad de todas las actuaciones");
    expect(blocked).toContain("16:30 horas");
  });

  // 5. failure of one proposition never blocks the report
  it("5. failure of one proposition never blocks the report (permissive release invariant)", () => {
    // Materia Agrario / Ambiental / Electoral
    const mixedFindings = [
      // Finding 1: P1 supported + P2 unsupported
      {
        id: "f-mix-1",
        title: "Resolución de deslinde de tierras",
        description: "La asamblea ejidal celebró sesión de deslinde el 20 de mayo de 2022, por lo que procede la nulidad total de los títulos registrales expedidos.",
        finding_type: "DIRECT_EVIDENCE",
        source_document_id: "doc-agr-1",
        source_page: 1,
        source_quote: "La asamblea ejidal celebró sesión de deslinde el 20 de mayo de 2022 en los términos de la ley.",
      },
      // Finding 2: Completely unsupported claim (no source)
      {
        id: "f-mix-2",
        title: "Colusión entre autoridades agrarias",
        description: "Las autoridades ejidales incurrieron en colusión ilícita con funcionarios del registro agrario.",
        finding_type: "AI_THEORY",
        source_document_id: null,
        source_quote: "",
      },
      // Finding 3: Fully supported claim (P1 + P2)
      {
        id: "f-mix-3",
        title: "Inscripción en el Registro Agrario",
        description: "El acta de asamblea fue inscrita en el Registro Agrario Nacional el 15 de agosto de 2022, y se emitió la constancia registral correspondiente.",
        finding_type: "DIRECT_EVIDENCE",
        source_document_id: "doc-agr-1",
        source_page: 8,
        source_quote: "El acta de asamblea fue inscrita en el Registro Agrario Nacional el 15 de agosto de 2022. Se emitió la constancia registral correspondiente bajo el folio ejidal.",
      },
    ];

    const exportData: any = {
      case: { id: "c-atomic-5", case_type: "agrario" },
      documents: [{ id: "doc-agr-1", filename: "acta_ejidal.pdf", canonical_source_id: "cs-agr-1" }],
      findings: mixedFindings,
      report: {
        executive_summary:
          "Auditoría registral y legal de la documentación ejidal sometida a estudio formal ante las instancias agrarias correspondientes.",
        full_report: {
          canonical_sources: [
            {
              document_id: "doc-agr-1",
              canonical_source_id: "cs-agr-1",
              original_filename: "acta_ejidal.pdf",
              display_name: "acta_ejidal.pdf",
              source_aliases: [],
            },
          ],
        },
      },
    };

    // Pre-PDF sweep
    const swept = sweepReportForPdfPublication(exportData);
    // Finding 2 is suppressed; Finding 1 is repaired (P1 only); Finding 3 is approved
    expect(swept.findings.length).toBe(2);
    expect(swept.findings.map((f: any) => f.id)).toEqual(["f-mix-1", "f-mix-3"]);
    expect(swept.findings[0].description).not.toContain("nulidad total de los títulos");

    // Compose report payload
    const composed = composeFinalReportPayload(swept);
    expect(composed.findings!.length).toBe(2);

    // Validate report release contract
    const contract = validateFinalReportContract(composed);
    expect(contract.blocking_errors).toEqual([]);
    expect(contract.ok).toBe(true);

    // Invariant confirmed: failure of propositions NEVER blocked report release
  });
});
