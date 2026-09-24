import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { rerunSingleAgent } from "@/lib/agents/multi-agent.functions";
import { reportRecoveryKind } from "@/lib/agents/report-recovery";

export function ReportRecovery({ caseId, reasons, busy }: { caseId: string; reasons: string[]; busy: boolean }) {
  const { t } = useI18n();
  const retry = useServerFn(rerunSingleAgent);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => retry({ data: { caseId, agentKey: "report" } }),
    onSuccess: () => { void qc.invalidateQueries(); toast.success(t("recovery.queued")); },
    onError: (error) => toast.error(error instanceof Error ? error.message : t("recovery.failed")),
  });
  return <div className="mt-3 space-y-2 break-words text-foreground">
    <p className="font-semibold">{t("recovery.title")}</p>
    <p>{t(`recovery.${reportRecoveryKind(reasons)}`)}</p>
    <Button size="sm" disabled={busy || mutation.isPending} onClick={() => mutation.mutate()}>
      {busy || mutation.isPending ? t("recovery.running") : t("recovery.retry")}
    </Button>
    <p>{t("recovery.escalate")}</p>
    <details><summary className="cursor-pointer">{t("recovery.details")}</summary>
      <ul className="mt-1 list-disc pl-4 break-all">{reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
    </details>
  </div>;
}
