import {callGroq,parseJsonLoose} from '../groq.server';
import {CLAIM_SUPPORT_INSTRUCTION,resolveSupportVerdicts,supportInput,type SupportClaim,type SupportPage,type SupportVerdict} from './claim-support-review';
import {estimateRequestInputTokens} from '../ai/request-budget';

export async function reviewClaimSupport(claims:readonly (SupportClaim & {metadata?:Record<string,unknown>})[],pages:readonly SupportPage[],userId?:string,
  persistBatch?:(batch:ReadonlyMap<string,SupportVerdict>)=>Promise<void>) {
  const result=new Map<string,SupportVerdict>();
  const pending=[] as ReturnType<typeof supportInput>[];
  for(const claim of claims){
    const input=supportInput(claim,pages);
    const cached=claim.metadata?.semantic_support_review as SupportVerdict|undefined;
    if(cached?.version===1 && cached.hash===input.hash && ['supported','contradicted'].includes(cached.verdict)) {
      result.set(claim.id,cached);continue;
    }
    if(!input.context || input.claim.length>4000){
      result.set(claim.id,{version:1,hash:input.hash,verdict:'insufficient',supporting_quote:'',reason:!input.context?'Exact cited page context unavailable.':'Claim exceeds bounded verification input; split it before review.'});
      continue;
    }
    pending.push(input);
  }
  if(result.size)await persistBatch?.(result);
  // Persist each batch before the next call can checkpoint.
  for(let i=0;i<pending.length;){
    let batch=pending.slice(i,i+2);
    const serialized=()=>JSON.stringify(batch.map(({hash,...input})=>input));
    if(batch.length>1 && estimateRequestInputTokens({systemInstruction:CLAIM_SUPPORT_INSTRUCTION,userContent:serialized()})>4800)batch=batch.slice(0,1);
    let reviews:unknown=[];
    try{
      const response=await callGroq({userId,task:'analysis',systemInstruction:CLAIM_SUPPORT_INSTRUCTION,
        userContent:serialized(),json:true,temperature:0,maxTokens:1000});
      reviews=parseJsonLoose<{reviews?:unknown}>(response.text)?.reviews;
    }catch(error){
      // Infrastructure failure cannot certify claims. Checkpoints remain resumable.
      if(error instanceof Error && error.name==='CheckpointRequired')throw error;
      if(batch.length>1 && /413|payload_too_large|request.{0,30}too large|oversized/i.test(String(error))){
        // Retry each intact claim; never truncate its source or attribution.
        for(const input of batch){
          const original=claims.find(claim=>claim.id===input.id)!;
          const single=await reviewClaimSupport([original],pages,userId,persistBatch);
          for(const [id,verdict] of single)result.set(id,verdict);
        }
        i+=batch.length;
        continue;
      }
      const failed=new Map<string,SupportVerdict>(pending.slice(i).map(input=>[input.id,{version:1,hash:input.hash,verdict:'insufficient',supporting_quote:'',reason:'Semantic verification provider unavailable; claim not certified.'}]));
      await persistBatch?.(failed);
      for(const [id,verdict] of failed)result.set(id,verdict);
      break;
    }
    const verdicts=resolveSupportVerdicts(batch,reviews);
    await persistBatch?.(verdicts);
    for(const [id,verdict] of verdicts)result.set(id,verdict);
    i+=batch.length;
  }
  return result;
}
