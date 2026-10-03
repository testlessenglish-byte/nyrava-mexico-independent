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

describe('actual review download boundary', () => {
  const source = 'La parte recurrente cuenta con legitimación para presentar el recurso de revisión.';
  const data = () => ({case:{id:'case',name:'Caso revisión'},documents:[{id:'doc',doc_n:1,filename:'sentencia.pdf'}],
    findings:[{id:'f',title:'UNSUPPORTED TITLE',description:'UNSUPPORTED CONCLUSION',source_document_id:'doc',source_page:2,source_quote:source}],
    agents:[],report:{quality_blocked:true,quality_block_reasons:['publication_citation_missing'],
      executive_summary:'UNSUPPORTED SUMMARY',full_report:{pre_release_source_pages:[{document_id:'doc',page:2,text:source}]}}}) as any;
  it('downloads an explicitly branded review PDF without releasing blocked conclusions',async()=>{
    const {downloadReportPdf}=await import('../export');
    const {extractText}=await import('unpdf');
    const input=data(),before=structuredClone(input);
    const bytes=await downloadReportPdf(input,'Caso revisión',{validateOnly:true});
    expect(new TextDecoder().decode(new Uint8Array(bytes).slice(0,5))).toBe('%PDF-');
    const result=await extractText(new Uint8Array(bytes),{mergePages:true});
    expect(result.text).toContain('BORRADOR');
    expect(result.text).toContain('publication_citation_missing');
    expect(result.text).toContain(source);
    expect(result.text).toMatch(/sentencia\.pdf/i);
    expect(result.text).not.toMatch(/UNSUPPORTED|DOCUMENTO AUDITADO|INFORME FINAL/);
    expect(input).toEqual(before);
  });
  it('withholds a review excerpt when its physical source page does not contain it',async()=>{
    const {downloadReportPdf}=await import('../export');
    const {extractText}=await import('unpdf');
    const input=data();input.report.full_report.pre_release_source_pages[0].text='Texto diferente.';
    const bytes=await downloadReportPdf(input,'Caso revisión',{validateOnly:true});
    const result=await extractText(new Uint8Array(bytes),{mergePages:true});
    expect(result.text).not.toContain(source);
  });
  it('uses the report language for review instructions while preserving source quotations',async()=>{
    const {downloadReportPdf}=await import('../export');
    const {extractText}=await import('unpdf');
    const input=data();input.case.report_language='en';input.report.generated_language='en';
    const bytes=await downloadReportPdf(input,'Review case',{validateOnly:true});
    const result=await extractText(new Uint8Array(bytes),{mergePages:true});
    expect(result.text).toContain('Review status');
    expect(result.text).toContain('Do not file');
    expect(result.text).toContain('DRAFT');
    expect(result.text).toMatch(/page 2/i);
    expect(result.text).toContain(source);
    expect(result.text).not.toContain('Este borrador permite revisar');
  });
  it('continues to reject final PDF publication of a blocked report',async()=>{
    const {downloadPdf}=await import('../export');
    await expect(downloadPdf(data(),'Caso revisión',{validateOnly:true})).rejects.toThrow('REPORT_BLOCKED');
  });
});
