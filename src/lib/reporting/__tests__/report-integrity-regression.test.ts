import { describe, expect, it } from 'vitest';
import { composeFinalReportPayload } from '../final-report-contract';
import { computeCaseStrengthDisagreement } from '../../intelligence/case-state.server';
import { classifyContradiction } from '../../intelligence/dispute-classifier.server';
import { conflictsWithCurrentDisposition, verifyContradictionPairs } from '../report-evidence-integrity';

const order = 'ÚNICO. Devuélvanse los autos al Tribunal Colegiado para que dicte la sentencia que corresponda.';
function input(): any {
  return {case:{case_type:'migratorio',case_analysis_mode:'concluded_audit'},documents:[{id:'doc',filename:'sentencia.pdf'}],
    findings:[],agents:[],analysis:null,score:null,
    report:{report_mode:'FULL',scores_suppressed:false,case_strength_score:null,risk_score:34,
      score_breakdown:'La puntuación general del caso es 64.',full_report:{
        source_audit:{canonical_sources:[{document_id:'doc',canonical_source_id:'doc',original_filename:'sentencia.pdf',source_aliases:[]}]},
        pre_release_source_pages:[{document_id:'doc',page:1,filename:'sentencia.pdf',text:order}],
        migratorio_disposition:{version:1,status:'verified',items:[{id:'order',kind:'DISPOSITION',text:order,speaker_role:'scjn',source_refs:[{document_id:'doc',page:1,quote:order}]}],history:[]},
        mandatory_decision_core:{items:[{id:'order',kind:'DISPOSITION',text:order,speaker_role:'scjn'}]},
        deterministic_scorecard:{dimensions:{a:{score:60},b:{score:60},c:{score:70},d:{score:70},e:{score:60}}}},
      contradictions_struct:[{title:'Constitucionalidad del artículo 111',document_a:{doc_n:1,page:1,quote:order},quote_verified:true}]}};
}
describe('report boundary regressions',()=>{
  it('retains the deterministic mean when the model omitted its scalar',()=>{
    expect(computeCaseStrengthDisagreement(null,[60,60,70,70,60]).deterministic).toBe(64);
    const out=composeFinalReportPayload(input());
    expect(out.report!.case_strength_score).toBe(64);
    expect(out.report!.risk_score).toBe(34);
  });
  it('continues to suppress scores when capability disallows them',()=>{
    const data=input();data.report.scores_suppressed=true;data.report.report_mode='LIMITED';
    expect(composeFinalReportPayload(data).report!.case_strength_score).toBeUndefined();
  });
  it('does not publish a contradiction with only one source even if marked verified',()=>{
    expect(composeFinalReportPayload(input()).report!.contradictions_struct).toEqual([]);
  });
  it('classifies opposing Spanish constitutional positions as a legal dispute',()=>{
    expect(classifyContradiction({title:'Constitucionalidad del artículo 111',document_a:{quote:'El Presidente defiende la constitucionalidad del artículo 111.'},document_b:{quote:'El quejoso alega la inconstitucionalidad del artículo 111.'}})).toBe('disputed_issue');
  });
  it('quarantines a false SCJN grant before it can reach secondary renderers',()=>{
    const data=input(); data.analysis={key_findings:[{description:'La Primera Sala de la SCJN concede el amparo y declara inconstitucional el artículo 111.'}]};
    data.report.evidence_summary='La sentencia de la SCJN declara inconstitucional el artículo 111.';
    const out=composeFinalReportPayload(data);
    expect(out.analysis!.key_findings).toEqual([]);
    expect(out.report!.evidence_summary).toBeUndefined();
    expect(out.report_presentation.decision_sections[0].text).toBe(order);
  });
  it('preserves attributed lower-court grants and cited precedents',()=>{
    const d=input().report.full_report.migratorio_disposition;
    expect(conflictsWithCurrentDisposition('El Juzgado Primero de Distrito concedió el amparo.',d,'tribunal_local')).toBe(false);
    expect(conflictsWithCurrentDisposition('La Primera Sala, en el precedente 123/2020, declaró inconstitucional la norma.',d)).toBe(false);
    expect(conflictsWithCurrentDisposition('La SCJN no concedió el amparo en esta sentencia.',d)).toBe(false);
    expect(conflictsWithCurrentDisposition('La sentencia de revisión 987/2021 concede amparo pese al precedente 123/2020.',d,undefined,['987/2021'])).toBe(true);
  });
  it('requires both literal passages and rejects invented text, unknown documents, and duplicate quotes',()=>{
    const pages:any=[{document_id:'doc',page:1,text:'El registro indica que llegó a las 10:00.'},{document_id:'doc',page:2,text:'El registro indica que llegó a las 12:00.'}];
    const index=[{document_id:'doc',doc_n:1}];
    const pair={document_a:{doc_n:1,page:1,quote:pages[0].text},document_b:{doc_n:1,page:2,quote:pages[1].text}};
    expect(verifyContradictionPairs([pair],pages,index).accepted).toHaveLength(1);
    for(const b of [{...pair.document_b,quote:'El registro dice... que llegó a las 12:00.'},{...pair.document_b,doc_n:30},pair.document_a]) {
      expect(verifyContradictionPairs([{...pair,document_b:b}],pages,index).accepted).toEqual([]);
    }
  });
});

