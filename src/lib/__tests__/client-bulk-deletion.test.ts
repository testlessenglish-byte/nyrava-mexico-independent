import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-start', () => ({ 
  createServerFn: () => { 
    const b: any = { 
      middleware: () => b, 
      inputValidator: () => b, 
      validator: () => b,
      handler: (fn: any) => fn 
    }; 
    return b; 
  } 
}));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));

const state = vi.hoisted(() => ({ admin: null as any }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => state.admin }));

import { bulkDeleteClientsFn } from '../clients.functions';

function database(results: any[]) {
  const calls: any[] = [];
  return { 
    calls, 
    from(table: string) { 
      const query: any = {};
      for (const method of ['select', 'eq', 'order', 'in', 'limit', 'update', 'delete']) {
        query[method] = (...args: any[]) => { calls.push({ table, method, args }); return query; };
      }
      query.maybeSingle = () => Promise.resolve(results.shift());
      query.then = (resolve: any, reject: any) => Promise.resolve(results.shift()).then(resolve, reject);
      return query;
    }
  };
}

let user: any;

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only';
});

it('1. Select 5 zero-case clients → all 5 deleted', async () => {
  const clientIds = ['1', '2', '3', '4', '5'];
  user = database([
    { data: clientIds.map(id => ({ id })) },
    { data: clientIds.map(id => ({ id })) },
  ]);
  state.admin = database([
    { data: [] },
    { error: null },
    { error: null }
  ]);

  const result = await (bulkDeleteClientsFn as any)({ data: { clientIds }, context: { supabase: user, userId: 'owner' } });
  
  expect(result.deletedCount).toBe(5);
  expect(result.preservedCount).toBe(0);
});

it('2/3. Server rejects client whose case was created after selection (1 case)', async () => {
  const clientIds = ['client-with-case'];
  user = database([]);
  state.admin = database([
    { data: [{ client_id: 'client-with-case' }] },
  ]);

  const result = await (bulkDeleteClientsFn as any)({ data: { clientIds }, context: { supabase: user, userId: 'owner' } });
  
  expect(result.deletedCount).toBe(0);
  expect(result.preservedCount).toBe(1);
});

it('4. Mixed bulk operation deletes only eligible clients', async () => {
  const clientIds = ['c1', 'c2', 'c3'];
  user = database([
    { data: [{ id: 'c1' }, { id: 'c3' }] },
    { data: [{ id: 'c1' }, { id: 'c3' }] },
  ]);
  state.admin = database([
    { data: [{ client_id: 'c2' }] },
    { error: null },
    { error: null }
  ]);

  const result = await (bulkDeleteClientsFn as any)({ data: { clientIds }, context: { supabase: user, userId: 'owner' } });
  
  expect(result.deletedCount).toBe(2);
  expect(result.preservedCount).toBe(1);
});

it('5. Deleting clients does not delete unrelated clients', async () => {
  const clientIds = ['c1'];
  user = database([
    { data: [{ id: 'c1' }] }, 
    { data: [{ id: 'c1' }] }, 
  ]);
  state.admin = database([
    { data: [] }, 
    { error: null }, 
  ]);

  await (bulkDeleteClientsFn as any)({ data: { clientIds }, context: { supabase: user, userId: 'owner' } });
  const userDeleteCall = user.calls.find((c: any) => c.table === 'clients' && c.method === 'in');
  expect(userDeleteCall.args[1]).toEqual(['c1']);
});

it('9. RLS/organization isolation remains enforced', async () => {
  const clientIds = ['c1', 'c-not-owned'];
  user = database([
    { data: [{ id: 'c1' }] }, 
    { data: [{ id: 'c1' }] }, 
  ]);
  state.admin = database([
    { data: [] }, 
    { error: null }, 
  ]);

  const result = await (bulkDeleteClientsFn as any)({ data: { clientIds }, context: { supabase: user, userId: 'owner' } });
  
  expect(result.deletedCount).toBe(1);
  expect(result.preservedCount).toBe(1);
});
