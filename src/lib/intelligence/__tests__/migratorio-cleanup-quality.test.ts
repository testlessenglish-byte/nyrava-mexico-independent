import { describe, it, expect } from "vitest";
import { specialistLawScopeDecision } from "../../jurisdiction/specialist-law-scope";
import { MX_ENGINES, MX_FINDING_MODULES } from "../../jurisdiction/mexico-policy";
import { reconcileSpecialistFindings } from "../specialist-finding-reconciliation";
import { requiredDocuments, resolveMissingDocuments } from "../mx-missing-documents";
import { translateLegalTerm } from "../../pdf/enum-translation";
import { documentPurposeSummary } from "../../reporting/document-purpose-summary";
import { classifyValidatePublishClaim } from "../final-claim-publication";

describe("Derecho Migratorio, Refugio y Nacionalidad — Quality & System Cleanup", () => {
  describe("1. Policy Configuration & Specialist Capabilities", () => {
    it("equips migratorio with constitutional and amparo engines and finding modules", () => {
      const engines = MX_ENGINES.migratorio;
      expect(engines).toContain("agent:conventionality_pro_persona");
      expect(engines).toContain("agent:constitutional_rights_mapping");
      expect(engines).toContain("agent:suspension_analysis");
      expect(engines).toContain("agent:standing_procedencia");

      const modules = MX_FINDING_MODULES.migratorio;
      expect(modules).toContain("derechos_fundamentales");
      expect(modules).toContain("control_de_convencionalidad");
      expect(modules).toContain("suspension_del_acto");
      expect(modules).toContain("procedencia_del_amparo");
    });
  });

  describe("2. Specialist Routing by Verified Evidence Signals", () => {
    it("skips refugee_non_refoulement_analysis when case is standard visa/stay without refugee signals", () => {
      const decision = specialistLawScopeDecision("refugee_non_refoulement_analysis", {
        caseType: "migratorio",
        matterSubtype: "residencia_temporal",
        documents: [{ id: "d1", text: "Solicitud de renovacion de tarjeta de residencia temporal por oferta de empleo en Monterrey." }],
      });
      expect(decision.run).toBe(false);
      expect(decision.reason).toContain("not_at_issue");
    });

    it("includes refugee_non_refoulement_analysis when case involves COMAR or refugee protection", () => {
      const decision = specialistLawScopeDecision("refugee_non_refoulement_analysis", {
        caseType: "migratorio",
        matterSubtype: "reconocimiento_condicion_refugiado",
        documents: [{ id: "d1", text: "Constancia de solicitud de reconocimiento de la condicion de refugiado ante la COMAR en Tapachula." }],
      });
      expect(decision.run).toBe(true);
    });

    it("skips nationality_naturalization_analysis when case does not involve nationality/naturalization", () => {
      const decision = specialistLawScopeDecision("nationality_naturalization_analysis", {
        caseType: "migratorio",
        matterSubtype: "regularizacion_estancia",
        documents: [{ id: "d1", text: "Tramite de regularizacion por documento vencido ante el Instituto Nacional de Migracion." }],
      });
      expect(decision.run).toBe(false);
    });

    it("includes nationality_naturalization_analysis when case involves naturalization or nationality", () => {
      const decision = specialistLawScopeDecision("nationality_naturalization_analysis", {
        caseType: "migratorio",
        matterSubtype: "carta_naturalizacion",
        documents: [{ id: "d1", text: "Expediente de solicitud de carta de naturalizacion por residencia ante la SRE." }],
      });
      expect(decision.run).toBe(true);
    });

    it("skips child_vulnerability_protection when text only contains boilerplate statutory mention of child rights", () => {
      const decision = specialistLawScopeDecision("child_vulnerability_protection", {
        caseType: "migratorio",
        matterSubtype: "residencia_temporal",
        documents: [{ id: "d1", text: "De conformidad con el principio del interes superior de la ninez establecido en el articulo 4 constitucional..." }],
      });
      expect(decision.run).toBe(false);
      expect(decision.reason).toContain("not_substantiated");
    });

    it("includes child_vulnerability_protection when minors/NNA are factually involved", () => {
      const decision = specialistLawScopeDecision("child_vulnerability_protection", {
        caseType: "migratorio",
        matterSubtype: "residencia_temporal",
        documents: [{ id: "d1", text: "Acompañado de su menor hijo de 6 años de edad, solicitando protección integral para la niña." }],
      });
      expect(decision.run).toBe(true);
    });

    it("allows constitutional & amparo agents in migratorio when amparo proceedings are cited", () => {
      const decision = specialistLawScopeDecision("suspension_analysis", {
        caseType: "migratorio",
        matterSubtype: "orden_deportacion",
        documents: [{ id: "d1", text: "Se promueve amparo indirecto solicitando la suspension del oficio de salida y orden de deportacion." }],
      });
      expect(decision.run).toBe(true);
    });
  });

  describe("3. Specialist Finding Reconciliation (Eliminates Duplicate Chunk Execution)", () => {
    it("merges multiple chunk findings for the same legal issue into exactly ONE canonical finding", () => {
      const chunkFindings = [
        {
          title: "Orden de salida del territorio nacional sin garantía de audiencia",
          description: "El INM emitió oficio ordenando la salida definitiva del promovente sin conceder plazo de alegatos.",
          severity: "high",
          confidence: 0.88,
          legal_significance: "Violación al artículo 14 constitucional",
          potential_impact: "Riesgo inminente de expulsión del territorio mexicano",
          evidence_refs: [{ doc_n: 1, quote: "Se ordena la salida definitiva del promovente en un plazo de 15 días." }],
        },
        {
          title: "Notificación de orden de salida definitiva",
          description: "La notificación del oficio de salida definitiva adolece de motivación suficiente.",
          severity: "critical",
          confidence: 0.92,
          legal_significance: "Falta de fundamentación conforme al artículo 16 constitucional",
          potential_impact: "Ejecución coactiva sin recurso previo",
          evidence_refs: [{ doc_n: 2, quote: "Notifíquese la salida definitiva levantándose acta correspondiente." }],
        },
      ];

      const reconciled = reconcileSpecialistFindings(chunkFindings, "immigration_due_process_remedies");
      expect(reconciled.length).toBe(1);

      const canonical = reconciled[0];
      // Severity picked should be the highest (critical > high)
      expect(canonical.severity).toBe("critical");
      // All unique evidence quotes preserved
      expect(canonical.evidence_refs.length).toBe(2);
      expect(canonical.evidence_refs.some((r) => r.quote.includes("Se ordena la salida"))).toBe(true);
      expect(canonical.evidence_refs.some((r) => r.quote.includes("Notifíquese la salida"))).toBe(true);
      // Title preserved
      expect(canonical.title).toContain("salida");
    });
  });

  describe("4. Atomic Claim Verification on Compound Immigration Claims", () => {
    it("publishes supported factual statement and strips AI-generated speculative remedy", () => {
      const compoundMigratorioClaim = {
        id: "claim-mig-1",
        title: "Condición de estancia y resolución migratoria",
        description:
          "El promovente ingresó al territorio nacional con visa de residente temporal el 10 de enero de 2022, por lo que procede conceder de plano la residencia permanente definitiva.",
        finding_type: "DIRECT_EVIDENCE",
        source_document_id: "doc-inm-1",
        source_page: 1,
        source_quote: "El promovente ingresó al territorio nacional con visa de residente temporal el 10 de enero de 2022 según consta en tarjeta de estancia.",
        speaker_role: null,
        audit_classification: "DIRECT_EVIDENCE",
      };

      const result = classifyValidatePublishClaim(compoundMigratorioClaim);
      expect(result.publication_status).toBe("REPAIRED");
      // P1 fact is preserved
      expect(result.canonical_description).toContain("10 de enero de 2022");
      // P2 speculative conclusion is stripped
      expect(result.canonical_description).not.toContain("residencia permanente definitiva");
    });
  });

  describe("5. Missing Documents Scoping", () => {
    it("excludes COMAR, SRE, and vinculo familiar when not at issue in the case file", () => {
      const corpus = "Consta el pasaporte vigente y la tarjeta de residencia temporal con numero de tramite NUT-12345 y notificacion del oficio de salida.";
      const docs = requiredDocuments("migratorio", corpus);
      const docIds = docs.map((d) => d.id);

      expect(docIds).toContain("identidad_viaje");
      expect(docIds).toContain("documento_condicion_estancia");
      expect(docIds).toContain("acuse_tramite");
      expect(docIds).toContain("resolucion_notificacion");

      // Non-relevant specialized documents should NOT be required
      expect(docIds).not.toContain("refugio_comar");
      expect(docIds).not.toContain("nacionalidad_sre");
      expect(docIds).not.toContain("vinculo_familiar");
    });

    it("includes refugio_comar when the corpus explicitly deals with refugee/asylum", () => {
      const corpus = "Consta solicitud de asilo y procedimiento ante la comar de proteccion complementaria.";
      const docs = requiredDocuments("migratorio", corpus);
      const docIds = docs.map((d) => d.id);

      expect(docIds).toContain("refugio_comar");
      expect(docIds).not.toContain("nacionalidad_sre");
    });

    it("resolves missing documents accurately without false positives for unrelated procedures", () => {
      const corpus = "Se exhibió pasaporte y acuse de recibo con numero de tramite ante el instituto.";
      const report = resolveMissingDocuments("migratorio", corpus);

      // Present documents detected
      expect(report.present.some((d) => d.id === "identidad_viaje")).toBe(true);
      expect(report.present.some((d) => d.id === "acuse_tramite")).toBe(true);

      // Irrelevant categories not in missing list
      expect(report.missing.some((d) => d.id === "refugio_comar")).toBe(false);
      expect(report.missing.some((d) => d.id === "nacionalidad_sre")).toBe(false);
    });
  });

  describe("6. Language Leaks and Spanish Enum Translations", () => {
    it("translates verification and lifecycle statuses into clean Spanish", () => {
      expect(translateLegalTerm("supported")).toBe("Sustentado");
      expect(translateLegalTerm("partially_supported")).toBe("Parcialmente Sustentado");
      expect(translateLegalTerm("not_supported")).toBe("No Sustentado");
      expect(translateLegalTerm("not_determined")).toBe("No Determinado");
      expect(translateLegalTerm("unresolved")).toBe("No Determinado");
      expect(translateLegalTerm("concluded")).toBe("Concluido");
      expect(translateLegalTerm("ongoing")).toBe("En Trámite");
      expect(translateLegalTerm("migratorio")).toBe("Derecho Migratorio, Refugio y Nacionalidad");
    });

    it("formats document purpose as Finalidad documental no determinada when scope is undetermined", () => {
      const lines = documentPurposeSummary({
        documents: [{ filename: "oficio_inm.pdf", source_scope: "unresolved" }],
      });
      expect(lines.length).toBe(1);
      expect(lines[0]).toBe("oficio_inm.pdf: Finalidad documental no determinada");
    });
  });
});
