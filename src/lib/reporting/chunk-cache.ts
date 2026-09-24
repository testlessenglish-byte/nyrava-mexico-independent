export function readReportChunkCache(value: unknown, context: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const cache = value as Record<string, any>;
  if (cache.__context !== context || cache.__regenerate === true) return {};
  return Object.fromEntries(['narrative','memo','intelligence'].filter(k => cache[k] && typeof cache[k] === 'object').map(k => [k, cache[k]]));
}
