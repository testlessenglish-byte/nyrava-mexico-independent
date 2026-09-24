import {expect,it,vi} from 'vitest';
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{from:()=>({select:()=>({order:async()=>({data:[{provider_type:'groq',enabled:true},{provider_type:'gemini',enabled:true}],error:null})})})}}));
import {packingCharBudget,getProviderInputBudget} from '../router.server';
import {AGENT_SKIP_PROVIDERS} from '../../pipeline.server';
it('packs specialist-agent chunks within Groq capacity when Gemini and Groq are configured without OpenRouter',async()=>{
 const budget=await packingCharBudget(60000,3800,AGENT_SKIP_PROVIDERS);
 expect(budget+3800).toBeLessThanOrEqual(getProviderInputBudget('groq')*3.5);
 expect(budget).toBeGreaterThan(1000);
});
