import { describe, it, expect } from "vitest";
import { mapInternalToSubscriberStatus } from "../../components/reports/subscriber-status-mapper";
import { PdfBuilder } from "../export";

describe("Report Download States — Universal Across Materias", () => {
  // Test 1: PDF exists + PASS → Descargar informe final
  it("PDF exists + PASS -> Descargar informe final", () => {
    const status = mapInternalToSubscriberStatus({
      hasReport: true,
      isBlocked: false,
      releaseDecision: "PASS",
      qualityBlockReasons: [],
    });
    expect(status.type).toBe("ready");
    expect(status.canDownloadPdf).toBe(true);
    expect(status.downloadButtonLabel).toBe("Descargar informe final");
    expect(status.isDraftReview).toBe(false);
  });

  // Test 2: PDF exists + BLOCKED → Descargar borrador para revisión
  it("PDF exists + BLOCKED -> Descargar borrador para revisión", () => {
    const status = mapInternalToSubscriberStatus({
      hasReport: true,
      isBlocked: true,
      releaseDecision: "BLOCK",
      qualityBlockReasons: ["citation verification unresolved"],
    });
    expect(status.type).toBe("in_review");
    expect(status.canDownloadPdf).toBe(true);
    expect(status.downloadButtonLabel).toBe("Descargar borrador para revisión");
    expect(status.isDraftReview).toBe(true);
    expect(status.statusMessage).toBe("Informe en revisión");
  });

  // Test 3: No PDF + BLOCKED → no PDF button
  it("No PDF + BLOCKED -> no PDF button", () => {
    const status = mapInternalToSubscriberStatus({
      hasReport: false,
      isBlocked: true,
      releaseDecision: "BLOCK",
      qualityBlockReasons: ["citation verification unresolved"],
    });
    expect(status.type).toBe("in_review");
    expect(status.canDownloadPdf).toBe(false);
    expect(status.downloadButtonLabel).toBeUndefined();
    expect(status.statusMessage).toBe("Informe en revisión");
  });
});

describe("PDF Content Rules — BLOCKED/needs_revision vs PASS", () => {
  it("BLOCKED/needs_revision review PDF must NOT contain DOCUMENTO AUDITADO or INFORME FINAL, and must contain BORRADOR — REQUIERE REVISIÓN", () => {
    const b = new PdfBuilder("Caso Prueba Borrador", "MAT-001", true);
    expect(b.isDraftReview).toBe(true);

    // Render cover
    b.premiumCover({
      reportTitle: "INFORME DE INTELIGENCIA JURÍDICA",
      caseName: "Caso Prueba Borrador",
      matterType: "Familiar",
      court: "Juzgado Familiar",
    });

    // Render an interior page
    b.pageBreak();
    b.text("Contenido del borrador para revisión técnica.");

    // Render closing page
    b.closingPage({ generatedAt: "2026-09-25T23:00:00.000Z" });
    b.finalizeLayout();

    const rendered = b.renderedText.join("\n");

    // Invariant: Must NOT contain "DOCUMENTO AUDITADO" or "INFORME FINAL"
    expect(rendered).not.toContain("DOCUMENTO AUDITADO");
    expect(rendered).not.toContain("D O C U M E N T O   A U D I T A D O");
    expect(rendered).not.toContain("INFORME FINAL");

    // Invariant: Must contain "BORRADOR - REQUIERE REVISIÓN" in header/badge
    expect(rendered).toContain("BORRADOR - REQUIERE REVISIÓN");
    expect(rendered).toContain("B O R R A D O R");
    expect(rendered).toContain("F I N   D E L   B O R R A D O R");
  });

  it("PASS/released PDF generates clean final PDF with DOCUMENTO AUDITADO and without draft warning", () => {
    const b = new PdfBuilder("Caso Prueba Final", "MAT-002", false);
    expect(b.isDraftReview).toBe(false);

    // Render cover
    b.premiumCover({
      reportTitle: "INFORME DE INTELIGENCIA JURÍDICA",
      caseName: "Caso Prueba Final",
      matterType: "Familiar",
      court: "Juzgado Familiar",
    });

    // Render an interior page
    b.pageBreak();
    b.text("Contenido del informe definitivo.");

    // Render closing page
    b.closingPage({ generatedAt: "2026-09-25T23:00:00.000Z" });
    b.finalizeLayout();

    const rendered = b.renderedText.join("\n");

    // Invariant: Clean final report contains DOCUMENTO AUDITADO
    expect(rendered).toContain("D O C U M E N T O   A U D I T A D O");
    // Must NOT contain draft review warnings
    expect(rendered).not.toContain("BORRADOR");
    expect(rendered).not.toContain("REQUIERE REVISIÓN");
  });
});
