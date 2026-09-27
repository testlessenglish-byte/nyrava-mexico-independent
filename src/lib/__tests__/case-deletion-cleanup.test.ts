import { describe, expect, it, vi } from "vitest";
import { deleteCase } from "../cases.functions";

vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{
  let validate=(value:unknown)=>value;
  const builder:any={middleware:()=>builder,inputValidator:(fn:any)=>{validate=fn;return builder;},handler:(fn:any)=>(args:any)=>fn({...args,data:validate(args.data)})};
  return builder;
}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}, getAuthedContext: async (ctx: any) => ({ supabase: ctx.supabase, userId: ctx.userId })}));
vi.mock('@/lib/audit.server', () => ({ logAudit: async () => {} }));

describe("Case Deletion and Client Directory", () => {
  it("preserves the client but removes all data belonging exclusively to the deleted case", async () => {
    // We mock the DB and track deletions
    const caseScopedTables = [
      "documents",
      "document_pages",
      "case_findings",
      "analyses",
      "agent_findings",
      "reports",
      "case_theories",
      "case_perspectives",
      "case_opportunities",
      "case_witnesses",
      "case_timeline_events",
      "case_trial_prep",
      "case_chat_messages",
      "pipeline_engine_runs",
      "pipeline_trace",
      "pipeline_events",
      "case_scores",
      "case_strategy",
      "evidence_classifications",
      "case_work_product",
    ];

    const deletions: Record<string, string[]> = {};
    const db = {
      from(table: string) {
        const query = {
          delete() { return query; },
          select() { return query; },
          eq(col: string, val: string) {
            if (col === "case_id" || col === "id") {
              deletions[table] = deletions[table] || [];
              deletions[table].push(val);
            }
            return query;
          },
          maybeSingle: async () => ({ data: { id: "00000000-0000-0000-0000-000000000001", name: "Case 1", client_id: "client-a" }, error: null }),
        };
        return query;
      },
      storage: {
        from() {
          return {
            remove: async () => ({}),
          };
        }
      }
    };

    // Before deletion, the case had documents, findings, etc. (mocked implicitly)
    // Client A has Case 1 and Case 2.
    // Run deleteCase
    await (deleteCase as any)({
      data: { caseId: "00000000-0000-0000-0000-000000000001" },
      context: { supabase: db, userId: "user-1" },
    });

    // Verify every case-scoped table is explicitly deleted ONLY for Case 1
    for (const table of caseScopedTables) {
      expect(deletions[table]).toContain("00000000-0000-0000-0000-000000000001");
      expect(deletions[table]).not.toContain("00000000-0000-0000-0000-000000000002");
    }
    
    // Verify case itself is deleted
    expect(deletions["cases"]).toContain("00000000-0000-0000-0000-000000000001");
    expect(deletions["cases"]).not.toContain("00000000-0000-0000-0000-000000000002");

    // Client is NOT in the deletion list
    expect(deletions["clients"]).toBeUndefined();
  });
});
