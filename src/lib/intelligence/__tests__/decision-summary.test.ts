import {expect,it} from 'vitest';
import {groundedDecisionSummary} from '../decision-summary';
import {validateMandatoryDecisionCore} from '../mandatory-decision-core';
it('only includes quoted passages tied to known source documents',()=>{
const items:any=[{text:'Verified ruling',source_refs:[{document_id:'doc',quote:'Verified ruling',label:'p.4'},{document_id:'missing',quote:'Unknown source'},{document_id:'doc',quote:''}]}];
expect(groundedDecisionSummary(items,[{document_id:'doc',doc_n:1}])).toBe('“Verified ruling” [DOC 1 p.4]');
});
it('leaves an empty core empty rather than inventing a summary',()=>expect(groundedDecisionSummary([],[])).toBe(''));
it('represents every verified proposition even when its supporting quote is phrased differently',()=>{
 const items:any = ['COURT_HOLDING','CONTROLLING_ISSUE','DISPOSITION'].map((kind,i)=>({id:String(i),kind,text:`Verified proposition number ${i} with distinct operative content`,source_refs:[{document_id:'doc',quote:`Supporting passage ${i}`,label:'p.109'}]}));
 expect(validateMandatoryDecisionCore(items,{executiveSummary:'A long but unrelated general case summary.',findings:[]}).ok).toBe(false);
 const summary=groundedDecisionSummary(items,[{document_id:'doc',doc_n:1}]);
 expect(validateMandatoryDecisionCore(items,{executiveSummary:summary,findings:[]}).missing).toEqual([]);
});
