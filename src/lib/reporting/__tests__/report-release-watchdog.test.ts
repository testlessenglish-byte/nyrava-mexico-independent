import { describe, expect, it } from "vitest";
import { runReportReleaseWatchdog } from "../report-release-watchdog.server";

type Row = Record<string, any> & { id: string };

function fakeDb(caseRow: Row, reportRow: Row) {
  const rows = {
    cases: [structuredClone(caseRow)],
    reports: [structuredClone(reportRow)],
  } as Record<string, Row[]>;
  const writes: Array<{ table: string; patch: Record<string, unknown> }> = [];
  return {
    rows,
    writes,
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      let patch: Record<string, unknown> | undefined;
      const matching = () => (rows[table] ?? []).filter((row) => filters.every((f) => f(row)));
      const query: any = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
        is: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return query; },
        update: (value: Record<string, unknown>) => { patch = value; return query; },
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        then(resolve: (value: { data: Row[]; error: null }) => unknown) {
          const found = matching();
          if (patch) {
            for (const row of found) Object.assign(row, patch);
            writes.push({ table, patch });
          }
          return Promise.resolve(resolve({ data: found, error: null }));
        },
      };
      return query;
    },
  };
}

const past = new Date(Date.now() - 10 * 60_000).toISOString();
const future = new Date(Date.now() + 2 * 60_000).toISOString();

function blockedReport(): Row {
  return {
    id: "report-1",
    case_id: "case-1",
    execution_id: "run-1",
    executive_summary: "Draft under review",
    quality_blocked: false,
    quality_block_reasons: [],
    full_report: {
      final_report_contract_validation: {
        ok: false,
        blocking_errors: ["citation_integrity:proposition_not_supported"],
      },
      release_decision: "BLOCKED",
      release_gate: { ok: false, decision: "BLOCKED" },
      final_review: { released: false, decision: "BLOCKED", status: "needs_revision" },
      final_review_progress: { outcomes: {} },
    },
  };
}

describe("report release watchdog recovery", () => {
  it("keeps an explicitly blocked final contract in needs_revision even when a stale quality flag is false", async () => {
    const db = fakeDb({
      id: "case-1", execution_id: "run-1", status: "reporting",
      updated_at: past, worker_lease_until: null,
    }, blockedReport());
    await runReportReleaseWatchdog(db as never);
    expect(db.rows.cases[0].status).toBe("needs_revision");
    expect(db.rows.reports[0].full_report.release_decision).toBe("BLOCKED");
    expect(db.rows.reports[0].full_report.final_review.decision).toBe("BLOCKED");
    expect(db.rows.reports[0].quality_blocked).toBe(true);
  });

  it("honors a failed saved contract even if the other saved approval flags say PASS", async () => {
    const report = blockedReport();
    report.full_report.release_decision = "PASS";
    report.full_report.release_gate = { ok: true, decision: "PASS" };
    report.full_report.final_review = { released: true, decision: "PASS", status: "released" };
    const db = fakeDb({
      id: "case-1", execution_id: "run-1", status: "reporting",
      updated_at: past, worker_lease_until: null,
    }, report);
    await runReportReleaseWatchdog(db as never);
    expect(db.rows.cases[0].status).toBe("needs_revision");
    expect(db.rows.reports[0].full_report.release_decision).toBe("BLOCKED");
  });

  it("honors a persisted blocked review even when the saved contract is valid", async () => {
    const report = blockedReport();
    report.full_report.final_report_contract_validation = { ok: true, blocking_errors: [] };
    const db = fakeDb({
      id: "case-1", execution_id: "run-1", status: "reporting",
      updated_at: past, worker_lease_until: null,
    }, report);
    await runReportReleaseWatchdog(db as never);
    expect(db.rows.cases[0].status).toBe("needs_revision");
    expect(db.rows.reports[0].full_report.release_decision).toBe("BLOCKED");
  });

  it("leaves a report owned by an active worker lease untouched", async () => {
    const report = blockedReport();
    report.full_report.final_report_contract_validation = { ok: true, blocking_errors: [] };
    report.full_report.release_decision = "PASS";
    report.full_report.release_gate = { ok: true, decision: "PASS" };
    report.full_report.final_review = { released: true, decision: "PASS", status: "released" };
    const db = fakeDb({
      id: "case-1", execution_id: "run-1", status: "reporting",
      updated_at: past, worker_lease_until: future,
    }, report);
    await runReportReleaseWatchdog(db as never);
    expect(db.rows.cases[0].status).toBe("reporting");
    expect(db.writes).toHaveLength(0);
  });

  it("recovers a completed approval snapshot for the same execution", async () => {
    const report = blockedReport();
    report.full_report.final_report_contract_validation = { ok: true, blocking_errors: [] };
    report.full_report.release_decision = "PASS";
    report.full_report.release_gate = {
      ok: true, decision: "PASS",
      gates: { report: true, qa: true, judge: true, hallucination: true },
      missing_required_engines: [],
    };
    report.full_report.final_review = { released: true, decision: "PASS", status: "released" };
    const db = fakeDb({
      id: "case-1", execution_id: "run-1", status: "reporting",
      updated_at: past, worker_lease_until: null,
    }, report);
    await runReportReleaseWatchdog(db as never);
    expect(db.rows.cases[0].status).toBe("released");
    expect(db.rows.reports[0].full_report.release_decision).toBe("PASS");
    expect(db.writes.filter((w) => w.table === "reports")).toHaveLength(0);
  });

  it("does not trust a positive release flag if a recorded blocking gate failed", async () => {
    const report = blockedReport();
    report.full_report.final_report_contract_validation = { ok: true, blocking_errors: [] };
    report.full_report.release_decision = "PASS";
    report.full_report.final_review = { released: true, decision: "PASS", status: "released" };
    report.full_report.release_gate = {
      ok: true, decision: "PASS",
      gates: { report: false, qa: true, judge: true, hallucination: true },
      missing_required_engines: [],
    };
    const db = fakeDb({
      id: "case-1", execution_id: "run-1", status: "reporting",
      updated_at: past, worker_lease_until: null,
    }, report);
    await runReportReleaseWatchdog(db as never);
    expect(db.rows.cases[0].status).toBe("needs_revision");
    expect(db.rows.reports[0].full_report.release_decision).toBe("BLOCKED");
  });

  it("does not approve a partial review or an older execution report", async () => {
    const partial = blockedReport();
    partial.full_report.final_report_contract_validation = { ok: true, blocking_errors: [] };
    delete partial.full_report.final_review;
    const db = fakeDb({
      id: "case-1", execution_id: "run-1", status: "reporting",
      updated_at: past, worker_lease_until: null,
    }, partial);
    await runReportReleaseWatchdog(db as never);
    expect(db.rows.cases[0].status).toBe("reporting");
    expect(db.writes).toHaveLength(0);

    partial.execution_id = "older-run";
    const mismatched = fakeDb({
      id: "case-1", execution_id: "run-1", status: "reporting",
      updated_at: past, worker_lease_until: null,
    }, partial);
    await runReportReleaseWatchdog(mismatched as never);
    expect(mismatched.rows.cases[0].status).toBe("reporting");
    expect(mismatched.writes).toHaveLength(0);
  });

  it("does not rewrite an already terminal needs_revision case every worker tick", async () => {
    const db = fakeDb({
      id: "case-1", execution_id: "run-1", status: "needs_revision",
      updated_at: past, worker_lease_until: null,
    }, blockedReport());
    await runReportReleaseWatchdog(db as never);
    expect(db.rows.cases[0].status).toBe("needs_revision");
    expect(db.writes).toHaveLength(0);
  });
});
