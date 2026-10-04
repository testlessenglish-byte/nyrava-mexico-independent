import {expect,it} from 'vitest';
import {groundedDecisionSummary} from '../decision-summary';
import {validateMandatoryDecisionCore} from '../mandatory-decision-core';
import {supportInput} from '../claim-support-review';
import {createCanonicalCitation} from '../../reporting/citation-production';
const docs=[{document_id:'doc',doc_n:1,canonical_source_id:'source'}];
it('uses canonical assertions tied to known source documents',()=>{
 const quote='Se desecha por improcedente el recurso de revisión a que este toca se refiere.';
 const pages=[{document_id:'doc',page:4,text:quote}];
 const citation=createCanonicalCitation({document_id:'doc',page:4,quote},quote,pages,docs)!;
 const items:any=[{text:quote,source_refs:[citation,{...citation,document_id:'missing'},{document_id:'doc',quote:''}]}];
 expect(groundedDecisionSummary(items,docs)).toBe(quote+' [DOC 1 p.4]');
});
it('leaves an empty core empty rather than inventing a summary',()=>expect(groundedDecisionSummary([],[])).toBe(''));
it('represents every certified proposition without promoting its differently phrased source quote',()=>{
 const items:any=['COURT_HOLDING','CONTROLLING_ISSUE','DISPOSITION'].map((kind,i)=>{
  const proposition=`Verified proposition number ${i} with distinct operative content`;
  const quote=`Supporting source passage number ${i} from this judicial decision.`;
  const pages=[{document_id:'doc',page:109,text:quote}];
  const claim={id:String(i),title:proposition,description:proposition,source_document_id:'doc',source_page:109,source_quote:quote};
  const review:any={version:1,verdict:'supported',hash:supportInput(claim,pages).hash,supporting_quote:quote};
  const citation=createCanonicalCitation({document_id:'doc',page:109,quote},proposition,pages,docs,{claim,review})!;
  return {id:String(i),kind,text:proposition,source_refs:[citation]};
 });
 expect(validateMandatoryDecisionCore(items,{executiveSummary:'A long but unrelated general case summary.',findings:[]}).ok).toBe(false);
 const summary=groundedDecisionSummary(items,docs);
 expect(validateMandatoryDecisionCore(items,{executiveSummary:summary,findings:[]}).missing).toEqual([]);
 expect(summary).not.toContain('Supporting source passage');
});
