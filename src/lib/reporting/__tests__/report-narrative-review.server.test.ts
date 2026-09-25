import {beforeEach,it,expect,vi} from 'vitest';
const call=vi.hoisted(()=>vi.fn());
vi.mock('../../groq.server',()=>({callGroq:call,parseJsonLoose:(text:string)=>JSON.parse(text)}));
vi.mock('../../ai/request-budget',()=>({estimateRequestInputTokens:()=>100}));
import {reviewReportNarrative} from '../report-narrative-review.server';
const text='La Sala negó el amparo solicitado.';
const args={payload:{report:{executive_summary:`${text} [DOC 1 p.1].`}},pages:[{document_id:'d',page:1,text}],documents:[{id:'d',doc_n:1}],authorities:[],lawContext:{}};
beforeEach(()=>{call.mockReset();});
it('provider outage persists unresolved progress and never completes',async()=>{
 call.mockRejectedValue(new Error('offline'));const persist=vi.fn();
 const manifest=await reviewReportNarrative(args,{persist});
 expect(manifest.complete).toBe(false);expect(persist).toHaveBeenCalled();
});
it('persists each unit before next checkpoint and resumes only unchanged proof',async()=>{
 const input={...args,payload:{report:{executive_summary:`${text} [DOC 1 p.1].\n\nOtra afirmación [DOC 1 p.1].`}}};
 const checkpoint=new Error('budget');checkpoint.name='CheckpointRequired';
 call.mockResolvedValueOnce({text:JSON.stringify({verdict:'supported',entire_unit_supported:true,requires_legal_authority:false,client_attribution:false,proofs:[{source_id:'d:1',quote:text}]})}).mockRejectedValueOnce(checkpoint);
 const persist=vi.fn();await expect(reviewReportNarrative(input,{persist})).rejects.toThrow('budget');
 expect(persist).toHaveBeenCalledTimes(1);
 const cached=persist.mock.calls[0][0];expect(Object.keys(cached.units)).toHaveLength(1);
 call.mockReset();call.mockResolvedValue({text:JSON.stringify({verdict:'unresolved',requires_legal_authority:false,client_attribution:false,proofs:[]})});
 const resumed=await reviewReportNarrative(input,{cached});
 expect(call).toHaveBeenCalledTimes(1);expect(resumed.complete).toBe(false);
});
it('uncited prose cannot pass by inheriting reviewed findings',async()=>{
 const result=await reviewReportNarrative({...args,payload:{report:{executive_summary:'Una conclusión inventada.'}}});
 expect(call).not.toHaveBeenCalled();expect(result.complete).toBe(false);
});
