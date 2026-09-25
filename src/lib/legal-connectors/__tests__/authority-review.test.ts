import { expect,it } from 'vitest';
import { recordAuthorityReview } from '../authority-review.server';
import { sha256Hex } from '../../intelligence/evidence-provenance.server';
it('persists source-bound reviewer attestation and rejects concurrent replacement',async()=>{
  const source={body:'Exact source',content_hash:sha256Hex('Exact source'),source_url:'https://official.example/source',metadata:{external_id:'source-1'}};
  let patch:any;let changed=false;const filters:any[]=[];
  const db={from:()=>{const q:any={select:()=>q,eq:(...v:any[])=>{filters.push(v);return q;},
    maybeSingle:async()=>({data:source}),update:(v:any)=>{patch=v;return q;},
    then:(resolve:any)=>resolve({data:changed?[]:[{id:'a'}]})};return q;}};
  await recordAuthorityReview(db,'a','reviewer','verified');
  expect(patch.metadata.review_attestation).toMatchObject({reviewer_id:'reviewer',content_hash:sha256Hex(source.body),
    decision:'verified',applicability_reviewed:false,binding_effect_reviewed:false});
  expect(filters).toContainEqual(['content_hash',source.content_hash]);
  changed=true;await expect(recordAuthorityReview(db,'a','reviewer','verified')).rejects.toThrow('changed during review');
});
