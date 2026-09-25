/** Completing an audit is not the same as passing it. */
export function finalAgentGatePassed(key:string,result:{status:string;output?:unknown}):boolean {
  if(result.status!=='success')return false;
  if(key!=='hallucination')return true;
  const output=result.output as Record<string,unknown>|undefined;
  return output?.hallucination_verification_passed===true;
}
