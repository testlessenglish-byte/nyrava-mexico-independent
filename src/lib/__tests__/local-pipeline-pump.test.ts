import {afterEach,describe,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';
import {startLocalPipelinePump,localPipelinePlugin} from '../../../scripts/local-pipeline-pump.mjs';
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.unstubAllGlobals();});
const env={SUPABASE_URL:'https://plyqpmrucbsyxybmkoeg.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only'};
describe('local queue worker lifecycle',()=>{
  it('starts automatically when the dev server listens and stops when it closes',async()=>{
    vi.useFakeTimers();Object.entries(env).forEach(([k,v])=>vi.stubEnv(k,v));
    const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>[{secret:'test-worker'}]}).mockResolvedValue({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
    vi.stubGlobal('fetch',fetcher);
    const httpServer=Object.assign(new EventEmitter(),{address:()=>({port:3000})});
    localPipelinePlugin().configureServer({httpServer});
    expect(fetcher).not.toHaveBeenCalled();
    httpServer.emit('listening');await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe('http://127.0.0.1:3000/api/public/hooks/pipeline-worker');
    httpServer.emit('close');await vi.advanceTimersByTimeAsync(30000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not overlap slow ticks and recovers on the next tick after HTTP failure',async()=>{
    vi.useFakeTimers();let release:any;
    const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>[{secret:'test-worker'}]})
      .mockImplementationOnce(()=>new Promise(r=>{release=r;}))
      .mockResolvedValue({ok:false,status:503});
    const stop=startLocalPipelinePump({origin:'http://127.0.0.1:3000',env,fetcher,log:vi.fn()});
    await vi.advanceTimersByTimeAsync(60000);expect(fetcher).toHaveBeenCalledTimes(2);
    release({ok:false,status:500,arrayBuffer:async()=>new ArrayBuffer(0)});
    await vi.advanceTimersByTimeAsync(10001);expect(fetcher).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(10001);expect(fetcher).toHaveBeenCalledTimes(4);
    stop();
  });
});
