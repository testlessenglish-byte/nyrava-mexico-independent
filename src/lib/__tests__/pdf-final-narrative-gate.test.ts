import {describe,it,expect,vi,afterEach} from 'vitest';
import {downloadPdf} from '../export';
import * as gate from '../reporting/narrative-export-gate';
import {savePdfDownload} from '../pdf/pdf-download';
vi.mock('../pdf/pdf-download',()=>({savePdfDownload:vi.fn()}));
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();});
function data():any {
  const quote='La Sala determina que se desecha el recurso de revisión y queda firme la sentencia recurrida.';
  return {case:{id:'case',case_type:'familiar',report_language:'es'},documents:[{id:'doc',doc_n:1,filename:'sentencia.pdf',canonical_source_id:'doc'}],agents:[],analysis:null,score:null,
    findings:[{id:'finding',case_id:'case',title:'Desestimación del recurso',description:quote,source_document_id:'doc',source_page:1,source_quote:quote,speaker_role:'scjn',proposition_type:'holding',adoption_status:'adopted',finding_status:'verified',verification_status:'verified',evidence_refs:[{document_id:'doc',page:1,quote}]}],
    report:{quality_blocked:false,report_mode:'LIMITED',executive_summary:quote+' El alcance de esta revisión se limita al documento aportado.',full_report:{pre_release_source_pages:[{document_id:'doc',page:1,text:quote}]}}};
}
describe('final PDF narrative release gate',()=>{
  it('does not save a final PDF without approval of its exact narrative and sources',async()=>{
    await expect(downloadPdf(data(),'Sentencia')).rejects.toThrow(/REPORT_NARRATIVE_UNVERIFIED/);
    expect(savePdfDownload).not.toHaveBeenCalled();
  });
  it('rejects a persisted release block even when narrative approval passes',async()=>{
    vi.spyOn(gate,'assertNarrativeExportReady').mockResolvedValue({ok:true});
    const input=data();
    input.report.full_report.release_gate={decision:'BLOCKED',reasons:['review required']};
    await expect(downloadPdf(input,'Sentencia')).rejects.toThrow(/REPORT_(?:CONTRACT_)?BLOCKED/);
    expect(savePdfDownload).not.toHaveBeenCalled();
  });
  it('saves after the narrative gate approves the rendered payload',async()=>{
    const checked=vi.spyOn(gate,'assertNarrativeExportReady').mockResolvedValue({ok:true});
    await downloadPdf(data(),'Sentencia');
    expect(checked).toHaveBeenCalledOnce();
    expect(checked).toHaveBeenCalledWith(expect.any(Object),{throwOnUnverified:true});
    expect(checked.mock.calls[0][0].report_presentation.render_output.format).toBe('pdf');
    expect(savePdfDownload).toHaveBeenCalledOnce();
    expect((vi.mocked(savePdfDownload).mock.calls[0][0] as ArrayBuffer).byteLength).toBeGreaterThan(1000);
  });
});
