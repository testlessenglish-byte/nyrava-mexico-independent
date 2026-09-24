import {it,expect} from 'vitest';
import {composeFinalReportPayload} from '../final-report-contract';
const quote='ÚNICO. Devuélvanse los autos al Tribunal Colegiado en Materia Administrativa del Primer Circuito para que dicte la sentencia que corresponda en el amparo en revisión 17/2024 de su índice.';
function input():any {return {case:{case_type:'amparo',case_analysis_mode:'concluded_audit'},documents:[{id:'doc',filename:'judgment.pdf'}],findings:[],analysis:null,agents:[],score:null,report:{report_mode:'LIMITED',scores_suppressed:true,full_report:{
 source_audit:{canonical_sources:[{document_id:'doc',canonical_source_id:'doc',original_filename:'judgment.pdf',source_aliases:[]}]},
 pre_release_source_pages:[{document_id:'doc',page:7,text:quote,filename:'judgment.pdf'}],
 mandatory_decision_core:{items:[{id:'order',kind:'DISPOSITION',text:quote,speaker_role:'scjn',source_refs:[{document_id:'doc',quote,page:2}]}]}
}}};}
it('builds a receiving-court registry and appendix from the literal operative order without another AI call',()=>{
 const out=composeFinalReportPayload(input()),full:any=out.report!.full_report;
 expect(full.proceeding_registry).toEqual([expect.objectContaining({number:'17/2024',court:'Tribunal Colegiado en Materia Administrativa del Primer Circuito',proceeding:'amparo en revisión',relationship:'órgano receptor de los autos',source_refs:[expect.objectContaining({page:7,quote})]})]);
 expect(out.report!.citations).toEqual(expect.arrayContaining([expect.objectContaining({page:7,quote})]));
});
it('does not infer a receiving court from an unverified model order',()=>{
 const data=input();data.report.full_report.pre_release_source_pages[0].text='Other text';
 expect((composeFinalReportPayload(data).report!.full_report as any).proceeding_registry??[]).toEqual([]);
});
it('identifies the issuing Supreme Court separately from the court receiving the remand',()=>{
 const data=input();data.case.court='Tribunal Colegiado';
 data.report.full_report.migratorio_disposition={status:'verified',items:[{...data.report.full_report.mandatory_decision_core.items[0],source_refs:[{document_id:'doc',page:7,quote}]}],history:[]};
 expect(composeFinalReportPayload(data).report_presentation.issuing_court).toBe('Suprema Corte de Justicia de la Nación');
 data.report.full_report.pre_release_source_pages=[];
 expect(composeFinalReportPayload(data).report_presentation.issuing_court).toBeUndefined();
});
