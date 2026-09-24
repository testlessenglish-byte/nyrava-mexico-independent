import { describe, it, expect } from 'vitest';
import { composeFinalReportPayload, validateFinalReportContract } from '../final-report-contract';
import { MX_CASE_TYPES } from '../../jurisdiction/mexico-types';
import { buildGroundingCorpus, verifyEvidenceRefs } from '../../intelligence/grounding.server';
import { effectiveMxProfile, mxPipelineStageKeys } from '../../execution/mx-pipeline';
import { isCanonicalFinding, selectFindings } from '../../intelligence/finding-selection';

const quote = 'ÚNICO. Se devuelve el expediente al tribunal de origen para que dicte la sentencia que corresponda conforme a derecho.';
function input(materia: string): any {
  const ref = {document_id:'doc',doc_n:1,page:31,quote};
  return {case:{case_type:materia,case_analysis_mode:'concluded_audit',report_language:'es'},
    documents:[{id:'doc',filename:'source.pdf'}],findings:[],agents:[],analysis:null,score:null,
    report:{report_mode:'LIMITED',scores_suppressed:true,motions_suppressed:true,
      executive_summary:'Se recomienda interponer un recurso. ' + quote,
      full_report:{source_audit:{canonical_sources:[{document_id:'doc',canonical_source_id:'doc',original_filename:'source.pdf',source_aliases:[]}]},
        pre_release_source_pages:[{document_id:'doc',filename:'source.pdf',page:31,text:quote}],
        mandatory_decision_core:{items:[{id:'order',kind:'DISPOSITION',text:quote,source_refs:[ref],speaker_role:'scjn'}]},
        deterministic_algorithms:{risk:{score:34,factors:[{label:'2 x unresolved contradictions',delta:16},{label:'3 x missing evidence',delta:18}]}}},
      citations:[ref],contradictions_struct:[]}};
}
describe('shared report contracts across every configured materia',()=>{
  it('renders one finding when two legacy IDs resolve to the same verified decision core',()=>{
    const data=input('civil');
    data.findings=[1,2].map(id=>({id:String(id),source_module:'decision_core',metadata:{mandatory_decision_core_id:'order'},evidence_refs:[{document_id:'doc',page:31,quote}]}));
    const out=composeFinalReportPayload(data);
    expect(out.findings).toHaveLength(1);
    expect(out.findings![0].title).toContain(quote);
  });
  it('keeps verified decision reconstruction findings in the canonical report and Judge input',()=>{
    const finding={id:'decision',source_module:'decision_core',verification_status:'verified',finding_status:'verified',title:quote};
    expect(isCanonicalFinding(finding)).toBe(true);
    expect(selectFindings([finding])).toHaveLength(1);
    expect(isCanonicalFinding({...finding,verification_status:'unverified'})).toBe(false);
    expect(isCanonicalFinding({...finding,finding_status:'suppressed'})).toBe(false);
  });
  it.each(MX_CASE_TYPES)('%s: LIMITED cannot regain scores during final contradiction reconciliation',materia=>{
    const out=composeFinalReportPayload(input(materia));
    expect(out.report!.risk_score).toBeUndefined();
    expect(validateFinalReportContract(out).blocking_errors).not.toContain('scoresPresent');
    expect(JSON.stringify(out.report!.full_report)).not.toMatch(/"score":\d/);
  });
  it.each(MX_CASE_TYPES)('%s: blocks U.S. authority in Spanish and English report content',materia=>{
    for(const language of ['es','en']) {
      const data=input(materia);data.case.report_language=language;
      data.report.facts='Apply the Fifth Amendment and OSHA 29 CFR 1910.147 to this case.';
      expect(validateFinalReportContract(composeFinalReportPayload(data)).blocking_errors).toContain('foreignJurisdictionPresent');
    }
  });
  it.each(MX_CASE_TYPES)('%s: summary survives removal of prohibited strategic prose using verified source passages',materia=>{
    const out=composeFinalReportPayload(input(materia));
    expect(out.report!.executive_summary).toContain(quote);
    expect(out.report!.executive_summary).toContain('[DOC 1 p.31]');
    expect(out.report!.executive_summary).not.toContain('Se recomienda');
    expect((out.report!.full_report as any).prose.executive_summary).toBe(out.report!.executive_summary);
  });
  it('does not fabricate a replacement summary from an unverified decision quote',()=>{
    const data=input('civil');data.report.full_report.pre_release_source_pages[0].text='Unrelated text.';
    const out=composeFinalReportPayload(data);
    expect(out.report!.executive_summary).toBeUndefined();
    expect(validateFinalReportContract(out).blocking_errors).toContain('executiveSummaryMissing');
  });
  it('preserves the physical page and exact source span when character chunks disagree',()=>{
    const corpus=buildGroundingCorpus([{id:'doc',filename:'source.pdf',extracted_text:'a'.repeat(4000)+quote}],3000,
      [{document_id:'doc',page:31,text:quote}]);
    expect(verifyEvidenceRefs([{doc_n:1,page:2,quote}],corpus)[0]).toMatchObject({page:31,page_located:31,quote,document_id:'doc'});
  });
  it('never calls a character chunk a verified physical page when source pages are unavailable',()=>{
    const corpus=buildGroundingCorpus([{id:'doc',filename:'source.txt',extracted_text:'a'.repeat(4000)+quote}]);
    expect(verifyEvidenceRefs([{doc_n:1,page:2,quote}],corpus)[0].page_located).toBeNull();
  });
  it('routes the persisted amparo_revision vehicle instead of silently falling back to its underlying materia',()=>{
    expect(effectiveMxProfile('migratorio','John Jones','', 'amparo_revision','migratorio')).toBe('constitucional');
    expect(mxPipelineStageKeys('migratorio','John Jones','amparo_revision','migratorio')).not.toContain('witness');
    expect(mxPipelineStageKeys('amparo','Case','amparo_indirecto','penal')).toContain('witness');
  });
});
