// Background pipeline queue pump for standalone Node / Docker runtime.
// Automatically sweeps and processes queued pipeline cases without requiring
// external webhooks or pg_cron ingress into local / containerized environments.

let pumpStarted = false;
let pumpTimer: NodeJS.Timeout | null = null;
let isDraining = false;

export function startServerPipelinePump(opts?: { intervalMs?: number }) {
  if (pumpStarted) return;
  // Never run in unit tests or Vitest
  if (process.env.VITEST || process.env.NODE_ENV === "test") return;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  // Build time or unconfigured environments: do not start
  if (!url || !serviceKey) return;

  pumpStarted = true;
  const intervalMs = opts?.intervalMs ?? 5000;

  async function tick() {
    if (isDraining) return;
    isDraining = true;
    try {
      const { drainPipelineQueue } = await import(
        "@/routes/api/public/hooks/pipeline-worker"
      );
      await drainPipelineQueue();
    } catch (err) {
      console.warn("[server-pipeline-pump] background drain tick failed", err);
    } finally {
      isDraining = false;
    }
  }

  // Initial pump pass shortly after startup
  const startupTimeout = setTimeout(() => void tick(), 1000);
  startupTimeout.unref?.();

  pumpTimer = setInterval(() => void tick(), intervalMs);
  pumpTimer.unref?.();
}

export function stopServerPipelinePump() {
  if (pumpTimer) {
    clearInterval(pumpTimer);
    pumpTimer = null;
  }
  pumpStarted = false;
  isDraining = false;
}
