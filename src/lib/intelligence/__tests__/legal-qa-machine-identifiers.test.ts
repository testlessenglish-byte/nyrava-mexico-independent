import { describe, expect, it } from "vitest";
import {
  collectLegalQaStringsForTest,
  remediateLegalQaJsonForTest,
} from "../legal-qa.server";
import { auditText } from "../mx-terminology";

describe("Legal QA machine identifier boundary", () => {
  it("preserves and excludes machine identifiers while retaining substantive prose", () => {
    const input = {
      case_type_manifest: {
        enabled_engines: ["discovery_gaps", "legal_qa"],
        skipped_engines: ["discovery_request"],
        enabled_sections: ["discovery", "facts"],
        enabled_tabs: ["report", "discovery"],
        cross_domain_engines: ["discovery_gaps"],
        execution_profile: {
          standing: "La autoridad debe justificar el acto.",
        },
      },
      prose: {
        recommendation: "La estrategia recomienda realizar discovery antes de promover la accion.",
      },
    };

    const replacements: { from: string; to: string }[] = [];
    const remediated = remediateLegalQaJsonForTest(
      input,
      "migratorio",
      replacements,
    ) as typeof input;

    expect(remediated.case_type_manifest.enabled_engines).toEqual([
      "discovery_gaps",
      "legal_qa",
    ]);
    expect(remediated.case_type_manifest.enabled_sections).toEqual([
      "discovery",
      "facts",
    ]);

    const strings: string[] = [];
    collectLegalQaStringsForTest(remediated, strings);

    expect(strings).not.toContain("discovery");
    expect(strings).not.toContain("discovery_gaps");
    expect(strings).toContain("La autoridad debe justificar el acto.");
  });

  it.each([
    "migratorio",
    "penal",
    "amparo",
    "civil",
    "familiar",
    "mercantil",
    "laboral",
    "administrativo",
  ] as const)(
    "keeps real discovery terminology blocking for %s attorney prose",
    (profile) => {
      const violations = auditText("Debe solicitarse discovery.", {
        profile,
        locale: "es",
      });

      expect(
        violations.some(
          (v) =>
            v.kind === "us_terminology" &&
            v.severity === "blocking" &&
            /discovery/i.test(v.match),
        ),
      ).toBe(true);
    },
  );
});
