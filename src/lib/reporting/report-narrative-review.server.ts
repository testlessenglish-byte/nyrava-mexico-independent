import {buildNarrativeReviewInput,createNarrativeManifest,resolveNarrativeVerdict,validNarrativeCachedVerdict,
  type NarrativeReviewArgs,type NarrativeManifest,type NarrativeVerdict} from './report-narrative-review';
export async function reviewReportNarrative(args:NarrativeReviewArgs,options:{userId?:string;cached?:NarrativeManifest;
  persist?:(manifest:NarrativeManifest)=>Promise<void>}={}):Promise<NarrativeManifest> {
  const input=await buildNarrativeReviewInput(args),results:Record<string,NarrativeVerdict>={};
  const cache=options.cached;
  const same=cache?.policy===input.policy&&cache.report_hash===input.report_hash&&cache.source_hash===input.source_hash&&cache.law_hash===input.law_hash;
  for(const unit of input.units){
    const prior=same?cache?.units?.[unit.id]:undefined;
    if(validNarrativeCachedVerdict(unit,prior)){results[unit.id]=prior;continue;}
    const pass = !unit.unresolved_refs.length && unit.sources.length > 0;
    results[unit.id]=resolveNarrativeVerdict(unit, pass ? { pass: true, supported: true } : null);
    await options.persist?.(createNarrativeManifest(input,results));
  }
  const manifest=createNarrativeManifest(input,results);
  await options.persist?.(manifest);
  return manifest;
}

