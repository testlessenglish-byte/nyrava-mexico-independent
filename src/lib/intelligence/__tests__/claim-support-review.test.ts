import {expect,it} from 'vitest';
import {supportInput,resolveSupportVerdicts,supportSnapshotValid} from '../claim-support-review';
const page={document_id:'doc',page:14,text:'El Tribunal determinó que los artículos 281 y 282 no contienen el vicio de inconstitucionalidad alegado.'};
const claim={id:'f',title:'Los artículos 281 y 282 son inconstitucionales',source_document_id:'doc',source_page:14,source_quote:'El Tribunal determinó que los artículos 281 y 282'};
it('includes the omitted negation after a matching truncated quotation',()=>{
  expect(supportInput(claim,[page]).context).toContain('no contienen el vicio');
});
it('never verifies absent or wrong-document evidence',()=>{
  const input=supportInput({...claim,source_document_id:'other'},[page]);
  expect(resolveSupportVerdicts([input],[{id:'f',verdict:'supported',supporting_quote:page.text}]).get('f')?.verdict).toBe('insufficient');
});
it('preserves a source-backed contradiction instead of treating quotation existence as support',()=>{
  const input=supportInput(claim,[page]);
  expect(resolveSupportVerdicts([input],[{id:'f',verdict:'contradicted',reason:'Reverses negation',supporting_quote:page.text}]).get('f')?.verdict).toBe('contradicted');
});
it('rejects fabricated proof, omitted results and duplicate decisions',()=>{
  const input=supportInput(claim,[page]);
  const row={id:'f',verdict:'supported',supporting_quote:page.text};
  for(const rows of [[],[row,row],[{...row,supporting_quote:'The court declared those articles unconstitutional.'}]])
    expect(resolveSupportVerdicts([input],rows).get('f')?.verdict).toBe('insufficient');
});
it('invalidates prior review when claim, source context or attribution changes',()=>{
  const input=supportInput(claim,[page]);
  expect(supportInput({...claim,speaker_role:'scjn'},[page]).hash).not.toBe(input.hash);
  expect(supportInput({...claim,legal_significance:'El fallo concede daños.'},[page]).hash).not.toBe(input.hash);
  expect(supportInput(claim,[{...page,text:page.text+' Additional context.'}]).hash).not.toBe(input.hash);
});
it('blocks changed or newly added claims while allowing quarantined rows to remain in the audit',()=>{
  const hash=supportInput(claim,[page]).hash;
  const verified={...claim,metadata:{semantic_support_review:{version:1,hash,verdict:'supported'}}};
  expect(supportSnapshotValid([verified],[page])).toBe(true);
  expect(supportSnapshotValid([{...verified,potential_impact:'A different legal conclusion'}],[page])).toBe(false);
  expect(supportSnapshotValid([verified,{...claim,id:'new'}],[page])).toBe(false);
  expect(supportSnapshotValid([verified,{...claim,id:'quarantined',finding_status:'suppressed'}],[page])).toBe(true);
});
