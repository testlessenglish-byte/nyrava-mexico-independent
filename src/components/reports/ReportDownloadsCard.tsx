import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FileDown,
  FileJson,
  RotateCw,
  HelpCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useRoles } from "@/hooks/use-roles";
import { rerunSingleAgent } from "@/lib/agents/multi-agent.functions";
import {
  mapInternalToSubscriberStatus,
  type ReportStatusInput,
} from "./subscriber-status-mapper";

export interface ReportDownloadsCardProps {
  caseId: string;
  caseName?: string;
  hasReport: boolean;
  isBlocked?: boolean;
  qualityBlockReasons?: string[];
  qualityGate?: {
    score?: number;
    passed?: boolean;
    critical_issues?: string[];
  } | null;
  releaseDecision?: string | null;
  releaseWarnings?: string[] | null;
  contractError?: string | null;
  executionId?: string | null;
  pipelineStage?: string | null;
  busy?: boolean;
  rawError?: string | null;
  onDownloadPdf: () => Promise<void> | void;
  onDownloadJson?: () => Promise<void> | void;
  onRetry?: () => Promise<void> | void;
  className?: string;
}

export function ReportDownloadsCard({
  caseId,
  caseName,
  hasReport,
  isBlocked = false,
  qualityBlockReasons = [],
  qualityGate,
  releaseDecision,
  releaseWarnings = [],
  contractError,
  executionId,
  pipelineStage,
  busy = false,
  rawError,
  onDownloadPdf,
  onDownloadJson,
  onRetry,
  className = "",
}: ReportDownloadsCardProps) {
  const { t } = useI18n();
  const { isAdmin, isSuperAdmin, roles } = useRoles();
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingJson, setDownloadingJson] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  // Privileged check: super_admin, platform_admin, admin, or support
  const isPrivileged =
    isAdmin ||
    isSuperAdmin ||
    roles.some((r) =>
      ["admin", "super_admin", "platform_admin", "support"].includes(r as string),
    );

  const statusInput: ReportStatusInput = {
    hasReport,
    isBlocked,
    qualityBlockReasons,
    releaseDecision,
    releaseWarnings,
    contractError,
    errorMessage: rawError,
  };

  const subscriberStatus = mapInternalToSubscriberStatus(statusInput);

  // Retry mutation
  const retryAgent = useServerFn(rerunSingleAgent);
  const qc = useQueryClient();
  const retryMutation = useMutation({
    mutationFn: async () => {
      if (onRetry) {
        await onRetry();
        return;
      }
      return retryAgent({ data: { caseId, agentKey: "report" } });
    },
    onSuccess: () => {
      void qc.invalidateQueries();
      toast.success(t("recovery.queued", "Reanálisis puesto en cola"));
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : t("recovery.failed", "Error al reintentar"),
      );
    },
  });

  const handleDownloadPdf = async () => {
    if (!subscriberStatus.canDownloadPdf || downloadingPdf) return;
    setDownloadingPdf(true);
    try {
      await onDownloadPdf();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("reports.export.failed", "Error al exportar PDF"),
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadJson = async () => {
    if (!isPrivileged || !onDownloadJson || downloadingJson) return;
    setDownloadingJson(true);
    try {
      await onDownloadJson();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("reports.export.failed", "Error al exportar JSON"),
      );
    } finally {
      setDownloadingJson(false);
    }
  };

  const isRetrying = busy || retryMutation.isPending;

  return (
    <div
      data-testid="report-downloads-card"
      className={`rounded-xl border border-border bg-card p-4 space-y-3 ${className}`}
    >
      {/* Title */}
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {subscriberStatus.title}
      </h2>

      {/* 1. SUBSCRIBER VIEW: PASSED / READY */}
      {subscriberStatus.type === "ready" && subscriberStatus.canDownloadPdf && (
        <div className="space-y-2">
          <Button
            data-testid="download-pdf-button"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2"
            disabled={downloadingPdf}
            onClick={handleDownloadPdf}
          >
            <FileDown className="h-4 w-4" />
            <span>
              {downloadingPdf
                ? t("common.downloading", "Descargando...")
                : (subscriberStatus.downloadButtonLabel || t("caseWorkspace.downloadFinalReport", "Descargar informe final"))}
            </span>
          </Button>
        </div>
      )}

      {/* 2. SUBSCRIBER VIEW: IN REVIEW OR RETRY NEEDED */}
      {(subscriberStatus.type === "in_review" || subscriberStatus.type === "retry_needed") && (
        <div
          data-testid="subscriber-review-panel"
          className="rounded-lg border border-[#C5A880]/40 bg-[#FAF4EB]/80 dark:bg-[#132B21]/20 dark:border-[#C5A880]/30 p-3.5 space-y-2.5"
        >
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent shrink-0" />
            <span className="text-sm font-medium text-foreground">
              {subscriberStatus.statusMessage}
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {subscriberStatus.description}
          </p>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              data-testid="retry-analysis-button"
              size="sm"
              variant="outline"
              disabled={isRetrying}
              onClick={() => retryMutation.mutate()}
              className="text-xs border-[#C5A880]/50 hover:bg-[#FAF4EB] dark:hover:bg-[#132B21]/40 flex items-center gap-1.5"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
              <span>
                {isRetrying
                  ? t("recovery.running", "Reanalizando...")
                  : t("caseWorkspace.retryAnalysis", "Reintentar análisis")}
              </span>
            </Button>

            <Button
              asChild
              data-testid="contact-support-button"
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            >
              <a href="/messages">
                <HelpCircle className="h-3.5 w-3.5" />
                <span>{t("caseWorkspace.contactSupport", "Contactar soporte")}</span>
              </a>
            </Button>
          </div>

          {/* If a generated report exists requiring review, provide draft download button */}
          {subscriberStatus.canDownloadPdf && (
            <div className="pt-2 border-t border-border/40">
              <Button
                data-testid="download-review-draft-button"
                variant="outline"
                className="w-full border-accent/40 bg-accent/10 hover:bg-accent/20 text-accent-foreground text-xs flex items-center justify-center gap-2 font-medium"
                disabled={downloadingPdf}
                onClick={handleDownloadPdf}
              >
                <FileDown className="h-3.5 w-3.5 text-accent" />
                <span>
                  {downloadingPdf
                    ? t("common.downloading", "Descargando...")
                    : (subscriberStatus.downloadButtonLabel || t("caseWorkspace.downloadReviewDraft", "Descargar borrador para revisión"))}
                </span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 3. SUBSCRIBER VIEW: EMPTY / NOT READY */}
      {subscriberStatus.type === "empty" && (
        <p className="text-xs text-muted-foreground">
          {subscriberStatus.description}
        </p>
      )}

      {/* 4. ADMIN & SUPPORT ONLY: TECHNICAL DIAGNOSTICS PANEL */}
      {isPrivileged && (
        <div
          data-testid="admin-diagnostics-panel"
          className="mt-3 rounded-lg border border-border/80 bg-muted/30 p-3 space-y-2 text-xs"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-foreground/90">
              <Terminal className="h-3.5 w-3.5 text-accent" />
              <span>Vista técnica (Admin / Soporte)</span>
            </div>
            <button
              type="button"
              onClick={() => setAdminPanelOpen(!adminPanelOpen)}
              className="p-1 text-muted-foreground hover:text-foreground rounded"
              aria-label="Toggle admin diagnostics"
            >
              {adminPanelOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Quick status summary for admins */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {releaseDecision && (
              <span
                className={`px-1.5 py-0.5 rounded font-mono ${
                  releaseDecision === "PASS"
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : releaseDecision === "BLOCK"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                }`}
              >
                Release: {releaseDecision}
              </span>
            )}
            {qualityGate?.score !== undefined && (
              <span className="px-1.5 py-0.5 rounded font-mono bg-background border border-border">
                Quality: {qualityGate.score}/100
              </span>
            )}
            {pipelineStage && (
              <span className="px-1.5 py-0.5 rounded font-mono bg-background border border-border text-muted-foreground">
                Stage: {pipelineStage}
              </span>
            )}
            {executionId && (
              <span className="px-1.5 py-0.5 rounded font-mono bg-background border border-border text-muted-foreground">
                Exec: {executionId.slice(0, 8)}
              </span>
            )}
          </div>

          {/* Admin Action: Download JSON (Only available to admins) */}
          {onDownloadJson && (
            <div className="pt-1">
              <Button
                data-testid="admin-download-json-button"
                variant="outline"
                size="sm"
                className="w-full text-xs flex items-center justify-center gap-1.5 font-mono"
                disabled={downloadingJson}
                onClick={handleDownloadJson}
              >
                <FileJson className="h-3.5 w-3.5 text-accent" />
                <span>
                  {downloadingJson ? "Exportando JSON..." : "Descargar JSON (Auditoría)"}
                </span>
              </Button>
            </div>
          )}

          {/* Expandable Technical Details */}
          {adminPanelOpen && (
            <div className="mt-2 space-y-2 border-t border-border pt-2 text-[11px] font-mono text-muted-foreground">
              {qualityBlockReasons.length > 0 && (
                <div>
                  <span className="font-semibold text-destructive block">
                    Quality Block Reasons ({qualityBlockReasons.length}):
                  </span>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5 text-foreground/80 break-all">
                    {qualityBlockReasons.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {contractError && (
                <div>
                  <span className="font-semibold text-destructive block">Contract Error:</span>
                  <p className="mt-0.5 text-foreground/80 break-all">{contractError}</p>
                </div>
              )}

              {rawError && (
                <div>
                  <span className="font-semibold text-destructive block">Raw Error:</span>
                  <p className="mt-0.5 text-foreground/80 break-all">{rawError}</p>
                </div>
              )}

              {releaseWarnings.length > 0 && (
                <div>
                  <span className="font-semibold text-amber-500 block">Release Warnings:</span>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5 text-foreground/80 break-all">
                    {releaseWarnings.map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}

              {qualityGate?.critical_issues && qualityGate.critical_issues.length > 0 && (
                <div>
                  <span className="font-semibold text-destructive block">Critical Issues:</span>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5 text-foreground/80 break-all">
                    {qualityGate.critical_issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
