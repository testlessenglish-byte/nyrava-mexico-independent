import {it,expect} from 'vitest';
import {platformRows} from '../platform-policy';
it('limits platform package funding to enabled Groq and Gemini',()=>{
 expect(platformRows([{provider_type:'groq',enabled:true},{provider_type:'gemini',enabled:true},{provider_type:'openrouter',enabled:true},{provider_type:'openai',enabled:true},{provider_type:'groq',enabled:false}]).map(r=>r.provider_type)).toEqual(['groq','gemini']);
});
