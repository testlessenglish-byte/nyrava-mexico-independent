import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { localizedEnum } from "../social-i18n";
import { SOCIAL_CASE_PRIORITIES, socialCasePriority, socialCasePriorityOptions } from "../priorities";

// Execute the real validators and handlers without transport or authentication.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (data: unknown) => data;
    const builder = {
      middleware: () => builder,
      inputValidator: (fn: typeof validate) => { validate = fn; return builder; },
      handler: (fn: any) => async (args: any) => fn({ ...args, data: validate(args.data) }),
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
import { createAndAssignCareCase, openCareCaseFromIntake, updateCareCaseState, getSocialCase, searchResourceNetwork } from "../../social.functions";

const id = "11111111-1111-4111-8111-111111111111";
const creation = { orgId: id, programId: id, newClientName: "Priority regression fixture", caseType: "family" };
const operations = [
  [createAndAssignCareCase, creation, "create_and_assign_care_case"],
  [openCareCaseFromIntake, { intakeId: id, caseType: "family" }, "open_care_case_from_intake"],
  [updateCareCaseState, { caseId: id, status: "active", reason: "Regression verification" }, "update_care_case_state"],
] as const;
const route = readFileSync("src/routes/_authenticated/social.tsx", "utf8");


describe("Comprehensive Care priority contract", () => {
  it("uses the shared live values in creation, intake, updates, and filters", () => {
    for (const path of [
      "src/routes/_authenticated/social.tsx",
      "src/components/social/SocialIntakeManager.tsx",
      "src/components/social/SocialCaseWorkspace.tsx",
      "src/components/social/ResourceKnowledgeNetwork.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("socialCasePriorityOptions(es)");
      expect(source).not.toContain('["standard","urgent","emergency"]');
      expect(source).not.toMatch(/priority:\s*"standard"|priority\|\|"standard"/);
    }
  });

  it.each([["Standard", "normal"], ["Low", "low"], ["High", "high"], ["Urgent", "urgent"]])(
    "%s selection reaches every case RPC as %s", async (label, priority) => {
      const option = socialCasePriorityOptions(false).find(option => option.label === label);
      expect(option?.value).toBe(priority);
      for (const [operation, input, rpcName] of operations) {
        const rpc = vi.fn().mockResolvedValue({ data: { id, priority }, error: null });
        await (operation as any)({ data: { ...input, priority: option!.value }, context: { userId: id, supabase: { rpc } } });
        expect(rpc).toHaveBeenCalledWith(rpcName, expect.objectContaining({ p_priority: priority }));
      }
    },
  );

  it.each(["low", "normal", "high", "urgent"])("passes %s filters unchanged to the resource RPC", async urgency => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await (searchResourceNetwork as any)({ data: { urgency }, context: { userId: id, supabase: { rpc } } });
    expect(rpc).toHaveBeenCalledWith("search_resource_network", expect.objectContaining({ p_urgency: urgency }));
  });

  it("defaults creation to the live database normal priority", async () => {
    expect(SOCIAL_CASE_PRIORITIES).toEqual(["low", "normal", "high", "urgent"]);
    for (const value of SOCIAL_CASE_PRIORITIES) expect(socialCasePriority.parse(value)).toBe(value);
    expect(route).toContain('priority:"normal" as "low"|"normal"|"high"|"urgent"');
    for (const [operation, input] of operations.slice(0, 2)) {
      const rpc = vi.fn().mockResolvedValue({ data: { id }, error: null });
      await (operation as any)({ data: input, context: { userId: id, supabase: { rpc } } });
      expect(rpc.mock.calls[0][1].p_priority).toBe("normal");
    }
  });

  it.each(["standard", "emergency", "invalid", "", null])("rejects %s before persistence", async priority => {
    for (const [operation, input] of operations) {
      const rpc = vi.fn();
      await expect((operation as any)({ data: { ...input, priority }, context: { userId: id, supabase: { rpc } } })).rejects.toThrow();
      expect(rpc).not.toHaveBeenCalled();
    }
  });

  it.each(["low", "normal", "high", "urgent"])("preserves existing %s cases on read", async priority => {
    const record = { id, priority, status: "active" };
    const rpc = vi.fn().mockResolvedValue({ data: record, error: null });
    const rows: any = new Proxy({}, { get: (_, key) => key === "then"
      ? (resolve: any) => resolve({ data: [], error: null }) : () => rows });
    const result = await (getSocialCase as any)({ data: { caseId: id }, context: { userId: id, supabase: { rpc, from: () => rows } } });
    expect(result.case).toEqual(record);
    expect(localizedEnum(result.case.priority, false)).not.toBe("—");
    expect(rpc).toHaveBeenCalledWith("get_social_case_core", { p_case: id });
  });
});
