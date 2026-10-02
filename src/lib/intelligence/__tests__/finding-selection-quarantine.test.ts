import { describe, expect, it } from "vitest";
import { isCanonicalFinding, selectFindings } from "../finding-selection";
import { getCanonicalReportFindings, getCanonicalScoringFindings } from "../scoring-selection";

describe("citation quarantine finding selection", () => {
  const verified = {
    source_module: "agent:constitutional_rights_mapping",
    verification_status: "verified",
    finding_status: "candidate",
    metadata: {
      semantic_support_review: {
        version: 1,
        verdict: "supported",
        hash: "current-support-snapshot",
      },
    },
  };
  const noCitation = {
    source_module: "agent:ways_out_analysis",
    verification_status: "no_citation",
    finding_status: "candidate",
  };
  const unverified = {
    source_module: "engine:procedural_compliance",
    verification_status: "unverified",
    finding_status: "candidate",
  };

  it("keeps verified engine/agent findings canonical", () => {
    expect(isCanonicalFinding(verified)).toBe(true);
  });

  it("keeps no-citation and unverified rows out of canonical report surfaces", () => {
    expect(isCanonicalFinding(noCitation)).toBe(false);
    expect(isCanonicalFinding(unverified)).toBe(false);
    expect(selectFindings([verified, noCitation, unverified])).toEqual([verified]);
  });

  it("allows audit tooling to request quarantined rows explicitly", () => {
    expect(
      selectFindings([verified, noCitation], { includeQuarantined: true }),
    ).toHaveLength(2);
  });

  it("does not publish a finding while semantic verification is still pending", () => {
    expect(
      isCanonicalFinding({
        source_module: "agent:procedural_violations",
        verification_status: null,
      }),
    ).toBe(false);
  });

  it.each([
    undefined,
    { version: 1, verdict: "insufficient", hash: "snapshot" },
    { version: 1, verdict: "contradicted", hash: "snapshot" },
    { version: 1, verdict: "supported", hash: "" },
  ])("requires positive semantic certification before canonical publication", (semantic_support_review) => {
    const finding = {
      source_module: "agent:procedural_violations",
      verification_status: "verified",
      finding_status: "candidate",
      metadata: semantic_support_review ? { semantic_support_review } : {},
    };
    expect(isCanonicalFinding(finding)).toBe(false);
  });
});


describe("claim entailment quarantine boundary", () => {
  const verified = {
    id: "verified",
    source_module: "agent:constitutional_rights_mapping",
    verification_status: "verified",
    finding_status: "candidate",
    metadata: {
      semantic_support_review: {
        version: 1,
        verdict: "supported",
        hash: "current-support-snapshot",
      },
      claim_entailment_diagnostic: {
        claim_action: "KEEP",
        final_reportable: true,
        entailment_status: "ENTAILED",
      },
    },
  };
  const rejectedDiagnostics = [
    { claim_action: "REMOVE", final_reportable: false, entailment_status: "NOT_ENTAILED" },
    { claim_action: "KEEP", final_reportable: false, entailment_status: "ENTAILED" },
    { claim_action: "REMOVE", final_reportable: true, entailment_status: "ENTAILED" },
  ];
  const quarantinedStatuses = ["quarantined", "unverified", "no_citation"];

  it("includes verified KEEP findings that are reportable and entailed", () => {
    expect(isCanonicalFinding(verified)).toBe(true);
    expect(selectFindings([verified])).toEqual([verified]);
  });

  it.each(quarantinedStatuses)("excludes %s even with an accepted claim diagnostic", (verification_status) => {
    const finding = { ...verified, verification_status };
    expect(isCanonicalFinding(finding)).toBe(false);
    expect(selectFindings([finding])).toEqual([]);
  });

  it.each(rejectedDiagnostics)(
    "excludes verified findings with claim_action=$claim_action and final_reportable=$final_reportable",
    (diagnostic) => {
      const finding = { ...verified, metadata: {
          semantic_support_review: {
            version: 1,
            verdict: "supported",
            hash: "current-support-snapshot",
          },
          claim_entailment_diagnostic: diagnostic,
        } };
      expect(isCanonicalFinding(finding)).toBe(false);
      expect(selectFindings([finding])).toEqual([]);
    },
  );

  it("excludes the production quarantined REMOVE/non-reportable/NOT_ENTAILED finding", () => {
    const finding = {
      ...verified,
      verification_status: "quarantined",
      metadata: { claim_entailment_diagnostic: rejectedDiagnostics[0] },
    };
    expect(isCanonicalFinding(finding)).toBe(false);
    expect(selectFindings([finding])).toEqual([]);
  });

  it("keeps rejected findings out of both canonical report and scoring inputs", () => {
    const findings = [
      verified,
      ...quarantinedStatuses.map((verification_status) => ({
        ...verified,
        id: verification_status,
        verification_status,
      })),
      ...rejectedDiagnostics.map((diagnostic, index) => ({
        ...verified,
        id: `rejected-${index}`,
        metadata: {
          semantic_support_review: {
            version: 1,
            verdict: "supported",
            hash: "current-support-snapshot",
          },
          claim_entailment_diagnostic: diagnostic,
        },
      })),
    ];
    const args = {
      caseRow: {
        discovery_at: "2026-01-01T00:00:00Z",
        contradiction_at: "2026-01-01T00:01:00Z",
        evidence_intel_at: "2026-01-01T00:02:00Z",
        scored_at: "2026-01-01T00:03:00Z",
      },
      findings,
    };
    expect(getCanonicalReportFindings(args).map((f) => f.id)).toEqual(["verified"]);
    expect(getCanonicalScoringFindings(args).map((f) => f.id)).toEqual(["verified"]);
    expect(selectFindings(findings).map((f) => f.id)).toEqual(["verified"]);
  });

  it("preserves explicit audit access to quarantined findings", () => {
    const finding = {
      ...verified,
      verification_status: "quarantined",
      metadata: { claim_entailment_diagnostic: rejectedDiagnostics[0] },
    };
    expect(selectFindings([finding], { includeQuarantined: true })).toEqual([finding]);
  });
});

describe("ADR semantic evidence integrity", () => {
  const base = {
    source_module: "agent:constitutional_rights_mapping",
    verification_status: "verified",
    finding_status: "candidate",
    audit_classification: "VERIFIED_COURT_HOLDING",
    evidence_refs: [] as Array<{ quote: string }>,
  };

  it("rejects SCJN non-exemption claims not entailed by an overturned-lower-court quote", () => {
    const finding = {
      ...base,
      title: "Aplicabilidad de la exención fiscal",
      description: "La SCJN determinó que el ISSSTE no está exento del pago de impuestos locales.",
      source_quote: "El Pleno de la SCJN determina que fue incorrecto tanto el fallo del Tribunal Colegiado, como de la autoridad responsable, en relación con el impuesto predial.",
      evidence_refs: [{ quote: "El Pleno de la SCJN determina que fue incorrecto tanto el fallo del Tribunal Colegiado, como de la autoridad responsable, en relación con el impuesto predial." }],
    };
    expect(isCanonicalFinding(finding)).toBe(false);
    expect(selectFindings([finding])).toEqual([]);
  });

  it("rejects procedencia conclusions supported only by a competence quote", () => {
    const finding = {
      ...base,
      title: "Procedencia del recurso de revisión",
      description: "El recurso fue procedente debido a cuestiones constitucionales no atendidas.",
      source_quote: "El Pleno de esta SCJN es competente para conocer del presente asunto.",
      evidence_refs: [{ quote: "El Pleno de esta SCJN es competente para conocer del presente asunto." }],
    };
    expect(isCanonicalFinding(finding)).toBe(false);
  });

  it("rejects an unclassified generated theory with zero evidence references", () => {
    const finding = {
      source_module: "engine:theory:tercero_interesado",
      verification_status: "verified",
      finding_status: "candidate",
      audit_classification: null,
      source_quote: "Loose quote not bound as evidence.",
      evidence_refs: [],
    };
    expect(isCanonicalFinding(finding)).toBe(false);
  });
});

describe("ADR semantic evidence provenance isolation", () => {
  it("does not let an unrelated secondary quote cure an inverted primary holding", () => {
    const finding = {
      source_module: "agent:constitutional_rights_mapping",
      verification_status: "verified",
      finding_status: "candidate",
      audit_classification: "VERIFIED_COURT_HOLDING",
      title: "Aplicabilidad de la exención fiscal",
      description: "La SCJN determinó que el ISSSTE no está exento del pago de impuestos locales.",
      source_quote:
        "El Pleno determinó que fue incorrecto el fallo del Tribunal Colegiado respecto del impuesto predial.",
      evidence_refs: [
        {
          document_id: "unrelated-document",
          quote: "Una parte alegó que el organismo no está exento de contribuciones locales.",
        },
      ],
    };

    expect(isCanonicalFinding(finding)).toBe(false);
    expect(selectFindings([finding])).toEqual([]);
  });

  it("does not let a procedencia quote cure a competence-only primary quote", () => {
    const finding = {
      source_module: "agent:constitutional_rights_mapping",
      verification_status: "verified",
      finding_status: "candidate",
      audit_classification: "VERIFIED_COURT_HOLDING",
      title: "Procedencia del recurso de revisión",
      description: "El recurso fue procedente debido a cuestiones constitucionales no atendidas.",
      source_quote: "El Pleno de esta SCJN es competente para conocer del presente asunto.",
      evidence_refs: [
        {
          document_id: "different-resolution",
          quote: "En otro expediente se declaró procedente un recurso diverso.",
        },
      ],
    };

    expect(isCanonicalFinding(finding)).toBe(false);
  });
});
