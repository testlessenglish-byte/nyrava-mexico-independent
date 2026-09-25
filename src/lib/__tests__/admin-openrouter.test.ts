import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => {
  let validate = (data: unknown) => data;
  const builder: any = { middleware: () => builder, inputValidator: (fn: any) => { validate = fn; return builder; }, handler: (fn: any) => (args: any) => fn({ ...args, data: validate(args.data) }) };
  return builder;
} }));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock('@/lib/audit.server', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/ai/router.server', () => ({ resetAiRuntimeState: vi.fn() }));
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { upsertAiProvider } from '../ai-admin.functions';
import { resolveApiKey } from '../ai/providers/factory';
import { resetAiRuntimeState } from '../ai/router.server';

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('AI_PROVIDER_ENCRYPTION_KEY', 'test-encryption-secret'); });
it('saves an OpenRouter admin key encrypted and refreshes runtime state', async () => {
  let saved: any;
  vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
    if (table === 'user_roles') { const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { role: 'admin' } }) }; return q; }
    if (table === 'ai_providers') return { update: (row: any) => { saved = row; return { eq: async () => ({ error: null }) }; } } as any;
    throw Error('Unexpected table');
  });
  const id = 'fb2dbea6-d7d1-41e4-a54b-3a2bcd9473bf';
  await (upsertAiProvider as any)({ context: { userId: 'admin-test' }, data: {
    id, provider_type: 'openrouter', display_name: 'OpenRouter', enabled: true, priority: 20,
    base_url: 'https://openrouter.ai/api/v1', default_model: 'openai/gpt-4o-mini', secret_name: 'OPENROUTER_API_KEY', api_key: '  fixture-openrouter-key  ',
  } });
  expect(saved.provider_type).toBe('openrouter');
  expect(saved.default_model).toBe('openai/gpt-4o-mini');
  expect(saved.api_key_encrypted).not.toContain('fixture-openrouter-key');
  expect(resolveApiKey({ ...saved, id })).toBe('fixture-openrouter-key');
  expect(resetAiRuntimeState).toHaveBeenCalledWith({ provider: 'openrouter' });
});
