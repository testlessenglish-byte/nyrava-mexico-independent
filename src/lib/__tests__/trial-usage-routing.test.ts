import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  subscriptionStatus: "trialing" as "trialing" | "active",
  rpcCalls: [] as Array<{ name: string; args: any }>,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (name: string, args: any) => {
      state.rpcCalls.push({ name, args });

      if (name === "is_admin_tier") {
        return { data: false, error: null };
      }

      if (name === "consume_trial_usage") {
        return {
          data: [
            {
              allowed: true,
              monthly_used: 1,
              monthly_limit: 150,
              daily_used: 1,
              daily_limit: 5,
            },
          ],
          error: null,
        };
      }

      if (name === "consume_usage") {
        return {
          data: [{ allowed: true, used: 1, limit: 150 }],
          error: null,
        };
      }

      throw new Error(`Unexpected RPC: ${name}`);
    },

    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => {
          if (table === "subscriptions") {
            return {
              data: {
                plan: "solo",
                status: state.subscriptionStatus,
                is_beta_tester: false,
              },
              error: null,
            };
          }

          if (table === "billing_plans") {
            return {
              data: {
                label: "Basic",
                ai_requests_monthly: 150,
                talk_to_case_monthly: 30,
                case_limit: 5,
                storage_gb_limit: 1,
                team_member_limit: 1,
                byok_allowed: false,
                overage_price_cents: null,
              },
              error: null,
            };
          }

          return { data: null, error: null };
        },
        insert: async () => ({ error: null }),
      };

      return q;
    },
  }),
}));

import { checkAndConsumeUsage } from "../usage.server";

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
  state.subscriptionStatus = "trialing";
  state.rpcCalls = [];
});

describe("trial usage routing", () => {
  it("uses the atomic daily+monthly RPC for a trialing subscription", async () => {
    const result = await checkAndConsumeUsage({
      userId: "test-user",
      kind: "ai_request",
      feature: "case_intelligence",
    });

    const call = state.rpcCalls.find((x) => x.name === "consume_trial_usage");

    expect(call).toBeTruthy();
    expect(call?.args.p_monthly_limit).toBe(150);
    expect(call?.args.p_daily_limit).toBe(5);

    expect(
      state.rpcCalls.some((x) => x.name === "consume_usage"),
    ).toBe(false);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
    expect(result.planLabel).toBe("Basic trial");
  });

  it("uses the existing monthly RPC for an active paid subscription", async () => {
    state.subscriptionStatus = "active";

    const result = await checkAndConsumeUsage({
      userId: "test-user",
      kind: "ai_request",
      feature: "case_intelligence",
    });

    const call = state.rpcCalls.find((x) => x.name === "consume_usage");

    expect(call).toBeTruthy();
    expect(call?.args.p_limit).toBe(150);

    expect(
      state.rpcCalls.some((x) => x.name === "consume_trial_usage"),
    ).toBe(false);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(150);
    expect(result.remaining).toBe(149);
    expect(result.planLabel).toBe("Basic");
  });

  it("derives the Talk-to-Case trial daily limit from the plan", async () => {
    const result = await checkAndConsumeUsage({
      userId: "test-user",
      kind: "talk_to_case",
      feature: "talk_to_case",
    });

    const call = state.rpcCalls.find((x) => x.name === "consume_trial_usage");

    expect(call).toBeTruthy();
    expect(call?.args.p_monthly_limit).toBe(30);
    expect(call?.args.p_daily_limit).toBe(1);
    expect(result.limit).toBe(1);
  });
});