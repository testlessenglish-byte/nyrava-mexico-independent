import { describe, expect, it, vi } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@tanstack/react-start', () => ({
  useServerFn: () => vi.fn()
}));
vi.mock('@/lib/clients.functions', () => ({ listClients: vi.fn() }));
vi.mock('@/lib/cases.functions', () => ({ createCaseAndUpload: vi.fn(), listGroqKeys: vi.fn() }));
vi.mock('@/lib/legal-analysis-types.functions', () => ({ listLegalAnalysisTypes: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: (opts: any) => {
    if (opts.queryKey && opts.queryKey[0] === 'clients') return { data: { clients: [{ id: '1', display_name: 'Acme Corp' }], totalCount: 1, page: 1, limit: 10 } };
    return { data: [] };
  }
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: any) => ({ options: { component: config.component }, useSearch: () => ({ clientId: null }), useNavigate: () => vi.fn() }),
  useRouter: () => ({ navigate: vi.fn() }),
  useSearch: () => ({ clientId: null }),
  useNavigate: () => vi.fn(),
  Link: () => createElement('div', null, 'Link')
}));
vi.mock('@/i18n', () => ({ useI18n: () => ({ locale: 'en', t: (s: string) => s }) }));
vi.mock('lucide-react', () => ({
  Upload: () => createElement('div', null, 'Upload'),
  FileText: () => createElement('div', null, 'FileText'),
  X: () => createElement('div', null, 'X'),
  KeyRound: () => createElement('div', null, 'KeyRound'),
  ShieldCheck: () => createElement('div', null, 'ShieldCheck')
}));

import { Route } from '../_authenticated/new';

describe('/new client pagination rendering', () => {
  it('renders successfully without map crashing when clientsList is a paginated object', () => {
    const Component = (Route as any).options.component;
    let html = '';
    expect(() => {
      html = renderToStaticMarkup(createElement(Component as any));
    }).not.toThrow();
    expect(html).toContain('Acme Corp');
  });
});
