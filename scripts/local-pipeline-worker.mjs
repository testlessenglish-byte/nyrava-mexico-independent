// Local development worker: no public tunnel required. Existing server leases
// still serialize each case. Secrets stay in memory and are never logged.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.loadEnvFile(path.join(root,'.env.local'));
const url=process.env.SUPABASE_URL;
if(new URL(url).hostname!=='plyqpmrucbsyxybmkoeg.supabase.co')throw Error('Independent backend required');
const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!service)throw Error('Independent backend credential missing');
let stopping=false;
process.on('SIGTERM',()=>{stopping=true});process.on('SIGINT',()=>{stopping=true});
while(!stopping){
  try {
    const keyResponse=await fetch(`${url}/rest/v1/worker_secrets?name=eq.pipeline_worker&select=secret`,{
      headers:{apikey:service,Authorization:`Bearer ${service}`},signal:AbortSignal.timeout(15000),
    });
    if(!keyResponse.ok)throw Error(`Worker credential lookup HTTP ${keyResponse.status}`);
    const secret=(await keyResponse.json())[0]?.secret;
    if(!secret)throw Error('Pipeline worker configuration missing');
    const response=await fetch('http://127.0.0.1:3000/api/public/hooks/pipeline-worker',{
      method:'POST',headers:{'Content-Type':'application/json','x-worker-secret':secret},body:'{}',
      signal:AbortSignal.timeout(240000),
    });
    await response.arrayBuffer();
    console.log(new Date().toISOString(),`Local worker HTTP ${response.status}`);
  }catch(e){console.error(new Date().toISOString(),e instanceof Error?e.message:'Local worker failed');}
  if(!stopping)await new Promise(resolve=>setTimeout(resolve,10000));
}
