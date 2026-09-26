import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { generateMockReportPdf } from "../../../../scripts/generate-mock-pdf";
import { extractText } from "unpdf";

describe("Synthetic Sample Report Generation", () => {
  it("generates a 6-page professional PDF matching pass 2 visual direction", async () => {
    const pdfBytes = generateMockReportPdf();
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(50000);

    // Save to public and to artifacts directory
    const outDir = join(process.cwd(), "public/sample-pdf");
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, "nyrava-mexico-sample-report.pdf");
    writeFileSync(outPath, pdfBytes);

    const artifactPath = "C:\\Users\\nyrav\\.gemini\\antigravity\\brain\\16b028ba-fcd1-4040-94db-800dd91dcc8c\\nyrava-mexico-sample-report.pdf";
    writeFileSync(artifactPath, pdfBytes);

    // Extract text from the generated PDF to verify selectable vector text
    const extracted = await extractText(pdfBytes);
    expect(extracted.totalPages).toBe(6);

    const text = extracted.text.join("\n");
    // Normalize spaced small-caps (e.g. "R E S U M E N" -> "RESUMEN") for matching
    const unspaced = text.replace(/([A-ZÁÉÍÓÚÑ])\s(?=[A-ZÁÉÍÓÚÑ])/g, "$1");

    // Verify Page 1 metadata
    expect(unspaced).toContain("CLIENTE / ASUNTO");
    expect(unspaced).toContain("DESCRIPCIÓN");
    expect(text).toContain("ADR 6433/2022");
    expect(text).toContain("391d6d76-8f20-498c-b01a-8c831f29b9f1");
    expect(text).toContain("Lic. Roberto González M.");

    // Verify Page 2 Executive Snapshot
    expect(text).toContain("Informe de Inteligencia Jurídica");
    expect(text).toContain("Se revoca la sentencia recurrida");
    expect(text).toContain("discriminación al aplicar presunciones");
    expect(text).toContain("82 / 100");
    expect(text).toContain("24 / 100");
    expect(text).toContain("EVIDENCIA AUDITADA");

    // Verify Page 3 Executive Summary
    expect(text).toContain("El recurso de revisión resulta plenamente procedente");
    expect(text).toContain("PUNTO DE");

    // Verify Page 4 Findings
    expect(text).toContain("Discriminación basada en roles de género");
    expect(text).toContain("el órgano de amparo justificó otorgar la custodia");
    expect(text).toContain("230919-ADR-6433-2022.pdf");

    // Verify Page 5 Source Appendix
    expect(text).toContain("Sentencia Analizada (SCJN)");
    expect(text).toContain("fidelidad del texto fue cotejada");

    // Verify Page 6 Closing Page
    expect(text).toContain("mexico.nyrava.com");
    expect(text).toContain("Motor de Inteligencia v1.0.0");
    expect(text).toContain("Este informe fue elaborado mediante el sistema Nyrava Intelligence");
  }, 30000);

  it("does not trigger CONTENT_OUTSIDE_PRINTABLE_BOUNDS on 12-page report closingPage", async () => {
    const { PdfBuilder } = await import("../../export");
    const b = new PdfBuilder("Test 12-Page Case", "TEST-MATTER-12");
    // Simulate 11 pages of content
    for (let p = 2; p <= 11; p++) {
      b.pageBreak();
      b.text(`Page ${p} interior content`, { size: 10 });
    }
    // Page 12: closing page
    b.closingPage({ generatedAt: "2026-09-25T20:00:00.000Z" });
    // finalizeLayout runs auditPdfLayout and assertPdfLayout
    expect(() =>
      b.finalizeLayout({ parity: "ABC", ess: "HIGH", generatedAt: "2026-09-25T20:00:00.000Z" }),
    ).not.toThrow();
    expect(b.finalPageCount).toBe(12);
  }, 30000);
});

