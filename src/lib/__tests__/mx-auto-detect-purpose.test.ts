import {beforeEach, describe, expect, it, vi} from 'vitest';
import {autoDetectCaseContext} from '../mx-auto-detect.server';
import {runCaseClassification} from '../intelligence/case-classification.server';
vi.mock('../intelligence/case-classification.server',()=>({runCaseClassification:vi.fn()}));
const makeDb=()=>{
 const row={case_type:null as string|null,jurisdiction:null as string|null};
 const from=vi.fn((table:string)=>{if(table!=='cases')throw new Error('No unscoped corpus read');return {select:()=>({eq:()=>({maybeSingle:async()=>({data:{...row},error:null})})})};});
 return {db:{from},row};
};
beforeEach(()=>vi.resetAllMocks());
describe('grounded auto-detection adapter',()=>{
 it('returns the actual grounded persisted route and research attribution',async()=>{
  const {db,row}=makeDb();vi.mocked(runCaseClassification).mockImplementation(async()=>{row.case_type='amparo';row.jurisdiction='federal';return {fields:[],analysis_scope:'research_subject'};});
  expect(await autoDetectCaseContext(db,'c','u')).toMatchObject({caseType:'amparo',jurisdiction:'federal',detected:true,source:'research_subject',analysisScope:'research_subject'});
  expect(runCaseClassification).toHaveBeenCalledOnce();
 });
 it('does not silently derive a route when attribution is unresolved',async()=>{
  const {db}=makeDb();vi.mocked(runCaseClassification).mockResolvedValue({fields:[],analysis_scope:'unresolved'});
  expect(await autoDetectCaseContext(db,'c','u')).toMatchObject({caseType:null,jurisdiction:null,detected:false,source:null});
 });
 it('no user context cannot write unaudited corpus guesses',async()=>{
  const {db}=makeDb();expect((await autoDetectCaseContext(db,'c')).detected).toBe(false);expect(runCaseClassification).not.toHaveBeenCalled();
 });
 it('a failed source query never authorizes heuristic fallback',async()=>{
  const {db}=makeDb();vi.mocked(runCaseClassification).mockRejectedValue(new Error('source unavailable'));
  await expect(autoDetectCaseContext(db,'c','u')).rejects.toThrow('source unavailable');
 });
});
