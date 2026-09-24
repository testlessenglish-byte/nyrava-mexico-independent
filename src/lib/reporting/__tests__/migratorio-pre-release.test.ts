import {describe,it,expect} from 'vitest';
import {validateMigratorioPreRelease} from '../migratorio-pre-release';
import type {CaseExportData} from '../../export';
function fixture(): CaseExportData {
  const text='ÚNICO. Devuélvanse los autos al Tribunal Colegiado para resolver el amparo en revisión 12/2021.';
  const ref={document_id:'source',doc_n:1,page:2,filename:'sentencia.pdf',quote:text};
  const order={id:'order',kind:'DISPOSITION',speaker_role:'scjn',text,source_refs:[ref]};
  return {case:{case_type:'migratorio',case_analysis_mode:'concluded_audit'},documents:[{id:'source',filename:'sentencia.pdf'}],
    findings:[],agents:[],analysis:null,score:null,report:{executive_summary:text+' [DOC 1 p.2]',citations:[ref],full_report:{
      pre_release_source_pages:[{document_id:'source',filename:'sentencia.pdf',page:2,text}],
      proceeding_registry:[{number:'12/2021',court:'Tribunal Colegiado',proceeding:'Amparo en revisión',relationship:'receptor',source_refs:[ref]}],
      mandatory_decision_core:{items:[order]},migratorio_disposition:{status:'verified',items:[order],history:[]}}}};
}
describe('Migratorio source-based pre-release checks',()=>{
  it('blocks a narrative page reference missing from the annex',()=>{
    const d=fixture();
    d.report!.executive_summary += ' [DOC 1 p.13]';
    expect(validateMigratorioPreRelease(d).errors.join(' ')).toContain('DOC 1 p.13 sin pasaje verificable');
  });
  it('passes a sourced, attributed return order',()=>expect(validateMigratorioPreRelease(fixture()).ok).toBe(true));
  it.each(['outcome','number','document','quote','citation','recommendation','inventory','history'])( 'blocks %s regression', defect=>{
    const d=fixture(), r=d.report as any, f=r.full_report;
    if(defect==='outcome')d.findings=[{id:'bad',speaker_role:'scjn',title:'Concesión de amparo',description:'La sentencia concede el amparo.'}];
    if(defect==='number')f.proceeding_registry[0].court='';
    if(defect==='document')r.citations[0].document_id='not-uploaded';
    if(defect==='quote')r.citations[0].quote='Se concede el amparo.';
    if(defect==='citation')r.executive_summary+=' [99]';
    if(defect==='recommendation')f.canonical_recommendations=[{title:'Interponer recurso administrativo'}];
    if(defect==='inventory')r.case_overview='El material disponible incluye la demanda y los oficios del INM.';
    if(defect==='history')f.migratorio_disposition.history=[f.migratorio_disposition.items[0]];
    expect(validateMigratorioPreRelease(d).ok).toBe(false);
  });
});
