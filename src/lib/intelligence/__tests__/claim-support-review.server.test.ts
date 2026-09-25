import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({call:vi.fn()}));
vi.mock('../../groq.server',()=>({callGroq:state.call,parseJsonLoose:(s:string)=>JSON.parse(s)}));
import {reviewClaimSupport} from '../claim-support-review.server';
const text='La recurrente solicitó aumentar el porcentaje, pero este párrafo no contiene una decisión judicial.';
const page={document_id:'d',page:17,text};
const claim={id:'f',title:'La SCJN concedió el aumento.',source_document_id:'d',source_page:17,source_quote:'La recurrente solicitó aumentar el porcentaje'};
beforeEach(()=>{state.call.mockReset();});
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
