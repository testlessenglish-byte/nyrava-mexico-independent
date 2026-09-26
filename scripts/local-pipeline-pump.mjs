// Development queue consumer; tied to the dev server lifetime, not a separate
// terminal that can be forgotten. Production continues to use its scheduler.
export function startLocalPipelinePump({ origin, env = process.env, fetcher = fetch, intervalMs = 10000, log = console.info }) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return () => {};
  if (new URL(env.SUPABASE_URL).hostname !== 'plyqpmrucbsyxybmkoeg.supabase.co') {
    throw new Error('Independent backend required');
  }
  let stopped = false;
  let timer;
  let controller;
  async function tick() {
    controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240000);
    timeout.unref?.();
    try {
      const credentials = await fetcher(`${env.SUPABASE_URL}/rest/v1/worker_secrets?name=eq.pipeline_worker&select=secret`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
        signal: controller.signal,
      });
      if (!credentials.ok) throw new Error(`Worker credential lookup HTTP ${credentials.status}`);
      const secret = (await credentials.json())[0]?.secret;
      if (!secret) throw new Error('Pipeline worker configuration missing');
      if (stopped) return;
      const response = await fetcher(`${origin}/api/public/hooks/pipeline-worker`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-worker-secret': secret },
        body: '{}', signal: controller.signal,
      });
      await response.arrayBuffer();
      if (!response.ok) log(`[local-pipeline] Worker HTTP ${response.status}`);
    } catch (error) {
      if (!stopped) log(`[local-pipeline] ${error instanceof Error ? error.message : 'Worker request failed'}`);
    } finally {
      clearTimeout(timeout);
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
        timer.unref?.();
      }
    }
  }
  void tick();
  return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
}

export function localPipelinePlugin() {
  return {
    name: 'local-pipeline-worker',
    apply: 'serve',
    configureServer(server) {
      let stop;
      server.httpServer?.once('listening', () => {
        const address = server.httpServer.address();
        if (address && typeof address !== 'string') {
          stop = startLocalPipelinePump({ origin: `http://127.0.0.1:${address.port}` });
        }
      });
      server.httpServer?.once('close', () => stop?.());
    },
  };
}
