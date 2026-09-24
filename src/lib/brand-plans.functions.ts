import { createServerFn } from "@tanstack/react-start";

// Only published marketing fields for the established customer plans are public.
export const listBrandPlans = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("billing_plans")
    .select("key,label,tagline,price_cents,currency,interval")
    .eq("active", true)
    .in("key", ["solo", "firm", "enterprise"])
    .order("sort_order", { ascending: true });
  if (error) throw new Error("Subscription plans are temporarily unavailable.");
  return data ?? [];
});
