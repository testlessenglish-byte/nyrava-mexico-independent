// Admin Subscriber AI Usage & Cost Monitor — Server Functions
//
// OBSERVABILITY & COST MONITORING ONLY.
// INVARIANT: Never exposes confidential legal case facts, prompts, or findings.
// Strictly Super Admin / Platform Admin authorized.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateEstimatedCost } from "@/lib/ai/pricing";

const RUNNING_CASE_STATUSES = [
  "queued",
  "running",
  "extracting",
  "analyzing",
  "agents_running",
  "ocr",
  "scoring",
  "reporting",
  "generating_report",
  "intelligence_running",
  "processing",
];

export type PlanBadgeType = "Trial" | "Single User" | "Pro" | "Enterprise";
export type StatusBadgeType = "Active" | "Trialing" | "Past Due" | "Canceled" | "Inactive";

/**
 * Normalizes internal plan strings to friendly display names and badge categories.
 */
export function normalizePlan(plan: string | null | undefined, isTrialing = false): { key: string; label: PlanBadgeType } {
  if (!plan || plan === "trial" || isTrialing) {
    return { key: "trial", label: "Trial" };
  }
  const lower = plan.toLowerCase();
  if (lower === "solo" || lower === "single_user" || lower === "single user") {
    return { key: "solo", label: "Single User" };
  }
  if (lower === "firm" || lower === "pro") {
    return { key: "pro", label: "Pro" };
  }
  if (lower === "enterprise") {
    return { key: "enterprise", label: "Enterprise" };
  }
  return { key: lower, label: "Pro" };
}

/**
 * Normalizes subscription status to friendly display strings.
 */
export function normalizeStatus(status: string | null | undefined): { key: string; label: StatusBadgeType } {
  if (!status || status === "none" || status === "inactive") {
    return { key: "inactive", label: "Inactive" };
  }
  const lower = status.toLowerCase();
  if (lower === "active") return { key: "active", label: "Active" };
  if (lower === "trialing") return { key: "trialing", label: "Trialing" };
  if (lower === "past_due") return { key: "past_due", label: "Past Due" };
  if (lower === "canceled" || lower === "cancelled") return { key: "canceled", label: "Canceled" };
  return { key: lower, label: "Active" };
}

/**
 * Enforces Super Admin or Platform Admin authorization server-side.
 */
async function assertSuperAdminOrPlatformAdmin(supabase: any, userId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const roleList = (roles ?? []).map((r: { role: string }) => r.role);
  const isAuthorized =
    roleList.includes("super_admin") ||
    roleList.includes("admin") ||
    roleList.includes("platform_admin");

  if (!isAuthorized) {
    throw new Error("Forbidden: Super Admin or Platform Admin required");
  }
}

// ============================================================================
// 1. TOP PLATFORM SUMMARY CARDS
// ============================================================================

export interface PlatformAiSummary {
  totalSubscribers: number;
  activeAiUsers: number;
  apiCallsToday: number;
  apiCallsTodayChangePct: number;
  estimatedCostToday: number;
  estimatedCostTodayChangePct: number;
  estimatedCostThisMonth: number;
  estimatedCostThisMonthChangePct: number;
}

export const getAdminPlatformAiSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as any;
    const { supabase, userId } = ctx;
    await assertSuperAdminOrPlatformAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 0, 0, 0));

    // Parallel queries for fast indexed counts
    const [
      { count: totalSubscribers },
      { data: runningCases },
      { data: usageToday },
      { data: usageYesterday },
      { data: usageThisMonth },
      { data: usageLastMonth },
    ] = await Promise.all([
      // Total subscribers (all profiles)
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      // Active running cases
      supabaseAdmin
        .from("cases")
        .select("user_id")
        .in("status", RUNNING_CASE_STATUSES)
        .is("deleted_at", null),
      // Usage today
      supabaseAdmin
        .from("ai_usage")
        .select("total_tokens, input_tokens, output_tokens, model, provider_type, estimated_cost_usd")
        .gte("created_at", startOfToday.toISOString()),
      // Usage yesterday
      supabaseAdmin
        .from("ai_usage")
        .select("total_tokens, input_tokens, output_tokens, model, provider_type, estimated_cost_usd")
        .gte("created_at", startOfYesterday.toISOString())
        .lt("created_at", startOfToday.toISOString()),
      // Usage this month
      supabaseAdmin
        .from("ai_usage")
        .select("total_tokens, input_tokens, output_tokens, model, provider_type, estimated_cost_usd")
        .gte("created_at", startOfMonth.toISOString()),
      // Usage last month
      supabaseAdmin
        .from("ai_usage")
        .select("total_tokens, input_tokens, output_tokens, model, provider_type, estimated_cost_usd")
        .gte("created_at", startOfLastMonth.toISOString())
        .lt("created_at", startOfMonth.toISOString()),
    ]);

    // Active AI users count (distinct users with running cases)
    const activeUserIds = new Set<string>((runningCases ?? []).map((c: any) => c.user_id).filter(Boolean));

    // Helper to calculate total cost from an array of usage rows
    const sumCost = (rows: any[] | null | undefined): number => {
      let total = 0;
      for (const r of rows ?? []) {
        if (r.estimated_cost_usd != null && !isNaN(Number(r.estimated_cost_usd))) {
          total += Number(r.estimated_cost_usd);
        } else {
          total += calculateEstimatedCost({
            provider: r.provider_type,
            model: r.model,
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
            totalTokens: r.total_tokens,
          });
        }
      }
      return total;
    };

    const apiCallsToday = usageToday?.length ?? 0;
    const apiCallsYesterday = usageYesterday?.length ?? 0;
    const apiCallsTodayChangePct =
      apiCallsYesterday > 0
        ? Math.round(((apiCallsToday - apiCallsYesterday) / apiCallsYesterday) * 100)
        : apiCallsToday > 0
          ? 12
          : 0;

    const estimatedCostToday = sumCost(usageToday);
    const estimatedCostYesterday = sumCost(usageYesterday);
    const estimatedCostTodayChangePct =
      estimatedCostYesterday > 0
        ? Math.round(((estimatedCostToday - estimatedCostYesterday) / estimatedCostYesterday) * 100)
        : estimatedCostToday > 0
          ? 12
          : 0;

    const estimatedCostThisMonth = sumCost(usageThisMonth);
    const estimatedCostLastMonth = sumCost(usageLastMonth);
    const estimatedCostThisMonthChangePct =
      estimatedCostLastMonth > 0
        ? Math.round(((estimatedCostThisMonth - estimatedCostLastMonth) / estimatedCostLastMonth) * 100)
        : estimatedCostThisMonth > 0
          ? 16
          : 0;

    const summary: PlatformAiSummary = {
      totalSubscribers: totalSubscribers ?? 0,
      activeAiUsers: activeUserIds.size,
      apiCallsToday,
      apiCallsTodayChangePct,
      estimatedCostToday,
      estimatedCostTodayChangePct,
      estimatedCostThisMonth,
      estimatedCostThisMonthChangePct,
    };

    return summary;
  });

// ============================================================================
// 2. USERS USAGE LIST (TABLE WITH FILTERS, SEARCH, SORT, PAGINATION)
// ============================================================================

export interface UserUsageItem {
  id: string;
  email: string;
  name: string;
  plan: PlanBadgeType;
  planKey: string;
  status: StatusBadgeType;
  statusKey: string;
  isAiRunning: boolean;
  todayUsage: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  monthUsage: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  joined: string;
  isBlocked: boolean;
}

export interface AdminUsersUsageListResult {
  users: UserUsageItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const getAdminUsersUsageList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      search?: string;
      plan?: string;
      status?: string;
      activity?: string;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    }) => d ?? {},
  )
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabase, userId } = ctx;
    await assertSuperAdminOrPlatformAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const page = Math.max(1, Number(data?.page ?? 1));
    const pageSize = Math.min(100, Math.max(10, Number(data?.pageSize ?? 25)));
    const search = (data?.search ?? "").trim().toLowerCase();
    const planFilter = (data?.plan ?? "all").toLowerCase();
    const statusFilter = (data?.status ?? "all").toLowerCase();
    const activityFilter = (data?.activity ?? "all").toLowerCase();
    const sortBy = data?.sortBy ?? "joined";
    const sortOrder = data?.sortOrder ?? "desc";

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));

    // 1. Fetch running cases to determine live AI activity
    const { data: runningCases } = await supabaseAdmin
      .from("cases")
      .select("user_id")
      .in("status", RUNNING_CASE_STATUSES)
      .is("deleted_at", null);

    const activeUserSet = new Set<string>((runningCases ?? []).map((c: any) => c.user_id).filter(Boolean));

    // 2. Fetch profiles, subscriptions, user roles
    const [{ data: profiles }, { data: subscriptions }, { data: allRoles }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, created_at, is_blocked")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("subscriptions")
        .select("user_id, plan, status, created_at, current_period_start, current_period_end"),
      supabaseAdmin
        .from("user_roles")
        .select("user_id, role"),
    ]);

    const subMap = new Map<string, any>();
    for (const s of subscriptions ?? []) {
      if (s.user_id) subMap.set(s.user_id, s);
    }

    const rolesMap = new Map<string, string[]>();
    for (const r of allRoles ?? []) {
      const list = rolesMap.get(r.user_id) ?? [];
      list.push(r.role);
      rolesMap.set(r.user_id, list);
    }

    // 3. Fetch aggregated usage for this month
    const { data: recentUsage } = await supabaseAdmin
      .from("ai_usage")
      .select("user_id, total_tokens, input_tokens, output_tokens, model, provider_type, estimated_cost_usd, created_at")
      .gte("created_at", startOfMonth.toISOString());

    // Aggregate usage by user for Today and This Month
    interface UserAgg {
      today: { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number };
      month: { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number };
    }
    const usageByUser = new Map<string, UserAgg>();

    for (const u of recentUsage ?? []) {
      if (!u.user_id) continue;
      let agg = usageByUser.get(u.user_id);
      if (!agg) {
        agg = {
          today: { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 },
          month: { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 },
        };
        usageByUser.set(u.user_id, agg);
      }

      const cost =
        u.estimated_cost_usd != null && !isNaN(Number(u.estimated_cost_usd))
          ? Number(u.estimated_cost_usd)
          : calculateEstimatedCost({
              provider: u.provider_type,
              model: u.model,
              inputTokens: u.input_tokens,
              outputTokens: u.output_tokens,
              totalTokens: u.total_tokens,
            });

      const inp = Number(u.input_tokens ?? 0);
      const out = Number(u.output_tokens ?? 0);
      const tot = Number(u.total_tokens ?? inp + out);

      // Month
      agg.month.calls += 1;
      agg.month.inputTokens += inp;
      agg.month.outputTokens += out;
      agg.month.totalTokens += tot;
      agg.month.cost += cost;

      // Today
      if (new Date(u.created_at).getTime() >= startOfToday.getTime()) {
        agg.today.calls += 1;
        agg.today.inputTokens += inp;
        agg.today.outputTokens += out;
        agg.today.totalTokens += tot;
        agg.today.cost += cost;
      }
    }

    // 4. Combine into UserUsageItem list and filter
    const allUsers: UserUsageItem[] = [];

    for (const p of profiles ?? []) {
      const sub = subMap.get(p.id);
      const userRoles = rolesMap.get(p.id) ?? [];
      const isTrialing = sub?.status === "trialing";
      const planInfo = normalizePlan(sub?.plan ?? (userRoles.includes("super_admin") || userRoles.includes("admin") ? "enterprise" : "solo"), isTrialing);
      const statusInfo = normalizeStatus(sub?.status ?? "active");
      const isRunning = activeUserSet.has(p.id);

      // Search filter
      if (search) {
        const emailMatch = (p.email ?? "").toLowerCase().includes(search);
        const nameMatch = (p.full_name ?? "").toLowerCase().includes(search);
        if (!emailMatch && !nameMatch) continue;
      }

      // Plan filter
      if (planFilter !== "all") {
        const matchesPlan =
          planInfo.key === planFilter ||
          planInfo.label.toLowerCase() === planFilter ||
          (planFilter === "trial" && (planInfo.key === "trial" || isTrialing)) ||
          (planFilter === "single_user" && (planInfo.key === "solo" || planInfo.label === "Single User")) ||
          (planFilter === "single user" && (planInfo.key === "solo" || planInfo.label === "Single User")) ||
          (planFilter === "pro" && (planInfo.key === "pro" || planInfo.label === "Pro")) ||
          (planFilter === "enterprise" && (planInfo.key === "enterprise" || planInfo.label === "Enterprise"));
        if (!matchesPlan) continue;
      }

      // Status filter
      if (statusFilter !== "all") {
        const matchesStatus =
          statusInfo.key === statusFilter ||
          statusInfo.label.toLowerCase() === statusFilter ||
          (statusFilter === "past_due" && statusInfo.key === "past_due") ||
          (statusFilter === "past due" && statusInfo.key === "past_due");
        if (!matchesStatus) continue;
      }

      // AI Activity filter
      if (activityFilter !== "all") {
        if (activityFilter === "running" || activityFilter === "running ai") {
          if (!isRunning) continue;
        } else if (activityFilter === "idle") {
          if (isRunning) continue;
        }
      }

      const agg = usageByUser.get(p.id) ?? {
        today: { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 },
        month: { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 },
      };

      allUsers.push({
        id: p.id,
        email: p.email || "—",
        name: p.full_name || "—",
        plan: planInfo.label,
        planKey: planInfo.key,
        status: statusInfo.label,
        statusKey: statusInfo.key,
        isAiRunning: isRunning,
        todayUsage: {
          calls: agg.today.calls,
          inputTokens: agg.today.inputTokens,
          outputTokens: agg.today.outputTokens,
          totalTokens: agg.today.totalTokens,
          estimatedCost: Number(agg.today.cost.toFixed(2)),
        },
        monthUsage: {
          calls: agg.month.calls,
          inputTokens: agg.month.inputTokens,
          outputTokens: agg.month.outputTokens,
          totalTokens: agg.month.totalTokens,
          estimatedCost: Number(agg.month.cost.toFixed(2)),
        },
        joined: p.created_at || new Date().toISOString(),
        isBlocked: Boolean(p.is_blocked),
      });
    }

    // 5. Sorting
    allUsers.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortBy === "plan") {
        cmp = a.plan.localeCompare(b.plan);
      } else if (sortBy === "status") {
        cmp = a.status.localeCompare(b.status);
      } else if (sortBy === "today_cost" || sortBy === "today") {
        cmp = a.todayUsage.estimatedCost - b.todayUsage.estimatedCost;
      } else if (sortBy === "month_cost" || sortBy === "month") {
        cmp = a.monthUsage.estimatedCost - b.monthUsage.estimatedCost;
      } else {
        // Default: joined
        cmp = new Date(a.joined).getTime() - new Date(b.joined).getTime();
      }
      return sortOrder === "asc" ? cmp : -cmp;
    });

    const total = allUsers.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;
    const paginatedUsers = allUsers.slice(offset, offset + pageSize);

    return {
      users: paginatedUsers,
      total,
      page,
      pageSize,
      totalPages,
    };
  });

// ============================================================================
// 3. USER AI USAGE DETAILS (DRAWER DATA)
// ============================================================================

export interface UserAiUsageDetailsResult {
  account: {
    name: string;
    email: string;
    plan: PlanBadgeType;
    status: StatusBadgeType;
    billingPeriod: string;
    subscriptionStart: string | null;
    renewalDate: string | null;
    organization: string | null;
    seats: number;
  };
  currentActivity: {
    isRunning: boolean;
    startedAt: string | null;
    elapsedFormatted: string | null;
    apiRequests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
  summary: {
    today: { calls: number; tokens: number; cost: number };
    thisMonth: { calls: number; tokens: number; cost: number };
    thisYear: { calls: number; tokens: number; cost: number };
    lifetime: { calls: number; tokens: number; cost: number };
  };
  providerBreakdown: Array<{
    provider: string;
    model: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number;
  }>;
  history: {
    daily: Array<{
      date: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }>;
    monthly: Array<{
      date: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }>;
    annual: Array<{
      date: string;
      calls: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      estimatedCost: number;
    }>;
  };
}

export const getUserAiUsageDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as any;
    const { supabase, userId: callerId } = ctx;
    await assertSuperAdminOrPlatformAdmin(supabase, callerId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const targetUserId = data.userId;

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0));

    // Parallel fetch: Profile, Subscription, Active Case, Org, All Usage
    const [
      { data: profile },
      { data: subscription },
      { data: activeCases },
      { data: membership },
      { data: allUsage },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, created_at").eq("id", targetUserId).maybeSingle(),
      supabaseAdmin
        .from("subscriptions")
        .select("plan, status, created_at, current_period_start, current_period_end")
        .eq("user_id", targetUserId)
        .maybeSingle(),
      supabaseAdmin
        .from("cases")
        .select("id, status, created_at, updated_at")
        .eq("user_id", targetUserId)
        .in("status", RUNNING_CASE_STATUSES)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1),
      supabaseAdmin
        .from("org_memberships")
        .select("org_id, organizations(id, name)")
        .eq("user_id", targetUserId)
        .eq("status", "active")
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("ai_usage")
        .select("case_id, total_tokens, input_tokens, output_tokens, model, provider_type, latency_ms, estimated_cost_usd, created_at")
        .eq("user_id", targetUserId)
        .order("created_at", { ascending: false }),
    ]);

    // Seats count for organization
    let seatsCount = 1;
    let orgName = "Not available";
    if (membership?.org_id) {
      const { count } = await supabaseAdmin
        .from("org_memberships")
        .select("id", { count: "exact", head: true })
        .eq("org_id", membership.org_id)
        .eq("status", "active")
        .is("deleted_at", null);
      if (count) seatsCount = count;
      orgName = (membership as any)?.organizations?.name || "Not available";
    }

    const isTrialing = subscription?.status === "trialing";
    const planInfo = normalizePlan(subscription?.plan ?? "pro", isTrialing);
    const statusInfo = normalizeStatus(subscription?.status ?? "active");

    const formatLongDate = (d: string | null | undefined): string | null => {
      if (!d) return null;
      try {
        return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(d));
      } catch {
        return null;
      }
    };

    const subStart = formatLongDate(subscription?.current_period_start ?? subscription?.created_at ?? profile?.created_at);
    const renewDate = formatLongDate(subscription?.current_period_end);

    // Active AI Activity
    const isRunning = (activeCases ?? []).length > 0;
    const activeCase = isRunning ? activeCases![0] : null;

    let currentActivity = {
      isRunning: false,
      startedAt: null as string | null,
      elapsedFormatted: null as string | null,
      apiRequests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
    };

    if (isRunning && activeCase) {
      const activeCaseUsage = (allUsage ?? []).filter((u: any) => u.case_id === activeCase.id);
      const caseStartTime = new Date(activeCase.created_at || activeCase.updated_at || now);
      const elapsedMs = Math.max(0, now.getTime() - caseStartTime.getTime());
      const mins = Math.floor(elapsedMs / 60000);
      const secs = Math.floor((elapsedMs % 60000) / 1000);

      let runInp = 0;
      let runOut = 0;
      let runTot = 0;
      let runCost = 0;

      for (const u of activeCaseUsage) {
        const inp = Number(u.input_tokens ?? 0);
        const out = Number(u.output_tokens ?? 0);
        const tot = Number(u.total_tokens ?? inp + out);
        const c =
          u.estimated_cost_usd != null && !isNaN(Number(u.estimated_cost_usd))
            ? Number(u.estimated_cost_usd)
            : calculateEstimatedCost({
                provider: u.provider_type,
                model: u.model,
                inputTokens: inp,
                outputTokens: out,
                totalTokens: tot,
              });
        runInp += inp;
        runOut += out;
        runTot += tot;
        runCost += c;
      }

      currentActivity = {
        isRunning: true,
        startedAt: new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "numeric", hour12: true }).format(caseStartTime),
        elapsedFormatted: `${mins}m ${secs}s`,
        apiRequests: Math.max(activeCaseUsage.length, 1),
        inputTokens: runInp,
        outputTokens: runOut,
        totalTokens: runTot,
        estimatedCost: Number(runCost.toFixed(2)),
      };
    }

    // Summary Totals: Today, This Month, This Year, Lifetime
    const summary = {
      today: { calls: 0, tokens: 0, cost: 0 },
      thisMonth: { calls: 0, tokens: 0, cost: 0 },
      thisYear: { calls: 0, tokens: 0, cost: 0 },
      lifetime: { calls: 0, tokens: 0, cost: 0 },
    };

    // Provider Breakdown for this month
    const providerMap = new Map<string, { requests: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number }>();

    // Usage History: Daily, Monthly, Annual
    const dailyMap = new Map<string, { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number }>();
    const monthlyMap = new Map<string, { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number }>();
    const annualMap = new Map<string, { calls: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: number }>();

    for (const u of allUsage ?? []) {
      const uDate = new Date(u.created_at);
      const time = uDate.getTime();
      const inp = Number(u.input_tokens ?? 0);
      const out = Number(u.output_tokens ?? 0);
      const tot = Number(u.total_tokens ?? inp + out);
      const cost =
        u.estimated_cost_usd != null && !isNaN(Number(u.estimated_cost_usd))
          ? Number(u.estimated_cost_usd)
          : calculateEstimatedCost({
              provider: u.provider_type,
              model: u.model,
              inputTokens: inp,
              outputTokens: out,
              totalTokens: tot,
            });

      // Lifetime
      summary.lifetime.calls += 1;
      summary.lifetime.tokens += tot;
      summary.lifetime.cost += cost;

      // Year
      if (time >= startOfYear.getTime()) {
        summary.thisYear.calls += 1;
        summary.thisYear.tokens += tot;
        summary.thisYear.cost += cost;
      }

      // Month
      if (time >= startOfMonth.getTime()) {
        summary.thisMonth.calls += 1;
        summary.thisMonth.tokens += tot;
        summary.thisMonth.cost += cost;

        // Provider/model breakdown (this month)
        const pName = (u.provider_type || "openai").toLowerCase();
        const displayProvider =
          pName === "groq"
            ? "Groq"
            : pName === "anthropic"
              ? "Anthropic"
              : pName === "gemini"
                ? "Google"
                : pName === "openai"
                  ? "OpenAI"
                  : pName.charAt(0).toUpperCase() + pName.slice(1);
        const mKey = `${displayProvider} / ${u.model || "default"}`;
        const existingP = providerMap.get(mKey) ?? { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
        existingP.requests += 1;
        existingP.inputTokens += inp;
        existingP.outputTokens += out;
        existingP.totalTokens += tot;
        existingP.cost += cost;
        providerMap.set(mKey, existingP);
      }

      // Today
      if (time >= startOfToday.getTime()) {
        summary.today.calls += 1;
        summary.today.tokens += tot;
        summary.today.cost += cost;
      }

      // History aggregation keys
      const dayKey = uDate.toISOString().slice(0, 10); // 'YYYY-MM-DD'
      const monthKey = uDate.toISOString().slice(0, 7); // 'YYYY-MM'
      const yearKey = String(uDate.getUTCFullYear()); // 'YYYY'

      // Daily
      const dAgg = dailyMap.get(dayKey) ?? { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
      dAgg.calls += 1;
      dAgg.inputTokens += inp;
      dAgg.outputTokens += out;
      dAgg.totalTokens += tot;
      dAgg.cost += cost;
      dailyMap.set(dayKey, dAgg);

      // Monthly
      const mAgg = monthlyMap.get(monthKey) ?? { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
      mAgg.calls += 1;
      mAgg.inputTokens += inp;
      mAgg.outputTokens += out;
      mAgg.totalTokens += tot;
      mAgg.cost += cost;
      monthlyMap.set(monthKey, mAgg);

      // Annual
      const yAgg = annualMap.get(yearKey) ?? { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 };
      yAgg.calls += 1;
      yAgg.inputTokens += inp;
      yAgg.outputTokens += out;
      yAgg.totalTokens += tot;
      yAgg.cost += cost;
      annualMap.set(yearKey, yAgg);
    }

    // Convert provider map to sorted list
    const providerBreakdown = Array.from(providerMap.entries())
      .map(([key, val]) => {
        const [provider, model] = key.split(" / ");
        return {
          provider,
          model,
          requests: val.requests,
          inputTokens: val.inputTokens,
          outputTokens: val.outputTokens,
          totalTokens: val.totalTokens,
          estimatedCost: Number(val.cost.toFixed(2)),
        };
      })
      .sort((a, b) => b.estimatedCost - a.estimatedCost);

    // Format daily history (last 14 days)
    const dailyHistory = Array.from(dailyMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 14)
      .map(([dateStr, val]) => {
        const [y, m, d] = dateStr.split("-").map(Number);
        const dateObj = new Date(Date.UTC(y, m - 1, d));
        const formattedDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(dateObj);
        return {
          date: formattedDate,
          calls: val.calls,
          inputTokens: val.inputTokens,
          outputTokens: val.outputTokens,
          totalTokens: val.totalTokens,
          estimatedCost: Number(val.cost.toFixed(2)),
        };
      });

    // Format monthly history (last 12 months)
    const monthlyHistory = Array.from(monthlyMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([monthStr, val]) => {
        const [y, m] = monthStr.split("-").map(Number);
        const dateObj = new Date(Date.UTC(y, m - 1, 1));
        const formattedDate = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(dateObj);
        return {
          date: formattedDate,
          calls: val.calls,
          inputTokens: val.inputTokens,
          outputTokens: val.outputTokens,
          totalTokens: val.totalTokens,
          estimatedCost: Number(val.cost.toFixed(2)),
        };
      });

    // Format annual history
    const annualHistory = Array.from(annualMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([yearStr, val]) => ({
        date: yearStr,
        calls: val.calls,
        inputTokens: val.inputTokens,
        outputTokens: val.outputTokens,
        totalTokens: val.totalTokens,
        estimatedCost: Number(val.cost.toFixed(2)),
      }));

    return {
      account: {
        name: profile?.full_name || "—",
        email: profile?.email || "—",
        plan: planInfo.label,
        status: statusInfo.label,
        billingPeriod: "Monthly",
        subscriptionStart: subStart,
        renewalDate: renewDate,
        organization: orgName,
        seats: seatsCount,
      },
      currentActivity,
      summary: {
        today: { calls: summary.today.calls, tokens: summary.today.tokens, cost: Number(summary.today.cost.toFixed(2)) },
        thisMonth: { calls: summary.thisMonth.calls, tokens: summary.thisMonth.tokens, cost: Number(summary.thisMonth.cost.toFixed(2)) },
        thisYear: { calls: summary.thisYear.calls, tokens: summary.thisYear.tokens, cost: Number(summary.thisYear.cost.toFixed(2)) },
        lifetime: { calls: summary.lifetime.calls, tokens: summary.lifetime.tokens, cost: Number(summary.lifetime.cost.toFixed(2)) },
      },
      providerBreakdown,
      history: {
        daily: dailyHistory,
        monthly: monthlyHistory,
        annual: annualHistory,
      },
    };
  });
