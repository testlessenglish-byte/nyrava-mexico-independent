import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAuthedContext } from "./cases.functions";
import {
  getLegalAnalysisTypes,
  invalidateLegalAnalysisTypesCache,
  type LegalAnalysisTypeConfig,
} from "./legal-analysis-types";
import { MX_CASE_TYPES, type MexicanCaseType } from "./jurisdiction/mexico-types";

// Public/subscriber endpoint to list available analysis types
export const listLegalAnalysisTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = await getAuthedContext(context, "List legal analysis types");
    return getLegalAnalysisTypes(supabase);
  });

// Admin-only toggle endpoint for super_admin and platform_admin
export const toggleLegalAnalysisType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        materia: z.enum(MX_CASE_TYPES),
        enabled: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = await getAuthedContext(context, "Toggle legal analysis type");

    // RBAC check: only super_admin or platform_admin can change availability
    const { data: userRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (rolesError) {
      throw new Error(`Failed to verify permissions: ${rolesError.message}`);
    }

    const roles = (userRoles ?? []).map((r) => r.role);
    const hasAdminAccess = roles.includes("super_admin") || roles.includes("platform_admin");

    if (!hasAdminAccess) {
      throw new Error(
        "Acceso denegado: solo super_admin o platform_admin pueden cambiar la disponibilidad de materias.",
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { materia, enabled } = data;
    const nowIso = new Date().toISOString();

    // 1. Fetch previous state for audit logging
    const currentConfigs = await getLegalAnalysisTypes(supabaseAdmin);
    const prevConfig = currentConfigs.find((c) => c.code === materia);
    const previousState = prevConfig ? prevConfig.enabled : false;

    // 2. Update legal_analysis_types table if it exists
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any)
        .from("legal_analysis_types")
        .update({
          enabled,
          updated_at: nowIso,
          updated_by: userId,
        })
        .eq("code", materia);
    } catch {
      // Ignore if table not yet created
    }

    // 3. Update feature_flags table (guaranteed live backend sync)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any)
        .from("feature_flags")
        .upsert({
          key: `legal_analysis_type:${materia}`,
          enabled,
          description: prevConfig?.name_es ?? materia,
          updated_at: nowIso,
        });
    } catch (err) {
      console.warn("[toggleLegalAnalysisType] Failed to upsert feature flag", err);
    }

    // 4. Audit trail logging
    const auditMeta = {
      materia,
      previous_state: previousState,
      new_state: enabled,
      admin_user: userId,
      timestamp: nowIso,
    };

    // 4a. Write to legal_analysis_type_audit table if present
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin as any).from("legal_analysis_type_audit").insert({
        materia_code: materia,
        previous_enabled: previousState,
        new_enabled: enabled,
        admin_user_id: userId,
        created_at: nowIso,
        metadata: auditMeta,
      });
    } catch {
      // Table may not exist yet
    }

    // 4b. Write to platform admin_audit_log (visible in admin dashboard)
    try {
      const { logAudit } = await import("./audit.server");
      await logAudit({
        actorId: userId,
        action: "legal_analysis_type_toggled",
        target: materia,
        meta: auditMeta,
      });
    } catch (err) {
      console.warn("[toggleLegalAnalysisType] Failed to log admin audit", err);
    }

    // 5. Invalidate memory cache
    invalidateLegalAnalysisTypesCache();

    return {
      ok: true,
      materia,
      enabled,
      previousState,
      updatedAt: nowIso,
    };
  });

// Admin-only audit history endpoint
export const getLegalAnalysisTypeAuditHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = await getAuthedContext(context, "Get legal analysis audit history");

    // RBAC check
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const roles = (userRoles ?? []).map((r) => r.role);
    if (!roles.includes("super_admin") && !roles.includes("platform_admin")) {
      throw new Error("Acceso denegado.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Try legal_analysis_type_audit first
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabaseAdmin as any)
        .from("legal_analysis_type_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data && data.length > 0) {
        return data;
      }
    } catch {
      // Fallback to admin_audit_log
    }

    // Fallback: query admin_audit_log for legal_analysis_type_toggled
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabaseAdmin as any)
        .from("admin_audit_log")
        .select("id,action,actor_id,target,meta,created_at")
        .eq("action", "legal_analysis_type_toggled")
        .order("created_at", { ascending: false })
        .limit(50);

      return (data ?? []).map((row: any) => ({
        id: row.id,
        materia_code: row.target ?? row.meta?.materia,
        previous_enabled: Boolean(row.meta?.previous_state),
        new_enabled: Boolean(row.meta?.new_state),
        admin_user_id: row.actor_id,
        created_at: row.created_at,
        metadata: row.meta ?? {},
      }));
    } catch {
      return [];
    }
  });
