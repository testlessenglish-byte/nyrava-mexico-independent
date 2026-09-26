import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mapInternalToSubscriberStatus,
  type ReportStatusInput,
} from "../subscriber-status-mapper";

const root = process.cwd();
const downloadsCardSrc = readFileSync(
  join(root, "src", "components", "reports", "ReportDownloadsCard.tsx"),
  "utf8",
);
const casesPageSrc = readFileSync(
  join(root, "src", "routes", "_authenticated", "cases.$caseId.tsx"),
  "utf8",
);
const reportsPageSrc = readFileSync(
  join(root, "src", "routes", "_authenticated", "reports.tsx"),
  "utf8",
);
const reportRecoverySrc = readFileSync(
  join(root, "src", "components", "ReportRecovery.tsx"),
  "utf8",
);

describe("Subscriber Download Area Cleanup — Presentation Mapper", () => {
  it("Scenario 1: Report Passes — allows PDF download with clean DESCARGAS title", () => {
    const input: ReportStatusInput = {
      hasReport: true,
      isBlocked: false,
      releaseDecision: "PASS",
      qualityBlockReasons: [],
    };
    const result = mapInternalToSubscriberStatus(input);
    expect(result.type).toBe("ready");
    expect(result.title).toBe("DESCARGAS");
    expect(result.statusMessage).toBeUndefined();
    expect(result.canDownloadPdf).toBe(true);
    expect(result.isRetryable).toBe(false);
  });

  it("Scenario 2: Report Blocked with internal gate errors — maps to calm 'Informe en revisión'", () => {
    const input: ReportStatusInput = {
      hasReport: true,
      isBlocked: true,
      releaseDecision: "BLOCK",
      qualityBlockReasons: [
        "gate:document_purpose: Document purpose or client-evidence connection is unresolved",
        "citation failure: missing required authority citation",
      ],
    };
    const result = mapInternalToSubscriberStatus(input);
    expect(result.type).toBe("in_review");
    expect(result.title).toBe("DESCARGAS");
    expect(result.statusMessage).toBe("Informe en revisión");
    expect(result.description).toBe(
      "Nyrava está verificando la información del expediente antes de liberar la versión final.",
    );
    expect(result.canDownloadPdf).toBe(false);
    expect(result.isRetryable).toBe(true);

    // Verify subscriber message contains NO raw gate names or internal strings
    expect(result.statusMessage).not.toContain("gate:");
    expect(result.description).not.toContain("gate:");
    expect(result.description).not.toContain("unresolved");
    expect(result.description).not.toContain("citation failure");
  });

  it("Scenario 3: Provider timeout / API failure — maps to friendly retry message", () => {
    const input: ReportStatusInput = {
      hasReport: false,
      isBlocked: true,
      caseStatus: "failed",
      errorMessage: "Provider timeout after 60s: failed to fetch upstream model response",
    };
    const result = mapInternalToSubscriberStatus(input);
    expect(result.type).toBe("retry_needed");
    expect(result.title).toBe("DESCARGAS");
    expect(result.statusMessage).toBe("No pudimos completar el análisis");
    expect(result.description).toBe(
      "Intente reanalizar el expediente o contacte a soporte si el problema persiste.",
    );
    expect(result.canDownloadPdf).toBe(false);
    expect(result.isRetryable).toBe(true);

    // Verify no raw provider or timeout text in subscriber status
    expect(result.statusMessage).not.toContain("timeout");
    expect(result.description).not.toContain("upstream");
  });

  it("Scenario 4: Empty case state — returns empty message without download or retry", () => {
    const input: ReportStatusInput = {
      hasReport: false,
      isBlocked: false,
    };
    const result = mapInternalToSubscriberStatus(input);
    expect(result.type).toBe("empty");
    expect(result.canDownloadPdf).toBe(false);
    expect(result.isRetryable).toBe(false);
  });
});

describe("Subscriber Download Area Cleanup — Codebase Invariants", () => {
  it("ReportDownloadsCard enforces strict subscriber vs admin separation", () => {
    // Subscriber DOM branch must never contain raw JSON button
    expect(downloadsCardSrc).toContain("isPrivileged");
    expect(downloadsCardSrc).toContain("admin-download-json-button");
    expect(downloadsCardSrc).toContain("Vista técnica (Admin / Soporte)");

    // No screaming red banners in component
    expect(downloadsCardSrc).not.toContain("EVIDENCE VERIFICATION FAILED — DO NOT FILE AS-IS");
    expect(downloadsCardSrc).not.toContain("El informe necesita revisión antes de descargarlo");
  });

  it("cases.$caseId.tsx completely eliminates raw error box and un-gated JSON button", () => {
    // The red EVIDENCE VERIFICATION FAILED box is gone from cases.$caseId.tsx
    expect(casesPageSrc).not.toContain("EVIDENCE VERIFICATION FAILED — DO NOT FILE AS-IS");

    // ReportDownloadsCard is wired into cases.$caseId.tsx
    expect(casesPageSrc).toContain("<ReportDownloadsCard");

    // ReportTab sanitizes qualityBlocked banner for subscribers
    expect(casesPageSrc).toContain("Informe en revisión");
    expect(casesPageSrc).toContain("Control de calidad (Admin):");
  });

  it("reports.tsx completely eliminates raw error box and un-gated JSON button", () => {
    // The red EVIDENCE VERIFICATION FAILED box is gone from reports.tsx
    expect(reportsPageSrc).not.toContain("EVIDENCE VERIFICATION FAILED — DO NOT FILE AS-IS");

    // ReportDownloadsCard is wired into reports.tsx
    expect(reportsPageSrc).toContain("<ReportDownloadsCard");

    // Execution ID and engine names are gated behind isPrivileged
    expect(reportsPageSrc).toContain("isPrivileged && (report as { execution_id");
    expect(reportsPageSrc).toContain("isPrivileged && Object.keys(engines).length > 0");
  });

  it("ReportRecovery.tsx gates technical details behind isAdmin", () => {
    // Technical details with raw reasons are protected behind isAdmin
    expect(reportRecoverySrc).toContain("isAdmin");
    expect(reportRecoverySrc).toContain("{isAdmin && (");
  });
});
