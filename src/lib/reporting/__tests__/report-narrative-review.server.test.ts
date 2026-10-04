import { beforeEach, it, expect, vi } from 'vitest';

const call = vi.hoisted(() => vi.fn());

vi.mock('../../groq.server', () => ({
  callGroq: call,
  parseJsonLoose: (text: string) => JSON.parse(text),
}));

vi.mock('../../ai/request-budget', () => ({
  estimateRequestInputTokens: () => 100,
}));

import { reviewReportNarrative } from '../report-narrative-review.server';

const text = 'La Sala negó el amparo solicitado.';

const args = {
  payload: {
    report: {
      executive_summary: `${text} [DOC 1 p.1].`,
    },
  },
  pages: [
    {
      document_id: 'd',
      page: 1,
      text,
    },
  ],
  documents: [
    {
      id: 'd',
      doc_n: 1,
    },
  ],
  authorities: [],
  lawContext: {},
};

beforeEach(() => {
  call.mockReset();
});

it('provider outage persists unresolved progress and never completes', async () => {
  call.mockRejectedValue(new Error('offline'));

  const persist = vi.fn();

  const manifest = await reviewReportNarrative(args, { persist });

  expect(manifest.complete).toBe(false);
  expect(persist).toHaveBeenCalled();
  expect(call).not.toHaveBeenCalled();
});

it('persists each unit and fails closed when narrative classification is incomplete', async () => {
  const input = {
    ...args,
    payload: {
      report: {
        executive_summary:
          `${text} [DOC 1 p.1].\n\nOtra afirmación [DOC 1 p.1].`,
      },
    },
  };

  const snapshots: any[] = [];

  const persist = vi.fn(async (manifest) => {
    snapshots.push(structuredClone(manifest));
  });

  const manifest = await reviewReportNarrative(input, { persist });

  expect(call).not.toHaveBeenCalled();

  expect(manifest.complete).toBe(false);

  const unitValues = Object.values(manifest.units);

  expect(unitValues).toHaveLength(2);

  expect(
    unitValues.every((unit) => unit.verdict === 'unresolved'),
  ).toBe(true);

  expect(
    unitValues.every(
      (unit) =>
        unit.reason === 'Material claim classification incomplete.',
    ),
  ).toBe(true);

  expect(persist).toHaveBeenCalledTimes(3);
  expect(snapshots).toHaveLength(3);

  expect(Object.keys(snapshots[0].units)).toHaveLength(1);
  expect(Object.keys(snapshots[1].units)).toHaveLength(2);
  expect(Object.keys(snapshots[2].units)).toHaveLength(2);

  expect(snapshots[0].complete).toBe(false);
  expect(snapshots[1].complete).toBe(false);
  expect(snapshots[2].complete).toBe(false);

  const resumed = await reviewReportNarrative(input, {
    cached: manifest,
  });

  expect(call).not.toHaveBeenCalled();
  expect(resumed.complete).toBe(false);
  expect(Object.keys(resumed.units)).toHaveLength(2);

  expect(
    Object.values(resumed.units).every(
      (unit) => unit.verdict === 'unresolved',
    ),
  ).toBe(true);
});

it('uncited prose cannot pass by inheriting reviewed findings', async () => {
  const result = await reviewReportNarrative({
    ...args,
    payload: {
      report: {
        executive_summary: 'Una conclusión inventada.',
      },
    },
  });

  expect(call).not.toHaveBeenCalled();
  expect(result.complete).toBe(false);
});