import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  event: {} as any,
  fail: false,
  writes: [] as any[],
  stripeSubscription: {
    id: "sub_trial",
    status: "trialing",
    customer: "cus_trial",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          current_period_end: 1800000000,
          price: { recurring: { interval: "month" } },
        },
      ],
    },
  } as any,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => config,
}));

vi.mock("@/lib/stripe.server", () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: () => state.event,
    },
    subscriptions: {
      retrieve: async () => state.stripeSubscription,
    },
  }),
}));

vi.mock("@/lib/email-templates/send-email", () => ({
  sendTemplateEmail: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async () => ({ error: null }),
    from: (table: string) => {
      const q: any = {
        upsert: (data: any) => {
          state.writes.push({ table, data });
          return q;
        },
        update: (data: any) => {
          state.writes.push({ table, data });
          return q;
        },
        eq: () => q,
        insert: () => q,
        throwOnError: async () => {
          if (state.fail) throw Error("temporary database failure");
          return { error: null };
        },
        then: (resolve: any) => resolve({ error: null }),
      };
      return q;
    },
  }),
}));

import { Route } from "../../routes/api/public/hooks/stripe-webhook";

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "test-only");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");

  state.fail = false;
  state.writes = [];

  state.stripeSubscription = {
    id: "sub_trial",
    status: "trialing",
    customer: "cus_trial",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          current_period_end: 1800000000,
          price: { recurring: { interval: "month" } },
        },
      ],
    },
  };

  state.event = {
    id: "evt_test",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_test",
        customer: "cus_test",
        metadata: { user_id: "test-user" },
        status: "active",
        cancel_at_period_end: false,
        items: {
          data: [
            {
              current_period_end: 1800000000,
              price: { recurring: { interval: "month" } },
            },
          ],
        },
      },
    },
  };
});

const send = () =>
  (Route as any).server.handlers.POST({
    request: new Request("http://localhost/api/public/hooks/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": "mock-verified" },
      body: "{}",
    }),
  });

describe("subscription webhook persistence", () => {
  it("saves the current Stripe item renewal date", async () => {
    expect((await send()).status).toBe(200);

    expect(
      state.writes.find((x) => x.table === "subscriptions").data.current_period_end,
    ).toBe(new Date(1800000000 * 1000).toISOString());
  });

  it("persists trialing from the real Stripe subscription after checkout", async () => {
    state.event = {
      id: "evt_checkout_trial",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          mode: "subscription",
          customer: "cus_trial",
          subscription: "sub_trial",
          customer_email: "trial@example.com",
          customer_details: {
            email: "trial@example.com",
            name: "Trial Customer",
          },
          metadata: {
            user_id: "test-user",
            plan: "solo",
          },
        },
      },
    };

    expect((await send()).status).toBe(200);

    const write = state.writes.find((x) => x.table === "subscriptions");

    expect(write).toBeTruthy();
    expect(write.data.status).toBe("trialing");
    expect(write.data.stripe_subscription_id).toBe("sub_trial");
    expect(write.data.stripe_customer_id).toBe("cus_trial");
    expect(write.data.current_period_end).toBe(
      new Date(1800000000 * 1000).toISOString(),
    );
  });

  it("returns retryable failure when subscription storage fails", async () => {
    state.fail = true;
    expect((await send()).status).toBe(500);
  });

  it("records cancellation without reporting success on database failure", async () => {
    state.event.type = "customer.subscription.deleted";
    state.fail = true;
    expect((await send()).status).toBe(500);
  });
});