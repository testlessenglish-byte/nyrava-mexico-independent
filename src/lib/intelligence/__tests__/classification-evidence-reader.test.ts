import { expect, it } from 'vitest';
import { readLatestClassificationEvidenceValue } from '../classification-evidence-reader.server';

it('reads the latest procedural system using the actual evidence timestamp column', async()=>{
  const calls:unknown[][]=[];
  const query:any={};
  for(const method of ['select','eq','order','limit']) query[method]=(...args:unknown[])=>{calls.push([method,...args]);return query;};
  query.maybeSingle=async()=>({data:{value:'traditional_written'},error:null});
  const db={from:(table:string)=>{expect(table).toBe('case_classification_evidence');return query;}};
  expect(await readLatestClassificationEvidenceValue(db as never,'case','procedural_system')).toBe('traditional_written');
  expect(calls).toContainEqual(['order','detected_at',{ascending:false}]);
  expect(calls).toContainEqual(['eq','case_id','case']);
  expect(calls).toContainEqual(['eq','field','procedural_system']);
});

it('surfaces lookup errors instead of silently selecting a default procedural system',async()=>{
  const query:any={};
  for(const method of ['select','eq','order','limit']) query[method]=()=>query;
  query.maybeSingle=async()=>({data:null,error:{message:'lookup failed'}});
  await expect(readLatestClassificationEvidenceValue({from:()=>query} as never,'case','procedural_system')).rejects.toThrow('lookup failed');
});
