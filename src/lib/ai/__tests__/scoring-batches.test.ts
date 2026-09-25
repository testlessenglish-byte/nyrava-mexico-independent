import {describe,it,expect} from 'vitest';
import {splitScoringFindings,scoringSynthesisPrompt} from '../scoring-batches';
describe('scoring batches',()=>{
  it('splits a 53-document workload without losing item order',()=>{
    const docs=Array.from({length:53},(_,i)=>({id:`doc-${i+1}`}));
    const parts=splitScoringFindings(docs,40);
    expect(parts.map(p=>p.length)).toEqual([40,13]);
    expect(parts.flat()).toEqual(docs);
    expect(scoringSynthesisPrompt(parts.map((p,i)=>({batch:i,ids:p.map(x=>x.id)}))).length).toBeGreaterThan(100);
  });
});
