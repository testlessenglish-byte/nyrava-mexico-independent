import {expect,it} from 'vitest';
import {finalAgentGatePassed} from '../final-agent-gate';
it('blocks final release when a completed nonblocking audit did not verify its claims',()=>{
  for(const output of [undefined,{}, {hallucination_verification_passed:false,blocking:false}])
    expect(finalAgentGatePassed('hallucination',{status:'success',output})).toBe(false);
  expect(finalAgentGatePassed('hallucination',{status:'success',output:{hallucination_verification_passed:true}})).toBe(true);
  expect(finalAgentGatePassed('qa',{status:'failed'})).toBe(false);
});
