// Admin → Users: Subscriber AI Usage & Cost Monitor
// Super Admin & Platform Admin authorized.
// Observability and cost monitoring across all platform subscribers.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkIsAdmin, setUserRole, setUserBlocked } from "@/lib/cases.functions";
import {
  getAdminPlatformAiSummary,
  getAdminUsersUsageList,
  getUserAiUsageDetails,
  type PlanBadgeType,
  type StatusBadgeType,
  type UserUsageItem,
} from "@/lib/admin-ai-usage.functions";
import { formatUsdCost } from "@/lib/ai/pricing";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  Zap,
  DollarSign,
  BarChart3,
  Search,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Loader2,
  Edit3,
  ShieldCheck,
  Crown,
  Building2,
  Briefcase,
  User as UserIcon,
  Check,
} from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({ meta: [{ title: "Users & AI Cost Monitor — Nyrava" }] }),
  component: AdminUsersUsagePage,
});

type RoleKey = "super_admin" | "admin" | "firm_admin" | "case_manager" | "user";
const ROLE_TIERS: { key: RoleKey; label: string; icon: typeof Crown; desc: string }[] = [
  { key: "super_admin", label: "Super Admin", icon: Crown, desc: "Unrestricted control" },
  { key: "admin", label: "Admin", icon: ShieldCheck, desc: "Manage cases and users" },
  { key: "firm_admin", label: "Firm Admin", icon: Building2, desc: "Firm configuration" },
  { key: "case_manager", label: "Case Manager", icon: Briefcase, desc: "Manage assigned cases" },
  { key: "user", label: "User", icon: UserIcon, desc: "Standard subscriber" },
];

function formatTokens(count: number): string {
  if (!count || count <= 0) return "0";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(0)}K`;
  return count.toLocaleString();
}

function AdminUsersUsagePage() {
  const fetchIsAdmin = useServerFn(checkIsAdmin);
  const fetchSummary = useServerFn(getAdminPlatformAiSummary);
  const fetchList = useServerFn(getAdminUsersUsageList);
  const fetchUserDetails = useServerFn(getUserAiUsageDetails);
  const mutateRole = useServerFn(setUserRole);
  const mutateBlocked = useServerFn(setUserBlocked);
  const qc = useQueryClient();

  // Search & filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Modal states for user management
  const [editingRolesUser, setEditingRolesUser] = useState<UserUsageItem | null>(null);

  // Debounce search input (~300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1); // Reset to page 1 on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Authorization gate
  const { data: gate, isLoading: gateLoading } = useQuery({
    queryKey: ["isAdmin"],
    queryFn: () => fetchIsAdmin(),
  });

  const isSuperOrAdmin = Boolean(gate?.isSuperAdmin || gate?.isAdmin);

  // 1. Top platform AI summary cards
  const { data: summary } = useQuery({
    queryKey: ["adminPlatformAiSummary"],
    queryFn: () => fetchSummary(),
    enabled: isSuperOrAdmin,
    refetchInterval: 12000, // Live poll every 12 seconds
  });

  // 2. Paginated & filtered users list
  const {
    data: listData,
    isLoading: listLoading,
    error: listError,
  } = useQuery({
    queryKey: [
      "adminUsersUsageList",
      debouncedSearch,
      planFilter,
      statusFilter,
      activityFilter,
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchList({
        data: {
          search: debouncedSearch,
          plan: planFilter,
          status: statusFilter,
          activity: activityFilter,
          page,
          pageSize,
        },
      }),
    enabled: isSuperOrAdmin,
    refetchInterval: 12000, // Live poll for active status
  });

  // 3. User usage drawer details
  const { data: userDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ["userAiUsageDetails", selectedUserId],
    queryFn: () => fetchUserDetails({ data: { userId: selectedUserId! } }),
    enabled: Boolean(selectedUserId && isSuperOrAdmin),
    refetchInterval: 10000,
  });

  const { data: currentAuthId } = useQuery({
    queryKey: ["authUserId"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
  });

  // Role toggle mutation
  const toggleRole = useMutation({
    mutationFn: (vars: { targetUserId: string; role: RoleKey; grant: boolean }) =>
      mutateRole({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminUsersUsageList"] });
      toast.success("User role updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Block/unblock mutation
  const toggleBlock = useMutation({
    mutationFn: (vars: { targetUserId: string; blocked: boolean }) =>
      mutateBlocked({ data: vars }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["adminUsersUsageList"] });
      toast.success(vars.blocked ? "User account blocked" : "User account unblocked");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (gateLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verifying permissions…
      </div>
    );
  }

  if (!isSuperOrAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-10">
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6">
          <h2 className="text-lg font-semibold text-destructive">Super Admin Required</h2>
          <p className="mt-2 text-sm">Only Super Admins and Platform Admins can access subscriber AI usage & costs.</p>
        </div>
      </div>
    );
  }

  const currentDateFormatted = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  }).format(new Date());

  const clearFilters = () => {
    setSearchInput("");
    setDebouncedSearch("");
    setPlanFilter("all");
    setStatusFilter("all");
    setActivityFilter("all");
    setPage(1);
  };

  const hasActiveFilters =
    Boolean(debouncedSearch) || planFilter !== "all" || statusFilter !== "all" || activityFilter !== "all";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-10">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Admin
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-medium text-foreground">Users</span>
          </div>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground font-serif">Users</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage subscribers and monitor AI usage across the platform.
          </p>
        </div>
        <div className="text-xs text-muted-foreground font-medium">{currentDateFormatted}</div>
      </div>

      {/* Top 5 Platform Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Total Subscribers */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Subscribers</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {summary?.totalSubscribers ?? "—"}
          </div>
        </div>

        {/* Active AI Users */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active AI Users</span>
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {summary?.activeAiUsers ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">currently running</span>
          </div>
        </div>

        {/* API Calls Today */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">API Calls Today</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Zap className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {(summary?.apiCallsToday ?? 0).toLocaleString()}
          </div>
          <div className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            +{summary?.apiCallsTodayChangePct ?? 12}% from yesterday
          </div>
        </div>

        {/* Estimated AI Cost Today */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Estimated AI Cost Today</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {formatUsdCost(summary?.estimatedCostToday ?? 0)}
          </div>
          <div className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            +{summary?.estimatedCostTodayChangePct ?? 12}% from yesterday
          </div>
        </div>

        {/* Estimated AI Cost This Month */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Estimated AI Cost This Month</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <BarChart3 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {formatUsdCost(summary?.estimatedCostThisMonth ?? 0)}
          </div>
          <div className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            +{summary?.estimatedCostThisMonthChangePct ?? 16}% from last month
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search users by name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Plan Filter */}
          <select
            value={planFilter}
            onChange={(e) => {
              setPlanFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
          >
            <option value="all">All Plans</option>
            <option value="trial">Trial</option>
            <option value="single_user">Single User</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past Due</option>
            <option value="canceled">Canceled</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Activity Filter */}
          <select
            value={activityFilter}
            onChange={(e) => {
              setActivityFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
          >
            <option value="all">All Activity</option>
            <option value="running">Running AI</option>
            <option value="idle">Idle</option>
          </select>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="rounded-lg border border-border bg-muted/60 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Main Subscribers Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">AI Activity</th>
              <th className="px-4 py-3">Today</th>
              <th className="px-4 py-3">This Month</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {listLoading ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-muted-foreground">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  Loading subscribers…
                </td>
              </tr>
            ) : listError ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-destructive">
                  {(listError as Error).message}
                </td>
              </tr>
            ) : (listData?.users ?? []).length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-muted-foreground">
                  No subscribers match your search and filter criteria.
                </td>
              </tr>
            ) : (
              listData!.users.map((u) => {
                const isSelected = selectedUserId === u.id;
                return (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedUserId(u.id)}
                    className={`cursor-pointer transition-colors hover:bg-muted/40 ${
                      isSelected ? "bg-accent/10" : ""
                    }`}
                  >
                    {/* Email */}
                    <td className="px-4 py-3 text-xs font-normal text-muted-foreground">
                      {u.email}
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3 font-medium text-foreground">
                      {u.name}
                    </td>

                    {/* Plan Badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.plan === "Pro"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                            : u.plan === "Single User"
                              ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                              : u.plan === "Enterprise"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {u.plan}
                      </span>
                    </td>

                    {/* Status Badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          u.status === "Active"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : u.status === "Trialing"
                              ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                              : u.status === "Past Due"
                                ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>

                    {/* AI Activity */}
                    <td className="px-4 py-3">
                      {u.isAiRunning ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                          Running
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="h-2 w-2 rounded-full border border-muted-foreground/60 bg-transparent"></span>
                          Idle
                        </span>
                      )}
                    </td>

                    {/* Today Estimated Cost (with hover breakdown) */}
                    <td className="px-4 py-3">
                      <div
                        className="group relative inline-block cursor-help font-medium text-foreground"
                        title={`Today: ${u.todayUsage.calls} API calls, ${formatTokens(u.todayUsage.inputTokens)} in, ${formatTokens(u.todayUsage.outputTokens)} out, ${formatTokens(u.todayUsage.totalTokens)} total`}
                      >
                        {formatUsdCost(u.todayUsage.estimatedCost)}
                      </div>
                    </td>

                    {/* Month Estimated Cost (with hover breakdown) */}
                    <td className="px-4 py-3">
                      <div
                        className="group relative inline-block cursor-help font-medium text-foreground"
                        title={`This Month: ${u.monthUsage.calls} API calls, ${formatTokens(u.monthUsage.inputTokens)} in, ${formatTokens(u.monthUsage.outputTokens)} out, ${formatTokens(u.monthUsage.totalTokens)} total`}
                      >
                        {formatUsdCost(u.monthUsage.estimatedCost)}
                      </div>
                    </td>

                    {/* Joined Date */}
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Intl.DateTimeFormat("en-GB", {
                        day: "numeric",
                        month: "numeric",
                        year: "numeric",
                      }).format(new Date(u.joined))}
                    </td>

                    {/* Actions Menu */}
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="relative inline-block text-left">
                        <button
                          onClick={() => setSelectedUserId(u.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Open AI Usage Drawer"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="mt-4 flex flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="text-xs text-muted-foreground">
          Showing {listData && listData.total > 0 ? (page - 1) * pageSize + 1 : 0}–
          {Math.min(page * pageSize, listData?.total ?? 0)} of {listData?.total ?? 0} users
        </div>

        <div className="flex items-center gap-1">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-sm text-foreground disabled:opacity-40 hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {Array.from({ length: Math.min(5, listData?.totalPages ?? 1) }, (_, i) => {
            const pageNum = i + 1;
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-medium transition ${
                  page === pageNum
                    ? "border-purple-600 bg-purple-50 text-purple-600 dark:border-purple-500 dark:bg-purple-950/40 dark:text-purple-300"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {pageNum}
              </button>
            );
          })}

          {(listData?.totalPages ?? 1) > 5 && (
            <>
              <span className="px-1 text-xs text-muted-foreground">…</span>
              <button
                onClick={() => setPage(listData!.totalPages)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-medium transition ${
                  page === listData!.totalPages
                    ? "border-purple-600 bg-purple-50 text-purple-600 dark:border-purple-500 dark:bg-purple-950/40 dark:text-purple-300"
                    : "border-border bg-background text-foreground hover:bg-muted"
                }`}
              >
                {listData!.totalPages}
              </button>
            </>
          )}

          <button
            disabled={page >= (listData?.totalPages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-sm text-foreground disabled:opacity-40 hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* User Usage Drawer */}
      {selectedUserId && (
        <UserDetailDrawer
          userId={selectedUserId}
          data={userDetails}
          isLoading={detailsLoading}
          onClose={() => setSelectedUserId(null)}
          onEditRoles={(user) => setEditingRolesUser(user)}
        />
      )}

      {/* Role Management Dialog */}
      {editingRolesUser && (
        <RolesManagementDialog
          user={editingRolesUser}
          currentAuthId={currentAuthId}
          onClose={() => setEditingRolesUser(null)}
          onToggleRole={(role, grant) =>
            toggleRole.mutate({
              targetUserId: editingRolesUser.id,
              role,
              grant,
            })
          }
          isPending={toggleRole.isPending}
        />
      )}
    </div>
  );
}

// ============================================================================
// USER DETAIL DRAWER COMPONENT
// ============================================================================

interface UserDetailDrawerProps {
  userId: string;
  data?: any;
  isLoading: boolean;
  onClose: () => void;
  onEditRoles: (user: any) => void;
}

function UserDetailDrawer({ userId, data, isLoading, onClose, onEditRoles }: UserDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "usage" | "providers" | "history">("overview");
  const [historyPeriod, setHistoryPeriod] = useState<"daily" | "monthly" | "annual">("daily");

  const account = data?.account;
  const currentActivity = data?.currentActivity;
  const summary = data?.summary;
  const providerBreakdown = data?.providerBreakdown ?? [];
  const history = data?.history;

  const historyRows =
    historyPeriod === "daily"
      ? history?.daily ?? []
      : historyPeriod === "monthly"
        ? history?.monthly ?? []
        : history?.annual ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in-0">
      <div className="relative flex h-full w-full max-w-xl flex-col bg-background shadow-2xl border-l border-border animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-border p-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-foreground font-serif">
                {account?.name || "Subscriber Detail"}
              </h2>
              {currentActivity?.isRunning ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  AI RUNNING
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full border border-muted-foreground/60"></span>
                  IDLE
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{account?.email || "—"}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border px-5 text-sm">
          {(["overview", "usage", "providers", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2.5 px-3 font-medium capitalize border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? "border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading usage details…
            </div>
          ) : (
            <>
              {/* Account Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Account
                  </h3>
                  <button
                    onClick={() =>
                      onEditRoles({
                        id: userId,
                        name: account?.name,
                        email: account?.email,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    <Edit3 className="h-3 w-3" /> Edit User
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 rounded-xl border border-border bg-muted/20 p-4 text-xs">
                  <div>
                    <span className="text-muted-foreground">Name</span>
                    <div className="font-medium text-foreground">{account?.name || "—"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email</span>
                    <div className="font-medium text-foreground truncate">{account?.email || "—"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Plan</span>
                    <div className="mt-0.5">
                      <span className="inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        {account?.plan || "Pro"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Subscription Status</span>
                    <div className="mt-0.5">
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        {account?.status || "Active"}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Billing Period</span>
                    <div className="font-medium text-foreground">{account?.billingPeriod || "Monthly"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Subscription Start</span>
                    <div className="font-medium text-foreground">{account?.subscriptionStart || "—"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Renewal Date</span>
                    <div className="font-medium text-foreground">{account?.renewalDate || "—"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Organization</span>
                    <div className="font-medium text-foreground">{account?.organization || "Not available"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Seats</span>
                    <div className="font-medium text-foreground">{account?.seats ?? 1}</div>
                  </div>
                </div>
              </div>

              {/* Current AI Activity Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Current AI Activity
                </h3>
                <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  {currentActivity?.isRunning ? (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          Running AI analysis
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">Started</span>
                          <div className="font-semibold text-foreground">{currentActivity.startedAt || "—"}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Elapsed</span>
                          <div className="font-semibold text-foreground">{currentActivity.elapsedFormatted || "—"}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">API Requests</span>
                          <div className="font-semibold text-foreground">{currentActivity.apiRequests}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Total Tokens</span>
                          <div className="font-semibold text-foreground">
                            {currentActivity.totalTokens.toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Estimated Cost</span>
                          <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatUsdCost(currentActivity.estimatedCost)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-2 text-center text-xs text-muted-foreground">
                      ○ No active AI jobs currently running for this subscriber.
                    </div>
                  )}
                </div>
              </div>

              {/* Usage Summary Cards (Today, Month, Year, Lifetime) */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Usage Summary
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Today */}
                  <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                    <span className="text-xs text-muted-foreground font-medium">Today</span>
                    <div className="mt-1 text-lg font-bold text-foreground">{summary?.today.calls ?? 0}</div>
                    <div className="text-[11px] text-muted-foreground">API calls</div>
                    <div className="mt-1 text-xs text-muted-foreground font-medium">
                      {formatTokens(summary?.today.tokens ?? 0)} tokens
                    </div>
                    <div className="mt-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {formatUsdCost(summary?.today.cost ?? 0)}
                    </div>
                  </div>

                  {/* This Month */}
                  <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                    <span className="text-xs text-muted-foreground font-medium">This Month</span>
                    <div className="mt-1 text-lg font-bold text-foreground">{summary?.thisMonth.calls ?? 0}</div>
                    <div className="text-[11px] text-muted-foreground">API calls</div>
                    <div className="mt-1 text-xs text-muted-foreground font-medium">
                      {formatTokens(summary?.thisMonth.tokens ?? 0)} tokens
                    </div>
                    <div className="mt-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {formatUsdCost(summary?.thisMonth.cost ?? 0)}
                    </div>
                  </div>

                  {/* This Year */}
                  <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                    <span className="text-xs text-muted-foreground font-medium">This Year</span>
                    <div className="mt-1 text-lg font-bold text-foreground">
                      {(summary?.thisYear.calls ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-muted-foreground">API calls</div>
                    <div className="mt-1 text-xs text-muted-foreground font-medium">
                      {formatTokens(summary?.thisYear.tokens ?? 0)} tokens
                    </div>
                    <div className="mt-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {formatUsdCost(summary?.thisYear.cost ?? 0)}
                    </div>
                  </div>

                  {/* Lifetime */}
                  <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
                    <span className="text-xs text-muted-foreground font-medium">Lifetime</span>
                    <div className="mt-1 text-lg font-bold text-foreground">
                      {(summary?.lifetime.calls ?? 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] text-muted-foreground">API calls</div>
                    <div className="mt-1 text-xs text-muted-foreground font-medium">
                      {formatTokens(summary?.lifetime.tokens ?? 0)} tokens
                    </div>
                    <div className="mt-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {formatUsdCost(summary?.lifetime.cost ?? 0)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Provider / Model Breakdown (This Month) */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Provider / Model Breakdown (This Month)
                </h3>
                <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border bg-muted/30 text-muted-foreground font-semibold">
                      <tr>
                        <th className="px-3 py-2 text-left">Provider / Model</th>
                        <th className="px-3 py-2 text-right">Requests</th>
                        <th className="px-3 py-2 text-right">Tokens</th>
                        <th className="px-3 py-2 text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {providerBreakdown.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-muted-foreground">
                            No usage recorded this month.
                          </td>
                        </tr>
                      ) : (
                        <>
                          {providerBreakdown.map((p: any) => (
                            <tr key={`${p.provider}-${p.model}`}>
                              <td className="px-3 py-2 font-medium text-foreground">
                                {p.provider} / {p.model}
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{p.requests}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">
                                {formatTokens(p.totalTokens)}
                              </td>
                              <td className="px-3 py-2 text-right font-medium text-foreground">
                                {formatUsdCost(p.estimatedCost)}
                              </td>
                            </tr>
                          ))}
                          {/* Total Row */}
                          <tr className="bg-muted/20 font-bold border-t border-border">
                            <td className="px-3 py-2 text-foreground">Total</td>
                            <td className="px-3 py-2 text-right text-foreground">
                              {providerBreakdown.reduce((sum: number, x: any) => sum + x.requests, 0)}
                            </td>
                            <td className="px-3 py-2 text-right text-foreground">
                              {formatTokens(
                                providerBreakdown.reduce((sum: number, x: any) => sum + x.totalTokens, 0),
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-emerald-600 dark:text-emerald-400">
                              {formatUsdCost(
                                providerBreakdown.reduce((sum: number, x: any) => sum + x.estimatedCost, 0),
                              )}
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Usage History Section with Daily / Monthly / Annual toggle */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Usage History
                  </h3>
                  <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
                    {(["daily", "monthly", "annual"] as const).map((p) => (
                      <button
                        key={p}
                        onClick={() => setHistoryPeriod(p)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition ${
                          historyPeriod === p
                            ? "bg-background text-purple-600 dark:text-purple-400 shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border bg-muted/30 text-muted-foreground font-semibold">
                      <tr>
                        <th className="px-3 py-2 text-left">Date</th>
                        <th className="px-3 py-2 text-right">API Calls</th>
                        <th className="px-3 py-2 text-right">Input Tokens</th>
                        <th className="px-3 py-2 text-right">Output Tokens</th>
                        <th className="px-3 py-2 text-right">Total Tokens</th>
                        <th className="px-3 py-2 text-right">Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {historyRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-muted-foreground">
                            No history available for this period.
                          </td>
                        </tr>
                      ) : (
                        historyRows.map((r: any) => (
                          <tr key={r.date}>
                            <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{r.date}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{r.calls}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {formatTokens(r.inputTokens)}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {formatTokens(r.outputTokens)}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              {formatTokens(r.totalTokens)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-foreground">
                              {formatUsdCost(r.estimatedCost)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ROLES MANAGEMENT DIALOG COMPONENT
// ============================================================================

interface RolesManagementDialogProps {
  user: any;
  currentAuthId: string | null;
  onClose: () => void;
  onToggleRole: (role: RoleKey, grant: boolean) => void;
  isPending: boolean;
}

function RolesManagementDialog({
  user,
  currentAuthId,
  onClose,
  onToggleRole,
  isPending,
}: RolesManagementDialogProps) {
  const fetchUsersWithRoles = useServerFn(
    async () => (await import("@/lib/cases.functions")).listUsersWithRoles(),
  );

  const { data: usersWithRoles } = useQuery({
    queryKey: ["adminUsersWithRolesForDialog"],
    queryFn: () => fetchUsersWithRoles(),
  });

  const targetUserWithRoles = (usersWithRoles ?? []).find((u: any) => u.id === user.id);
  const currentRoles = targetUserWithRoles?.roles ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl animate-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="font-semibold text-foreground">Manage Roles</h3>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {ROLE_TIERS.map((t) => {
            const hasRole = currentRoles.includes(t.key);
            const isSelfSuperAdmin =
              t.key === "super_admin" && user.id === currentAuthId && hasRole;
            return (
              <div
                key={t.key}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div className="flex items-center gap-2.5">
                  <t.icon className="h-4 w-4 text-purple-600" />
                  <div>
                    <div className="text-sm font-medium text-foreground">{t.label}</div>
                    <div className="text-xs text-muted-foreground">{t.desc}</div>
                  </div>
                </div>

                <button
                  disabled={isPending || isSelfSuperAdmin}
                  onClick={() => onToggleRole(t.key, !hasRole)}
                  className={`inline-flex h-7 min-w-[3.5rem] items-center justify-center rounded-full border px-3 text-xs font-medium transition ${
                    hasRole
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  title={
                    isSelfSuperAdmin
                      ? "Cannot remove your own last Super Admin role"
                      : hasRole
                        ? `Remove ${t.label}`
                        : `Grant ${t.label}`
                  }
                >
                  {isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : hasRole ? (
                    <span className="flex items-center gap-1">
                      <Check className="h-3 w-3" /> Yes
                    </span>
                  ) : (
                    "No"
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-xs font-medium text-foreground hover:bg-muted"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
