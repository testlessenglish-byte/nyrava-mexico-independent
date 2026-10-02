import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  buildChatContext,
  invalidateChatContext,
  invalidateAndRebuildChatContext,
} from "../chat.server";

/**
 * Minimal fake Supabase client covering exactly the query shapes
 * buildChatContext() (via listFindings + six parallel table reads) issues:
 *
 *   db.from("case_findings").select(...).eq(...).order(...).order(...)
 *   db.from("analyses").select(...).eq(...).maybeSingle()
 *   db.from("agent_findings").select(...).eq(...)
 *   db.from("case_scores").select(...).eq(...).maybeSingle()
 *   db.from("case_theories").select(...).eq(...)
 *   db.from("case_opportunities").select(...).eq(...)
 *   db.from("case_witnesses").select(...).eq(...)
 *   db.from("case_trial_prep").select(...).eq(...).maybeSingle()
 *   db.from("documents").select(...).eq(...).order(...)
 *
 * Rows are read from a mutable store so a test can simulate "the pipeline
 * reran and wrote new findings" by mutating the store between calls.
 */
function makeFakeDb(store: Record<string, unknown[]>) {
  function builder(table: string) {
    let filtered = () => store[table] ?? [];
    const api = {
      select(_cols: string) {
        return api;
      },
      eq(col: string, val: string) {
        const prev = filtered;
        filtered = () => prev().filter((r) => (r as Record<string, unknown>)[col] === val);
        return api;
      },
      // Phase 3 reader audit: readers exclude mirrored `projection:*` rows.
      not(col: string, _op: "like", pattern: string) {
        const prev = filtered;
        const prefix = pattern.replace(/%$/, "");
        filtered = () =>
          prev().filter((r) => !String((r as Record<string, unknown>)[col] ?? "").startsWith(prefix));
        return api;
      },
      // audit B8: listFindings() (findings.server.ts) added
      // .is("superseded_at", null) as part of the finding-supersession
      // feature — this fake builder didn't support .is() at all, so every
      // call through listFindings() threw before returning any rows.
      // Fixture rows in this file don't set superseded_at at all (absent,
      // not explicitly null) — `?? null` treats "column absent" the same
      // as "column is null", matching what a real un-superseded DB row
      // actually looks like.
      is(col: string, val: unknown) {
        const prev = filtered;
        filtered = () => prev().filter((r) => ((r as Record<string, unknown>)[col] ?? null) === val);
        return api;
      },
      order() {
        return api;
      },
      // Both awaited directly (findings/list-style) and .maybeSingle() (single-row) are used.
      maybeSingle: async () => ({ data: filtered()[0] ?? null, error: null }),
      then(resolve: (v: { data: unknown[]; error: null }) => void) {
        resolve({ data: filtered(), error: null });
      },
    };
    return api;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: (table: string) => builder(table) } as any;
}

const CASE_ID = "case-cache-1";
const EXECUTION_ID = "exec-cache-current";

function certifiedFinding(
  id: string,
  caseId: string,
  title: string,
  description = "v1",
) {
  return {
    id,
    case_id: caseId,
    execution_id: EXECUTION_ID,
    source_module: "agent:test_verified",
    title,
    description,
    category: "x",
    severity: "low",
    affected_party: "plaintiff",
    finding_status: "candidate",
    verification_status: "verified",
    metadata: {
      execution_id: EXECUTION_ID,
      semantic_support_review: {
        version: 1,
        verdict: "supported",
        hash: `test-support-${id}`,
      },
    },
  };
}

function withCurrentCase(
  store: Record<string, unknown[]>,
  caseId = CASE_ID,
): Record<string, unknown[]> {
  return {
    ...store,
    cases: [{ id: caseId, execution_id: EXECUTION_ID }],
  };
}

beforeEach(() => {
  invalidateChatContext(CASE_ID);
  invalidateChatContext("case-cache-2");
});

describe("Talk to Case context cache", () => {
  it("caches the built context across calls within the TTL", async () => {
    const store: Record<string, unknown[]> = withCurrentCase({
      case_findings: [certifiedFinding("f1", CASE_ID, "Original finding", "v1")],
    });
    const db = makeFakeDb(store);

    const first = await buildChatContext(db, CASE_ID);
    expect(first.ctx).toContain("Original finding");

    // Mutate underlying data WITHOUT invalidating — cached call must still
    // return the old snapshot (this is the baseline the fix improves on).
    store.case_findings = [certifiedFinding("f2", CASE_ID, "Updated finding", "v2")];
    const second = await buildChatContext(db, CASE_ID);
    expect(second.ctx).toContain("Original finding");
    expect(second.ctx).not.toContain("Updated finding");
  });

  it("rerun clears cache and next chat rebuilds context from fresh data", async () => {
    const store: Record<string, unknown[]> = withCurrentCase({
      case_findings: [certifiedFinding("f1", CASE_ID, "Pre-rerun finding", "v1")],
    });
    const db = makeFakeDb(store);

    await buildChatContext(db, CASE_ID);

    // Simulate an intelligence rerun: derived tables get new data, then the
    // rerun completes and invalidates the cache.
    store.case_findings = [certifiedFinding("f2", CASE_ID, "Post-rerun finding", "v2")];
    invalidateChatContext(CASE_ID);

    const rebuilt = await buildChatContext(db, CASE_ID);
    expect(rebuilt.ctx).toContain("Post-rerun finding");
    expect(rebuilt.ctx).not.toContain("Pre-rerun finding");
  });

  it("no stale findings remain: old finding text never reappears after invalidation", async () => {
    const store: Record<string, unknown[]> = withCurrentCase({
      case_findings: [certifiedFinding("f1", CASE_ID, "Stale-candidate finding", "v1")],
    });
    const db = makeFakeDb(store);
    await buildChatContext(db, CASE_ID);

    store.case_findings = [];
    invalidateChatContext(CASE_ID);

    const afterClear = await buildChatContext(db, CASE_ID);
    expect(afterClear.ctx).not.toContain("Stale-candidate finding");
  });

  it("invalidateAndRebuildChatContext clears, eagerly rebuilds, and logs diagnostics", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const store: Record<string, unknown[]> = withCurrentCase({
      case_findings: [certifiedFinding("f1", CASE_ID, "Fresh finding", "v1")],
    });
    const db = makeFakeDb(store);

    // Prime the cache with something, so we can prove it gets replaced.
    const finding = store.case_findings[0] as Record<string, unknown>;
    finding.title = "Before rerun";
    await buildChatContext(db, CASE_ID);
    finding.title = "After rerun";

    const result = await invalidateAndRebuildChatContext(db, CASE_ID, { runId: "run-42" });
    expect(result.cleared).toBe(true);
    expect(result.rebuilt).toBe(true);
    expect(typeof result.durationMs).toBe("number");

    // The eagerly-rebuilt cache must already reflect the new data — the
    // *next* chat request should not need to rebuild at all.
    const next = await buildChatContext(db, CASE_ID);
    expect(next.ctx).toContain("After rerun");
    expect(next.ctx).not.toContain("Before rerun");

    // Diagnostics were logged with the required fields.
    const logged = infoSpy.mock.calls.find((c) => String(c[0]).includes("pipeline_completed"));
    expect(logged).toBeTruthy();
    const payload = JSON.parse(String(logged?.[0]));
    expect(payload.case_id).toBe(CASE_ID);
    expect(payload.run_id).toBe("run-42");
    expect(payload.talk_to_case_cache).toBe("invalidated");
    expect(payload.context).toBe("rebuilt");
    expect(typeof payload.duration_ms).toBe("number");
    expect(typeof payload.timestamp).toBe("string");

    infoSpy.mockRestore();
  });

  it("handles multiple reruns in sequence — each invalidation reflects the latest data only", async () => {
    const store: Record<string, unknown[]> = withCurrentCase({
      case_findings: [certifiedFinding("f1", CASE_ID, "Run 1 finding", "v1")],
    });
    const db = makeFakeDb(store);

    await buildChatContext(db, CASE_ID);

    for (const label of ["Run 2 finding", "Run 3 finding", "Run 4 finding"]) {
      store.case_findings = [certifiedFinding(label, CASE_ID, label, "v")];
      await invalidateAndRebuildChatContext(db, CASE_ID, { runId: label });
      const ctx = (await buildChatContext(db, CASE_ID)).ctx;
      expect(ctx).toContain(label);
      expect(ctx).not.toContain("Run 1 finding");
    }
  });

  it("updated report and chat agree: context rebuilt post-rerun matches the newest findings only", async () => {
    const store: Record<string, unknown[]> = withCurrentCase({
      case_findings: [
        certifiedFinding("f1", CASE_ID, "Old report claim", "outdated"),
      ],
    });
    const db = makeFakeDb(store);
    await buildChatContext(db, CASE_ID); // simulates chat opened before the rerun

    // Attorney corrects evidence + reruns pipelines: report regenerates with
    // new findings, and the rerun invalidates+rebuilds the chat cache.
    store.case_findings = [
      certifiedFinding("f1", CASE_ID, "Corrected report claim", "up to date"),
    ];
    await invalidateAndRebuildChatContext(db, CASE_ID, { runId: "run-correction" });

    const chatCtx = (await buildChatContext(db, CASE_ID)).ctx;
    expect(chatCtx).toContain("Corrected report claim");
    expect(chatCtx).not.toContain("Old report claim");
  });

  it("concurrent users of the same case never receive stale context after invalidation", async () => {
    const store: Record<string, unknown[]> = withCurrentCase({
      case_findings: [certifiedFinding("f1", CASE_ID, "Before concurrent rerun", "v1")],
    });
    const db = makeFakeDb(store);

    // Two "users" (independent request contexts, same shared process cache)
    // both read the case before the rerun.
    const userA = await buildChatContext(db, CASE_ID);
    const userB = await buildChatContext(db, CASE_ID);
    expect(userA.ctx).toContain("Before concurrent rerun");
    expect(userB.ctx).toContain("Before concurrent rerun");

    store.case_findings = [certifiedFinding("f2", CASE_ID, "After concurrent rerun", "v2")];
    await invalidateAndRebuildChatContext(db, CASE_ID, { runId: "run-concurrent" });

    // Both users' NEXT requests — regardless of who asks first — must see
    // the same, fresh, rebuilt context. The cache is keyed by case, not by
    // user, so there is no per-user stale copy to race against.
    const [nextA, nextB] = await Promise.all([buildChatContext(db, CASE_ID), buildChatContext(db, CASE_ID)]);
    expect(nextA.ctx).toContain("After concurrent rerun");
    expect(nextB.ctx).toContain("After concurrent rerun");
    expect(nextA.ctx).not.toContain("Before concurrent rerun");
    expect(nextB.ctx).not.toContain("Before concurrent rerun");
  });

  it("invalidating one case never affects another case's cache", async () => {
    const storeA: Record<string, unknown[]> = withCurrentCase({ case_findings: [certifiedFinding("a1", CASE_ID, "Case A finding", "v1")] });
    const storeB: Record<string, unknown[]> = withCurrentCase({ case_findings: [certifiedFinding("b1", "case-cache-2", "Case B finding")] });
    storeA.cases = [{ id: CASE_ID, execution_id: EXECUTION_ID }];
    const dbA = makeFakeDb(storeA);
    storeB.cases = [{ id: "case-cache-2", execution_id: EXECUTION_ID }];
    const dbB = makeFakeDb(storeB);

    await buildChatContext(dbA, CASE_ID);
    const beforeB = await buildChatContext(dbB, "case-cache-2");
    expect(beforeB.ctx).toContain("Case B finding");

    storeA.case_findings = [certifiedFinding("a2", CASE_ID, "Case A rerun finding", "v2")];
    await invalidateAndRebuildChatContext(dbA, CASE_ID, { runId: "run-case-a" });

    // Case B's cache is untouched by Case A's invalidation.
    const afterB = await buildChatContext(dbB, "case-cache-2");
    expect(afterB.ctx).toContain("Case B finding");
  });

  it("rebuild failure still leaves the cache cleared, not stale", async () => {
    const store: Record<string, unknown[]> = withCurrentCase({
      case_findings: [certifiedFinding("f1", CASE_ID, "Stale before failure", "v1")],
    });
    const db = makeFakeDb(store);
    await buildChatContext(db, CASE_ID);

    // A db whose queries reject during rebuild (simulating a transient DB error).
    // Every chained method returns the same rejecting thenable so this behaves
    // the same regardless of which chain buildChatContext's callers use.
    const rejecting = {
      select: () => rejecting,
      eq: () => rejecting,
      order: () => rejecting,
      not: () => rejecting,
      is: () => rejecting,
      maybeSingle: () => Promise.reject(new Error("connection reset")),
      then: (_resolve: unknown, reject: (e: Error) => void) => reject(new Error("connection reset")),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brokenDb = { from: () => rejecting } as any;

    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await invalidateAndRebuildChatContext(brokenDb, CASE_ID, { runId: "run-broken" });
    expect(result.cleared).toBe(true);
    expect(result.rebuilt).toBe(false);
    warnSpy.mockRestore();
    infoSpy.mockRestore();

    // The cache must not still be serving the pre-rerun snapshot.
    store.case_findings = [certifiedFinding("f2", CASE_ID, "Fresh after recovery", "v2")];
    const recovered = await buildChatContext(db, CASE_ID);
    expect(recovered.ctx).toContain("Fresh after recovery");
    expect(recovered.ctx).not.toContain("Stale before failure");
  });
});
