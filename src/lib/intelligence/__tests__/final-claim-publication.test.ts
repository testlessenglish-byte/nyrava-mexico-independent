import { describe, it, expect } from "vitest";
import {
  classifyValidatePublishClaim,
  classifyValidatePublishClaims,
  deduplicateAndMergeClaims,
  determineSpeakerAndAttribution,
  sanitizeReportObjectiveAndProse,
  sweepReportForPdfPublication,
} from "../final-claim-publication";
import { formatSpeakerRoleBadge } from "../concluded-case-governance";

describe("Final Claim Publication Control — Complete Verification", () => {
  describe("Target A: Deterministic Attribution for Party Allegations", () => {
    it("classifies 'El quejoso argumenta...' as PARTY_ALLEGATION and never displays NO DETERMINADO", () => {
      const claim = {
        id: "claim-1",
        title: "Discriminación en la custodia",
        description:
          "El quejoso argumenta que la decisión del tribunal de otorgar la custodia a la madre se basa en un criterio discriminatorio por razón de sexo, afectando el bienestar emocional de la niña.",
        source_quote: "la responsable no dio respuesta a los agravios expuestos en apelación",
        source_document_id: "doc-1",
        source_page: 5,
        speaker_role: null,
      };

      const attribution = determineSpeakerAndAttribution(
        claim.title,
        claim.description,
        claim.source_quote,
        claim.speaker_role,
      );

      expect(attribution.isPartyAllegation).toBe(true);
      expect(attribution.speaker).toBe("party");
      expect(attribution.roleLabel).toBe("quejoso");
      expect(attribution.badge).toBe("ARGUMENTO DEL QUEJOSO");
      expect(attribution.badge).not.toBe("NO DETERMINADO");

      // Test formatSpeakerRoleBadge directly
      const badge = formatSpeakerRoleBadge(claim);
      expect(badge).toBe("ARGUMENTO DEL QUEJOSO");
      expect(badge).not.toBe("NO DETERMINADO");

      // Standard claim object publication
      const published = classifyValidatePublishClaim(claim);
      expect(published.claim_type).toBe("PARTY_ALLEGATION");
      expect(published.speaker).toBe("party");
      expect(published.attribution).toBe("ARGUMENTO DEL QUEJOSO");
      expect(published.attribution).not.toBe("NO DETERMINADO");
      expect(["APPROVED", "REPAIRED"]).toContain(published.publication_status);
    });

    it("attributes 'la parte actora sostiene' and 'la demandada argumenta' deterministically", () => {
      const actorAttr = determineSpeakerAndAttribution(
        "Incumplimiento de contrato",
        "La parte actora sostiene que no se entregó la mercancía convenida.",
        "se reclama el pago de lo debido",
      );
      expect(actorAttr.badge).toBe("ARGUMENTO / ALEGACIÓN DE PARTE");

      const demandadaAttr = determineSpeakerAndAttribution(
        "Excepción de pago",
        "La parte demandada argumenta que cumplió oportunamente con la obligación.",
        "se exhibe recibo de pago",
      );
      expect(demandadaAttr.badge).toBe("ARGUMENTO / ALEGACIÓN DE PARTE");
    });
  });

  describe("Target B: Executive Summary & Objective Client Prejudgment Control", () => {
    it("does not publish 'El expediente respalda la pretensión del cliente' unless client position is independently supported", () => {
      const reportRow = {
        executive_summary:
          "El expediente respalda la pretensión del cliente en términos del interés superior de la niñez.",
        full_report: {
          objective: {
            answer:
              "El expediente respalda la pretensión del cliente en términos del interés superior de la niñez.",
            decision_points: [],
          },
        },
      };

      // In a judicial decision audit without an active client representation
      const sanitized = sanitizeReportObjectiveAndProse(reportRow, [], {
        isConcludedAudit: true,
        hasIdentifiedClient: false,
      });

      expect(sanitized.executiveSummary).not.toContain(
        "El expediente respalda la pretensión del cliente",
      );
      expect(sanitized.executiveSummary).toContain(
        "El expediente contiene determinaciones judiciales verificadas que permiten identificar con precisión lo resuelto.",
      );
      expect((sanitized.objective as any)?.answer).not.toContain(
        "El expediente respalda la pretensión del cliente",
      );
      expect((sanitized.objective as any)?.answer).toContain(
        "El expediente contiene determinaciones judiciales verificadas que permiten identificar con precisión lo resuelto.",
      );
    });
  });

  describe("Target C & D: Strategy and Procedural Speculation Control", () => {
    it("suppresses 'La decisión puede ser impugnada' and 'Podría resultar en una revisión...' without verified procedural availability", () => {
      const proceduralClaim = {
        id: "strat-1",
        title: "Impugnación de la resolución",
        description:
          "La decisión puede ser impugnada mediante amparo directo en contra de la resolución.",
        source_quote: "Se desecha el recurso de revisión y queda firme la sentencia",
        source_document_id: "doc-1",
      };

      const published = classifyValidatePublishClaim(proceduralClaim, {
        isConcludedAudit: true,
        proceduralAvailabilityVerified: false,
      });

      expect(published.publication_status).toBe("SUPPRESSED");
      expect(published.suppression_reason).toContain(
        "Procedural challenge / strategy suppressed: decision is final or procedural availability is unverified.",
      );
    });

    it("sanitizes unverified procedural advice in decision points", () => {
      const reportRow = {
        executive_summary: "Sentencia confirmada.",
        full_report: {
          objective: {
            answer: "Se desecha el recurso de revisión.",
            decision_points: [
              {
                id: "dp-1",
                issue: "Custodia otorgada a la madre",
                why: "Interés superior del menor",
                impact:
                  "La decisión puede ser impugnada si se demuestra que no se consideraron adecuadamente los derechos del padre.",
                next_action:
                  "Podría resultar en una revisión de la sentencia y una nueva evaluación de la custodia.",
              },
            ],
          },
        },
      };

      const sanitized = sanitizeReportObjectiveAndProse(reportRow, [], {
        proceduralAvailabilityVerified: false,
      });

      const dp = (sanitized.objective as any).decision_points[0];
      expect(dp.impact).not.toContain("La decisión puede ser impugnada");
      expect(dp.impact).toContain("Determinación judicial verificada");
      expect(dp.next_action).not.toContain("Podría resultar en una revisión");
      expect(dp.next_action).toContain("Revisión documental: Verificar el engrose");
    });
  });

  describe("Target E: Semantic Deduplication of Redundant Allegations", () => {
    it("merges 'Discriminación de género' and 'Discriminación en la custodia' into one canonical finding", () => {
      const claim1 = classifyValidatePublishClaim({
        id: "f-1",
        title: "Discriminación en la custodia",
        description:
          "El quejoso argumenta que la decisión del tribunal de otorgar la custodia a la madre se basa en un criterio discriminatorio por razón de sexo.",
        source_quote: "la responsable no dio respuesta a los agravios",
        source_document_id: "doc-1",
      });

      const claim2 = classifyValidatePublishClaim({
        id: "f-2",
        title: "Discriminación de género",
        description:
          "El quejoso argumenta que se incurrió en discriminación de género al otorgar preferencia a la madre en la custodia.",
        source_quote: "la responsable no dio respuesta a los agravios",
        source_document_id: "doc-1",
      });

      const { surviving, merged } = deduplicateAndMergeClaims([claim1, claim2]);

      expect(merged.length).toBe(1);
      expect(merged[0].claim_id).toBe("f-2");
      expect(merged[0].publication_status).toBe("MERGED");
      expect(merged[0].merged_into).toBe("f-1");

      const activePublished = surviving.filter(
        (c) => c.publication_status === "APPROVED" || c.publication_status === "REPAIRED",
      );
      expect(activePublished.length).toBe(1);
      expect(activePublished[0].claim_id).toBe("f-1");
    });
  });

  describe("Report Release Invariant: Permissive on Report Release", () => {
    it("filters and suppresses bad claims while releasing clean report without blocking", () => {
      const candidates = [
        // 1. Valid court holding
        {
          id: "c-1",
          title: "DETERMINACIÓN DEL TRIBUNAL: Se desecha el recurso de revisión.",
          description: "Se desecha el recurso de revisión a que este toca se refiere.",
          source_quote: "Se desecha el recurso de revisión a que este toca se refiere.",
          source_document_id: "doc-1",
          finding_type: "DIRECT_EVIDENCE",
          audit_classification: "VERIFIED_COURT_HOLDING",
        },
        // 2. Party allegation with deterministic phrasing
        {
          id: "c-2",
          title: "Custodia compartida",
          description:
            "El quejoso argumenta que la custodia compartida no fue considerada adecuadamente.",
          source_quote: "la custodia compartida no es indebida atendiendo a las condiciones",
          source_document_id: "doc-1",
        },
        // 3. Zero-source theory (must be suppressed, not block report)
        {
          id: "c-3",
          title: "Falta de especificación de cuidados especiales",
          description: "No se especificaron los cuidados especiales que la niña requiere.",
          source_quote: null,
          source_document_id: null,
        },
        // 4. Cross examination tactic (must be suppressed, not block report)
        {
          id: "c-4",
          title: "Contrainterrogatorio: Madre de la menor",
          description: "Interrogar a la madre sobre el tiempo disponible para cuidar a la niña.",
          source_quote: "la madre cuenta con tiempo para atender a la niña",
          source_document_id: "doc-1",
        },
        // 5. Unverified procedural option (must be suppressed, not block report)
        {
          id: "c-5",
          title: "Apelación de la resolución",
          description: "La decisión puede ser impugnada mediante recurso de apelación.",
          source_quote: "Se desecha el recurso",
          source_document_id: "doc-1",
        },
      ];

      const { published, all } = classifyValidatePublishClaims(candidates, {
        isConcludedAudit: true,
      });

      // 2 published (holding and party allegation), 3 suppressed
      expect(published.length).toBe(2);
      expect(published.map((p) => p.claim_id)).toEqual(["c-1", "c-2"]);

      const suppressed = all.filter((c) => c.publication_status === "SUPPRESSED");
      expect(suppressed.length).toBe(3);
      expect(suppressed.map((s) => s.claim_id)).toEqual(["c-3", "c-4", "c-5"]);
    });

    it("pre-PDF sweep cleans report and findings successfully", () => {
      const exportData = {
        case: {
          id: "case-clean-1",
          case_type: "familiar",
          case_analysis_mode: "concluded_audit",
        },
        findings: [
          {
            id: "f-1",
            title: "DETERMINACIÓN DEL TRIBUNAL: Se desecha el recurso de revisión.",
            description: "Se desecha el recurso de revisión.",
            source_quote: "Se desecha el recurso de revisión a que este toca se refiere.",
            source_document_id: "doc-1",
            finding_status: "verified",
          },
          {
            id: "f-2",
            title: "Discriminación en la custodia",
            description:
              "El quejoso argumenta que la decisión del tribunal se basa en discriminación por sexo.",
            source_quote: "la responsable no dio respuesta a los agravios",
            source_document_id: "doc-1",
            speaker_role: null,
          },
          {
            id: "f-3",
            title: "Solicitar peritaje psicológico",
            description: "Para determinar el estado emocional de la menor.",
            source_quote: null,
            source_document_id: null,
          },
        ],
        report: {
          executive_summary:
            "El expediente respalda la pretensión del cliente en términos del interés superior de la niñez.",
          full_report: {
            objective: {
              answer:
                "El expediente respalda la pretensión del cliente en términos del interés superior de la niñez.",
              decision_points: [
                {
                  issue: "Custodia",
                  impact: "La decisión puede ser impugnada por falta de fundamentación.",
                  next_action: "Podría resultar en una revisión de la sentencia.",
                },
              ],
            },
          },
        },
        documents: [{ id: "doc-1", filename: "sentencia.pdf" }],
      };

      const swept = sweepReportForPdfPublication(exportData as any);

      // Findings: only f-1 and f-2 survive (f-3 suppressed as zero-source theory)
      expect(swept.findings.length).toBe(2);
      expect(swept.findings.map((f: any) => f.id)).toEqual(["f-1", "f-2"]);

      // Attribution: f-2 gets ARGUMENTO DEL QUEJOSO, NOT NO DETERMINADO
      expect(swept.findings[1].speaker_role_label).toBe("ARGUMENTO DEL QUEJOSO");

      // Executive Summary and Objective scrubbed
      expect(swept.report.executive_summary).not.toContain(
        "El expediente respalda la pretensión del cliente",
      );
      expect(swept.report.full_report.objective.answer).not.toContain(
        "El expediente respalda la pretensión del cliente",
      );
      expect(swept.report.full_report.objective.decision_points[0].impact).not.toContain(
        "La decisión puede ser impugnada",
      );
    });
  });
});
