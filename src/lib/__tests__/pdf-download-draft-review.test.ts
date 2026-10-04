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
  const data = () => ({case:{id:'case',name:'Caso revisión',case_type:'familiar'},documents:[{id:'doc',doc_n:1,filename:'sentencia.pdf'}],
    findings:[{id:'f',title:'UNSUPPORTED TITLE',description:'UNSUPPORTED CONCLUSION',source_document_id:'doc',source_page:2,source_quote:source}],
    agents:[],report:{quality_blocked:true,quality_block_reasons:['publication_citation_missing'],
      executive_summary:'UNSUPPORTED SUMMARY',full_report:{pre_release_source_pages:[{document_id:'doc',page:2,text:source}]}}}) as any;
  it('rejects an unsupported review report instead of substituting an excerpt-only PDF',async()=>{
    const {downloadReportPdf}=await import('../export');
    const input=data(),before=structuredClone(input);
    await expect(downloadReportPdf(input,'Caso revisión',{validateOnly:true})).rejects.toThrow(/REPORT_CONTRACT_BLOCKED|REPORT_SUBSTANTIVE_CONTENT_MISSING/);
    expect(input).toEqual(before);
  });
  it('rejects a review report whose quotation is absent from its physical source page',async()=>{
    const {downloadReportPdf}=await import('../export');
    const input=data();input.report.full_report.pre_release_source_pages[0].text='Texto diferente.';
    await expect(downloadReportPdf(input,'Caso revisión',{validateOnly:true})).rejects.toThrow(/REPORT_CONTRACT_BLOCKED|REPORT_SUBSTANTIVE_CONTENT_MISSING/);
  });
  it('enforces the same review content contract for English reports',async()=>{
    const {downloadReportPdf}=await import('../export');
    const input=data();input.case.report_language='en';input.report.generated_language='en';
    await expect(downloadReportPdf(input,'Review case',{validateOnly:true})).rejects.toThrow(/REPORT_CONTRACT_BLOCKED|REPORT_SUBSTANTIVE_CONTENT_MISSING/);
  });
  it('continues to reject final PDF publication of a blocked report',async()=>{
    const {downloadPdf}=await import('../export');
    await expect(downloadPdf(data(),'Caso revisión',{validateOnly:true})).rejects.toThrow('REPORT_BLOCKED');
  });
});


describe('complete attorney review report',()=>{
  it.each([false,true])('retains substantive findings and full report structure (unspecified party attribution: %s)',async(unspecifiedParty)=>{
    const {downloadReportPdf}=await import('../export');
    const {extractText}=await import('unpdf');
    const quote='La Sala determina que se desecha el recurso de revisión y queda firme la sentencia recurrida.';
    const data:any={case:{id:'case',execution_id:'run',name:'Sentencia revisada',case_type:'amparo',case_analysis_mode:'concluded_audit',report_language:'es'},
      documents:[{id:'doc',filename:'sentencia.pdf',doc_n:1,canonical_source_id:'doc'}],agents:[],analysis:null,score:null,
      findings:[{id:'f',case_id:'case',execution_id:'run',title:'Desestimación del recurso',finding_type:'DIRECT_EVIDENCE',description:quote,source_document_id:'doc',source_page:2,source_quote:quote,speaker_role:'scjn',proposition_type:'holding',adoption_status:'adopted',severity:'high',finding_status:'verified',verification_status:'verified',evidence_refs:[{document_id:'doc',page:2,quote}]}],
      report:{quality_blocked:true,status:'needs_revision',release_decision:'BLOCK',quality_block_reasons:['final_report_contract:citation_integrity:report_presentation.finding_cards[0]:publication_citation_missing'],report_mode:'LIMITED',created_at:'2026-10-03T12:00:00Z',executive_summary:'La sentencia documenta la desestimación del recurso de revisión y la firmeza de la sentencia recurrida. El alcance de esta revisión se limita al documento aportado.',full_report:{pre_release_source_pages:[{document_id:'doc',page:2,text:quote}],assessment_limitations:{underlying_record_absent:true},mandatory_decision_core:{items:[{id:'disposition',kind:'DISPOSITION',text:quote,speaker_role:'scjn',adoption_status:'adopted',source_refs:[{document_id:'doc',page:2,quote}]}]}}}};
    if(unspecifiedParty){
      const {supportInput}=await import('../intelligence/claim-support-review');
      const f=data.findings[0],partyQuote='El recurrente estima que la suplencia sí opera en términos del artículo 79 de la Ley de Amparo.';
      f.title='Suplencia de la queja';f.description='El recurrente sostiene que no se aplicó correctamente la suplencia de la queja.';
      f.source_quote=partyQuote;f.speaker_role=null;f.proposition_type=null;f.adoption_status=null;
      f.evidence_refs=[{document_id:'doc',page:2,quote:partyQuote}];
      data.report.full_report.pre_release_source_pages[0].text+=' '+partyQuote;
      f.metadata={semantic_support_review:{version:1,verdict:'supported',hash:supportInput(f,data.report.full_report.pre_release_source_pages).hash,supporting_quote:partyQuote,reason:'Independent review of the complete party statement.'}};
    }
    data.report.executive_summary+=' El expediente respalda la pretensión del cliente.';
    data.report.full_report.objective={question:'¿Qué resolvió el tribunal?',answer:quote+' [DOC 1 p.2]'};
    const before=structuredClone(data),bytes=await downloadReportPdf(data,'Sentencia revisada',{validateOnly:true});
    const result=await extractText(new Uint8Array(bytes),{mergePages:true});
    expect(result.text).toContain(unspecifiedParty?'Suplencia de la queja':'Desestimación del recurso');
    expect(result.text).toContain('Índice');
    expect(result.text).toContain('Fuentes de Evidencia');
    expect(result.text).toContain('Suprema Corte de Justicia de la Nación');
    expect(result.text).not.toContain('respalda la pretensión');
    expect(result.text).not.toMatch(/\[DOC\s+\d/);
    expect(result.text).toMatch(/EVIDENCIA\s+DIRECTA/);
    expect(result.text).toContain('La sentencia documenta la desestimación');
    expect(result.text).toMatch(/sentencia\.pdf/i);
    expect(result.text).toMatch(/BORRADOR/);
    expect(result.text).not.toMatch(/final_report_contract|publication_citation_missing|finding_cards\[/);
    expect(data).toEqual(before);
  });
});
