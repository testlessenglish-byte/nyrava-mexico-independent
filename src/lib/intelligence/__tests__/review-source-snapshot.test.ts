import {expect,it} from 'vitest';
import {readAllCaseRows,scopedReviewPages,documentPurposesResolved} from '../review-source-snapshot.server';
import {supportInput} from '../claim-support-review';
it('reviews sources beyond backend row caps and fails on any failed page',async()=>{
  const rows=Array.from({length:1201},(_,id)=>({id:String(id)}));
  const ranges:number[]=[];
  let fail=false;
  const db={from:()=>{const q={select:()=>q,eq:()=>q,order:()=>q,range:async(start:number,end:number)=>{ranges.push(start);return{data:rows.slice(start,end+1),error:fail&&start===500?{message:'offline'}:null};}};return q;}};
  expect(await readAllCaseRows(db as never,'case_findings','case')).toHaveLength(1201);
  expect(ranges).toEqual([0,500,1000]);
  fail=true;
  await expect(readAllCaseRows(db as never,'case_findings','case')).rejects.toThrow('offline');
});
it('invalidates semantic approval when purpose changes and does not waive missing purpose for fixtures',()=>{
  const pages=[{document_id:'d',page:1,text:'The court dismissed the submitted application.'}];
  const claim={id:'f',title:'The court dismissed the application.',source_document_id:'d',source_page:1,source_quote:pages[0].text};
  const before=scopedReviewPages({pages,documents:[{id:'d',metadata:{analysis_purpose:'legal_research'}}]});
  const after=scopedReviewPages({pages,documents:[{id:'d',metadata:{analysis_purpose:'client_matter_evidence',client_connection_note:'Filed in client case'}}]});
  expect(supportInput(claim,before).hash).not.toBe(supportInput(claim,after).hash);
  expect(documentPurposesResolved([{metadata:{test_fixture:true}}])).toBe(false);
  expect(documentPurposesResolved([{metadata:{analysis_purpose:'legal_research',test_fixture:true}}])).toBe(true);
});
