import {callGroq,parseJsonLoose} from '../groq.server';
import {estimateRequestInputTokens} from '../ai/request-budget';
import {buildNarrativeReviewInput,createNarrativeManifest,resolveNarrativeVerdict,validNarrativeCachedVerdict,NARRATIVE_REVIEW_INSTRUCTION,
  type NarrativeReviewArgs,type NarrativeManifest,type NarrativeVerdict} from './report-narrative-review';
export async function reviewReportNarrative(args:NarrativeReviewArgs,options:{userId?:string;cached?:NarrativeManifest;
  persist?:(manifest:NarrativeManifest)=>Promise<void>}={}):Promise<NarrativeManifest> {
  const input=await buildNarrativeReviewInput(args),results:Record<string,NarrativeVerdict>={};
  const cache=options.cached;
  const same=cache?.policy===input.policy&&cache.report_hash===input.report_hash&&cache.source_hash===input.source_hash&&cache.law_hash===input.law_hash;
  for(const unit of input.units){
    const prior=same?cache?.units?.[unit.id]:undefined;
    if(validNarrativeCachedVerdict(unit,prior)){results[unit.id]=prior;continue;}
    const content=JSON.stringify(unit);
    let raw:unknown=null;
    if(unit.text.length<=4000 && unit.sources.length && !unit.unresolved_refs.length &&
      estimateRequestInputTokens({systemInstruction:NARRATIVE_REVIEW_INSTRUCTION,userContent:content})<=4800){
      try{
        const response=await callGroq({userId:options.userId,task:'analysis',systemInstruction:NARRATIVE_REVIEW_INSTRUCTION,
          userContent:content,json:true,temperature:0,maxTokens:1400});
        raw=parseJsonLoose(response.text);
      }catch(error){
        if(error instanceof Error&&error.name==='CheckpointRequired')throw error;
        results[unit.id]=resolveNarrativeVerdict(unit,null);
        await options.persist?.(createNarrativeManifest(input,results));
        // Provider unavailable: do not spend one failing request per paragraph.
        break;
      }
    }
    results[unit.id]=resolveNarrativeVerdict(unit,raw);
    await options.persist?.(createNarrativeManifest(input,results));
  }
  const manifest=createNarrativeManifest(input,results);
  await options.persist?.(manifest);
  return manifest;
}
