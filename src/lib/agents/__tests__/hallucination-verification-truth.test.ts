import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ report: {} as Record<string, unknown> }));
vi.mock("@/lib/intelligence/hallucination.server", () => ({
  runHallucinationReview: async () => fixture.report,
}));
vi.mock("@/lib/intelligence/evidence-gate.server", () => ({ getAnalysisMode: async () => "strict" }));
vi.mock("../statistics.server", () => ({
  attachAgentStats: async (_db: unknown, _caseId: unknown, _def: unknown, result: unknown) => result,
}));

beforeEach(() => {
  fixture.report = { total: 10, verified: 1, authority_exempt: 0, unverified: 9, no_citation: 0,
    by_module: {}, upstream_release_block: null };
});

async function review() {
  const { runSingleAgentReview } = await import("../orchestrator.server");
  return (await runSingleAgentReview({
    db: { from: () => ({ insert: async () => ({ error: null }) }) } as never,
    caseId: "case-1", userId: "user-1", apiKey: "offline", apiKeys: ["offline"],
  }, "hallucination")).result;
}

it("reports failed verification separately from the nonblocking review policy", async () => {
  const result = await review();
  expect(result.output).toMatchObject({ hallucination_verification_passed: false, blocking: false });
  expect((result.output as any).warnings.length).toBeGreaterThan(0);
});

it("does not certify a corpus with no reviewed claims", async () => {
  fixture.report = { ...fixture.report, total: 0, verified: 0, unverified: 0 };
  const result = await review();
  expect(result.output).toMatchObject({ hallucination_verification_passed: false });
  expect(result.confidence).toBe(0);
});

it("preserves successful verification when reviewed claims satisfy the threshold", async () => {
  fixture.report = { ...fixture.report, verified: 10, unverified: 0 };
  expect((await review()).output).toMatchObject({ hallucination_verification_passed: true });
});
