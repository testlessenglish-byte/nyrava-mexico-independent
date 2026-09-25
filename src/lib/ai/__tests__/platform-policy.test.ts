import {it,expect} from 'vitest';
import {platformRows} from '../platform-policy';
it('allows configured OpenRouter alongside Groq and Gemini, excluding disabled providers',()=>{
 expect(platformRows([{provider_type:'groq',enabled:true},{provider_type:'gemini',enabled:true},{provider_type:'openrouter',enabled:true},{provider_type:'openai',enabled:true},{provider_type:'groq',enabled:false},{provider_type:'openrouter',enabled:false}]).map(r=>r.provider_type)).toEqual(['groq','gemini','openrouter']);
});
