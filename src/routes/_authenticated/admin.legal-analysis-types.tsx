import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listLegalAnalysisTypes,
  toggleLegalAnalysisType,
  getLegalAnalysisTypeAuditHistory,
} from "@/lib/legal-analysis-types.functions";
import { useRoles } from "@/hooks/use-roles";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Scale, CheckCircle2, Clock, ShieldAlert, History } from "lucide-react";
import type { MexicanCaseType } from "@/lib/jurisdiction/mexico-types";
import type { LegalAnalysisTypeConfig } from "@/lib/legal-analysis-types";

export const Route = createFileRoute("/_authenticated/admin/legal-analysis-types")({
  head: () => ({ meta: [{ title: "Tipos de Análisis Jurídico · Admin · Nyrava" }] }),
  component: AdminLegalAnalysisTypesPage,
});

function AdminLegalAnalysisTypesPage() {
  const { isSuperAdmin, loading: rolesLoading } = useRoles();
  const queryClient = useQueryClient();

  const fetchTypes = useServerFn(listLegalAnalysisTypes);
  const toggleType = useServerFn(toggleLegalAnalysisType);
  const fetchAudit = useServerFn(getLegalAnalysisTypeAuditHistory);

  const { data: types, isLoading: typesLoading } = useQuery({
    queryKey: ["adminLegalAnalysisTypes"],
    queryFn: () => fetchTypes(),
  });

  const { data: auditHistory } = useQuery({
    queryKey: ["adminLegalAnalysisAudit"],
    queryFn: () => fetchAudit(),
    enabled: isSuperAdmin,
  });

  const [pendingDisable, setPendingDisable] = useState<LegalAnalysisTypeConfig | null>(null);

  const mutation = useMutation({
    mutationFn: (vars: { materia: MexicanCaseType; enabled: boolean }) =>
      toggleType({ data: vars }),
    onSuccess: (res) => {
      toast.success(
        res.enabled
          ? `Materia ${res.materia} activada (Disponible).`
          : `Materia ${res.materia} desactivada (Próximamente).`,
      );
      queryClient.invalidateQueries({ queryKey: ["adminLegalAnalysisTypes"] });
      queryClient.invalidateQueries({ queryKey: ["adminLegalAnalysisAudit"] });
      queryClient.invalidateQueries({ queryKey: ["legalAnalysisTypes"] });
      setPendingDisable(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Error al actualizar la materia.");
      setPendingDisable(null);
    },
  });

  if (rolesLoading || typesLoading) {
    return <div className="p-10 text-muted-foreground">Cargando tipos de análisis jurídico…</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-2xl p-10">
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 flex items-start gap-3">
          <ShieldAlert className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-destructive">Acceso restringido</h2>
            <p className="mt-1 text-sm text-destructive/90">
              Solo usuarios con rol de <strong>super_admin</strong> o <strong>platform_admin</strong> pueden modificar la disponibilidad de materias jurídicas.
            </p>
            <div className="mt-4">
              <Link
                to="/admin"
                className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                ← Volver a consola admin
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const items = types ?? [];
  const activeCount = items.filter((i) => i.enabled).length;

  const handleToggle = (item: LegalAnalysisTypeConfig, nextVal: boolean) => {
    if (!nextVal) {
      // Disabling requires confirmation dialog
      setPendingDisable(item);
    } else {
      mutation.mutate({ materia: item.code, enabled: true });
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Scale className="mt-1 h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold font-display sm:text-3xl">Tipos de Análisis Jurídico</h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
              Controla qué materias jurídicas están disponibles para nuevos análisis de suscriptores en Nyrava México.
              Desactivar una materia no elimina expedientes ni informes existentes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            className="rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            ← Admin
          </Link>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-card p-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">Estado de plataforma:</span>
          <span className="text-muted-foreground">
            {activeCount} de {items.length} materias disponibles
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          Configuración inicial de lanzamiento activa
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <div
            key={item.code}
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border p-4 transition-colors ${
              item.enabled
                ? "border-primary/30 bg-primary/[0.02]"
                : "border-border bg-card opacity-90"
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-base text-foreground">{item.name_es}</span>
                <span className="text-xs text-muted-foreground font-mono">({item.code})</span>
                {item.enabled ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Disponible
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                    <Clock className="h-3.5 w-3.5" /> Próximamente
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.name_en}</p>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
              <span className="text-xs font-medium text-muted-foreground">
                {item.enabled ? "ON" : "OFF"}
              </span>
              <Switch
                checked={item.enabled}
                onCheckedChange={(nextVal) => handleToggle(item, nextVal)}
                disabled={mutation.isPending}
                aria-label={`Toggle ${item.name_es}`}
              />
            </div>
          </div>
        ))}
      </div>

      {auditHistory && auditHistory.length > 0 && (
        <section className="mt-12">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <History className="h-4 w-4" />
            <h2>Registro de Cambios (Audit Trail)</h2>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/40 border-b border-border text-left uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Fecha</th>
                  <th className="px-4 py-2 font-medium">Materia</th>
                  <th className="px-4 py-2 font-medium">Estado previo</th>
                  <th className="px-4 py-2 font-medium">Nuevo estado</th>
                  <th className="px-4 py-2 font-medium">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditHistory.slice(0, 10).map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-medium">{a.materia_code}</td>
                    <td className="px-4 py-2">
                      {a.previous_enabled ? "Disponible (ON)" : "Próximamente (OFF)"}
                    </td>
                    <td className="px-4 py-2 font-semibold">
                      {a.new_enabled ? (
                        <span className="text-emerald-500">Disponible (ON)</span>
                      ) : (
                        <span className="text-amber-500">Próximamente (OFF)</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-muted-foreground">
                      {a.admin_user_id ? `${a.admin_user_id.slice(0, 8)}…` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Confirmation Dialog before disabling a materia */}
      <AlertDialog
        open={pendingDisable !== null}
        onOpenChange={(open) => !open && setPendingDisable(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Desactivar {pendingDisable?.name_es}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Los usuarios no podrán iniciar nuevos análisis de esta materia. Los expedientes existentes no serán afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDisable) {
                  mutation.mutate({ materia: pendingDisable.code, enabled: false });
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar desactivación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
