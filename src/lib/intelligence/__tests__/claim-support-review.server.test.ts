import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('../../groq.server',()=>({callGroq:state.call,parseJsonLoose:(s:string)=>JSON.parse(s)}));
import {reviewClaimSupport} from '../claim-support-review.server';
import {supportInput} from '../claim-support-review';
const text='La recurrente solicitó aumentar el porcentaje, pero este párrafo no contiene una decisión judicial.';
const page={document_id:'d',page:17,text};
const claim={id:'f',title:'La SCJN concedió el aumento.',source_document_id:'d',source_page:17,source_quote:'La recurrente solicitó aumentar el porcentaje'};
beforeEach(()=>{state.call.mockReset();});
it('reuses a persisted canonical hash without a provider call after nested key reordering',async()=>{
  const pages=[{...page,document_scope:{purpose:'case_record',connection:{status:'verified',archived:false}}}];
  const current={...claim,execution_id:'execution',rationale:{a:1,b:2}};
  const review={version:1 as const,verdict:'supported' as const,hash:supportInput(current,pages).hash,
    supporting_quote:text,reason:'Completed offline fixture review'};
  const reordered=[{...page,document_scope:{connection:{archived:false,status:'verified'},purpose:'case_record'}}];
  const result=await reviewClaimSupport([{...current,rationale:{b:2,a:1},metadata:{semantic_support_review:JSON.parse(JSON.stringify(review))}}],reordered);
  expect(result.get('f')).toEqual(review);
  expect(state.call).not.toHaveBeenCalled();
});
it.each(['claim','execution','legacy hash'])('requires fresh verification for a changed %s instead of refreshing the cache',async kind=>{
  const original={...claim,execution_id:'execution'};
  const review={version:1 as const,verdict:'supported' as const,hash:supportInput(original,[page]).hash,
    supporting_quote:text,reason:'Prior review'};
  const current={...original,metadata:{semantic_support_review:review}};
  if(kind==='claim') current.title='Unreviewed judicial conclusion';
  if(kind==='execution') current.execution_id='new-execution';
  if(kind==='legacy hash') review.hash='old-order-sensitive-review-hash';
  const previous=structuredClone(review);
  state.call.mockRejectedValue(new Error('Provider disabled for stale-review regression'));
  expect((await reviewClaimSupport([current],[page])).get('f')?.verdict).toBe('insufficient');
  expect(state.call).toHaveBeenCalledTimes(1);
  expect(review).toEqual(previous);
});
it('never certifies claims when the provider fails',async()=>{
  state.call.mockRejectedValue(new Error('HTTP413'));
  expect((await reviewClaimSupport([claim],[page],'user')).get('f')?.verdict).toBe('insufficient');
});
it('keeps a source-backed attribution rejection and passes surrounding context to the verifier',async()=>{
  state.call.mockResolvedValue({text:JSON.stringify({reviews:[{id:'f',verdict:'contradicted',reason:'Request is not holding',supporting_quote:text}]})});
  expect((await reviewClaimSupport([claim],[page],'user')).get('f')?.verdict).toBe('contradicted');
  expect(state.call.mock.calls[0][0].userContent).toContain('no contiene una decisión');
});
it('does not call a provider for unknown page context',async()=>{
  expect((await reviewClaimSupport([claim],[],'user')).get('f')?.verdict).toBe('insufficient');
  expect(state.call).not.toHaveBeenCalled();
});
it('persists finished batches before a later checkpoint interrupts review',async()=>{
  const claims=['a','b','c'].map(id=>({...claim,id}));
  state.call.mockResolvedValueOnce({text:JSON.stringify({reviews:claims.slice(0,2).map(c=>({id:c.id,verdict:'contradicted',reason:'Wrong attribution',supporting_quote:text}))})});
  const checkpoint=Object.assign(new Error('budget'),{name:'CheckpointRequired'});
  state.call.mockRejectedValueOnce(checkpoint);
  const persist=vi.fn(async(_batch:ReadonlyMap<string,unknown>)=>{});
  await expect(reviewClaimSupport(claims,[page],'user',persist)).rejects.toBe(checkpoint);
  expect(persist).toHaveBeenCalledTimes(1);
  expect([...persist.mock.calls[0][0].keys()]).toEqual(['a','b']);
});
it('retries oversized pairs as intact single claims',async()=>{
  state.call.mockRejectedValueOnce(new Error('HTTP 413 payload_too_large'));
  state.call.mockImplementation(async(options)=>({text:JSON.stringify({reviews:JSON.parse(options.userContent).map((input:any)=>({id:input.id,verdict:'contradicted',reason:'Request not holding',supporting_quote:text}))})}));
  const result=await reviewClaimSupport([{...claim,id:'a'},{...claim,id:'b'}],[page],'user');
  expect(state.call).toHaveBeenCalledTimes(3);
  expect([...result.values()].map(v=>v.verdict)).toEqual(['contradicted','contradicted']);
  expect(JSON.parse(state.call.mock.calls[1][0].userContent)[0].context).toBe(text);
});
