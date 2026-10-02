import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Gavel, Copy, FileText, FileDown, Printer, Pencil, Loader2, RotateCw, Library, X, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getCase, draftMotion, getMotionDrafts } from "@/lib/cases.functions";
import { CasePicker, useActiveCase } from "@/components/modules/CasePicker";
import { ModuleHeader, SuppressedNotice } from "@/components/modules/SuppressedNotice";
import { ModuleStateNotice } from "@/components/modules/ModuleStatus";
import { computeModuleStates, selectMotionOpportunities } from "@/lib/modules/applicability";
import { isDeterministicFallback } from "@/lib/intelligence/canonical";
import { MotionPreview, downloadMotionPdf, printMotion } from "@/lib/motion-markdown";
import { MotionEditor } from "@/components/MotionEditor";
import { buildSupportingAuthority } from "@/lib/intelligence/authority";
import { SupportingAuthorityCard } from "@/components/SupportingAuthorityCard";
import { CaseDetailPanel, type CaseDetailContext } from "@/components/CaseDetailPanel";
import { useI18n } from "@/i18n";
import { useTranslatedTexts } from "@/hooks/useTranslatedTexts";
import {
  MEXICO_MOTION_TEMPLATES,
  MOTION_TEMPLATE_CATEGORIES,
  templatesForMateria,
  type MotionTemplate,
} from "@/lib/motion-template-library";

export const Route = createFileRoute("/_authenticated/motion")({
  head: () => ({
    meta: [
      { title: "Centro de Promociones — Nyrava Intelligence México" },
      {
        name: "description",
        content:
          "Promociones y escritos respaldados por evidencia verificada, con validación de suficiencia probatoria.",
      },
      { property: "og:title", content: "Centro de Promociones — Nyrava México" },
      {
        property: "og:description",
        content: "Promociones legales generadas a partir de evidencia verificada del expediente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MotionPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;

function MotionPage() {
  const { t } = useI18n();
  const { cases, activeId, isLoading } = useActiveCase();
  const [selected, setSelected] = useState<string | null>(null);
  const caseId = selected ?? activeId;
  const fetchCase = useServerFn(getCase);
  const { data, isLoading: caseLoading } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchCase({ data: { caseId: caseId! } }),
    enabled: !!caseId,
  });

  const report = data?.report as any;
  const jurisdiction = data?.case?.jurisdiction ?? null;
  const [caseDetail, setCaseDetail] = useState<CaseDetailContext | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const motionsSuppressed = report?.motions_suppressed === true;
  const detFallback = isDeterministicFallback(report);
  const opps = selectMotionOpportunities(data);

  // Case-level legal filings are independent from Motion Intelligence.
  // ESS may suppress AI-recommended opportunities, but an attorney's saved
  // drafts must remain visible and editable for the selected case.
  const fetchCaseDrafts = useServerFn(getMotionDrafts);
  const { data: caseDraftsData, isLoading: caseDraftsLoading } = useQuery({
    queryKey: ["motion-drafts", caseId],
    queryFn: () => fetchCaseDrafts({ data: { caseId: caseId! } }),
    enabled: !!caseId,
  });
  const caseDrafts: Draft[] = caseDraftsData?.drafts ?? [];

  // Screen-reading translation only — never applied to the formal Report.
  const sourceLocale = (data?.case as { report_language?: string | null } | undefined)?.report_language === "en"
    ? "en"
    : "es";
  const { texts: translatedFlat } = useTranslatedTexts(
    opps.flatMap((o) => [o.title, o.description]),
    sourceLocale,
  );
  const translatedOpps = opps.map((o, i) => ({
    ...o,
    title: translatedFlat[i * 2] || o.title,
    description: translatedFlat[i * 2 + 1] || o.description,
  }));

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast.success(t("motion.toast.copied")),
      () => toast.error(t("motion.toast.copyFailed")),
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <ModuleHeader icon={<Gavel className="h-5 w-5" />} title={t("motion.title")} subtitle={t("motion.subtitle")} />
      {isLoading ? (
        <div className="rounded-xl border border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
          {t("motion.loadingCases")}
        </div>
      ) : (
        <div className="space-y-5">
          <CasePicker cases={cases} activeId={caseId} onChange={setSelected} />

          <section className="rounded-xl border border-border bg-card/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Library className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">
                    {t("motion.library.title")}
                  </h2>
                </div>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  {t("motion.library.subtitle")}
                </p>
              </div>
              <button
                type="button"
                disabled={!caseId}
                onClick={() => setLibraryOpen(true)}
                className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("motion.library.open")}
              </button>
            </div>
          </section>

          {caseId ? (
            caseLoading ? (
              <div className="rounded-xl border border-border bg-card/60 p-10 text-center text-sm text-muted-foreground">
                {t("motion.loadingMotions")}
              </div>
            ) : motionsSuppressed ? (
              <SuppressedNotice title={t("motion.suppressed.title")} detail={t("motion.suppressed.detail")} />
            ) : opps.length === 0 ? (
              <ModuleStateNotice state={computeModuleStates(data).find((m) => m.key === "motion")!} />
            ) : (
              <>
                {detFallback ? <SuppressedNotice title={t("motion.limited")} /> : null}
                <div className="grid gap-3">
                  {translatedOpps.map((o) => (
                    <OpportunityCard
                      key={o.id}
                      o={o}
                      caseId={caseId}
                      copy={copy}
                      report={report}
                      jurisdiction={jurisdiction}
                      onSelectCase={setCaseDetail}
                    />
                  ))}
                </div>
              </>
            )
          ) : null}

          {caseId ? (
            <CaseLegalFilingsWorkspace
              caseId={caseId}
              drafts={caseDrafts}
              loading={caseDraftsLoading}
              copy={copy}
            />
          ) : null}
        </div>
      )}
      <MexicoMotionLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        caseId={caseId}
        materia={(data?.case as any)?.case_type ?? null}
        jurisdiction={jurisdiction}
      />
      <CaseDetailPanel open={!!caseDetail} onOpenChange={(o) => !o && setCaseDetail(null)} context={caseDetail} />
    </div>
  );
}



function CaseLegalFilingsWorkspace({
  caseId,
  drafts,
  loading,
  copy,
}: {
  caseId: string;
  drafts: Draft[];
  loading: boolean;
  copy: (text: string) => void;
}) {
  const { t } = useI18n();
  const [openDraftId, setOpenDraftId] = useState<string | null>(null);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [liveBodies, setLiveBodies] = useState<Record<string, string>>({});

  useEffect(() => {
    setOpenDraftId(null);
    setEditingDraftId(null);
    setLiveBodies({});
  }, [caseId]);

  // Automatically open the newest draft. This makes Use Template feel
  // continuous: generate -> library closes -> draft appears here.
  useEffect(() => {
    if (!drafts.length) return;
    if (openDraftId && drafts.some((d) => String(d.id) === openDraftId)) return;
    setOpenDraftId(String(drafts[0].id));
  }, [drafts, openDraftId]);

  return (
    <section className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">{t("motion.workspace.title")}</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("motion.workspace.subtitle")}
          </p>
        </div>

        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          {t("motion.workspace.count", { n: drafts.length })}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/50 p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("motion.workspace.loading")}
        </div>
      ) : drafts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-7 text-center">
          <FileText className="mx-auto h-7 w-7 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-semibold">
            {t("motion.workspace.empty")}
          </h3>
          <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
            {t("motion.workspace.emptyDetail")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => {
            const id = String(draft.id);
            const title = String(draft.title ?? draft.motion_title ?? t("motion.workspace.untitled"));
            const body = liveBodies[id] ?? String(draft.body_markdown ?? "");
            const open = openDraftId === id;
            const editing = editingDraftId === id;
            const failed = draft.status === "failed";

            return (
              <article
                key={id}
                className="overflow-hidden rounded-lg border border-border bg-background/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <button
                    type="button"
                    disabled={failed}
                    onClick={() => setOpenDraftId(open ? null : id)}
                    className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate text-sm font-semibold">{title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 pl-6 text-[11px] text-muted-foreground">
                      <span>{draft.status ?? "complete"}</span>
                      {draft.updated_at ? (
                        <>
                          <span>·</span>
                          <span>
                            {t("motion.workspace.updated")}{" "}
                            {new Date(String(draft.updated_at)).toLocaleString()}
                          </span>
                        </>
                      ) : null}
                    </div>
                  </button>

                  {!failed && body.trim() ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title={t("motion.action.copy")}
                        onClick={() => copy(body)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Copy className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        title={t("motion.action.edit")}
                        onClick={() => {
                          setOpenDraftId(id);
                          setEditingDraftId(editing ? null : id);
                        }}
                        className={`rounded p-1.5 hover:bg-muted hover:text-foreground ${
                          editing ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        title={t("motion.action.print")}
                        onClick={() =>
                          printMotion(title, body).catch((e) =>
                            toast.error(
                              e instanceof Error
                                ? e.message
                                : t("motion.toast.exportFailed"),
                            ),
                          )
                        }
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Printer className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        title={t("motion.action.pdf")}
                        onClick={() =>
                          downloadMotionPdf(title, body).catch((e) =>
                            toast.error(
                              e instanceof Error
                                ? e.message
                                : t("motion.toast.exportFailed"),
                            ),
                          )
                        }
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <FileDown className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {draft.error_message ? (
                  <div className="border-t border-border px-3 py-2 text-xs text-amber-500">
                    {String(draft.error_message)}
                  </div>
                ) : null}

                {open && !failed ? (
                  <div className="border-t border-border p-3">
                    {draft.status === "unverified" || draft.status === "rejected" ? (
                      <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600">
                        {t("motion.workspace.verificationWarning")}
                      </div>
                    ) : null}

                    {editing ? (
                      <MotionEditor
                        draftId={id}
                        title={title}
                        initialMarkdown={body}
                        initialNotes={String(draft.attorney_notes ?? "")}
                        onSaved={(markdown) =>
                          setLiveBodies((current) => ({
                            ...current,
                            [id]: markdown,
                          }))
                        }
                      />
                    ) : (
                      <div className="max-h-[32rem] overflow-y-auto rounded-md border border-border bg-card/80 p-4">
                        <MotionPreview markdown={body} />
                      </div>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MexicoMotionLibrary({
  open,
  onClose,
  caseId,
  materia,
  jurisdiction,
}: {
  open: boolean;
  onClose: () => void;
  caseId: string | null | undefined;
  materia: string | null;
  jurisdiction: string | null;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const draftFn = useServerFn(draftMotion);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedTemplate, setSelectedTemplate] = useState<MotionTemplate | null>(null);

  const templateDraftMutation = useMutation({
    mutationFn: async (template: MotionTemplate) => {
      if (!caseId) throw new Error(t("motion.library.caseRequired"));

      const title = locale === "es" ? template.titleEs : template.titleEn;
      const result = await draftFn({
        data: {
          caseId,
          motionTitle: title,
          templateId: template.id,
          opportunityDescription:
            locale === "es" ? template.descriptionEs : template.descriptionEn,
          caseLawCitations: [],
        },
      });

      if (!result.ok) {
        throw new Error(
          "message" in result && result.message
            ? result.message
            : t("motion.toast.failed"),
        );
      }

      return result;
    },
    onMutate: () => toast.info(t("motion.toast.drafting")),
    onSuccess: async () => {
      toast.success(t("motion.toast.ready"));
      await qc.invalidateQueries({ queryKey: ["motion-drafts", caseId] });
      setSelectedTemplate(null);
      onClose();
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : t("motion.toast.failed")),
  });

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCategory("all");
      setSelectedTemplate(null);
    }
  }, [open]);

  const templates = useMemo(() => {
    const base = templatesForMateria(materia);
    const q = query.trim().toLowerCase();

    return base.filter((template) => {
      if (category !== "all" && template.category !== category) return false;
      if (!q) return true;
      return [
        template.titleEs,
        template.titleEn,
        template.descriptionEs,
        template.descriptionEn,
        template.category,
        ...template.authorityFamily,
      ].some((value) => value.toLowerCase().includes(q));
    });
  }, [materia, query, category]);

  if (!open) return null;

  const es = locale === "es";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 md:p-6">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <div className="flex items-center gap-2">
              <Library className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">
                {t("motion.library.title")}
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("motion.library.modalSubtitle")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {materia ? (
                <span className="rounded-full border border-border px-2 py-1">
                  {t("motion.library.materia")}: {materia}
                </span>
              ) : null}
              {jurisdiction ? (
                <span className="rounded-full border border-border px-2 py-1">
                  {t("motion.library.jurisdiction")}: {jurisdiction}
                </span>
              ) : null}
              <span className="flex items-center gap-1 rounded-full border border-border px-2 py-1">
                <ShieldCheck className="h-3 w-3" />
                {t("motion.library.attorneyEditable")}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("motion.library.close")}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-border p-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("motion.library.search")}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>

            <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategory("all")}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
                  category === "all"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-muted"
                }`}
              >
                {t("motion.library.all")}
              </button>

              {MOTION_TEMPLATE_CATEGORIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCategory(item.id)}
                  className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium ${
                    category === item.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {es ? item.es : item.en}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          {selectedTemplate ? (
            <div className="mx-auto max-w-3xl">
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="mb-4 text-sm font-medium text-primary hover:underline"
              >
                ← {t("motion.library.back")}
              </button>

              <div className="rounded-xl border border-border bg-card/60 p-5">
                <h3 className="text-lg font-semibold">
                  {es ? selectedTemplate.titleEs : selectedTemplate.titleEn}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {es ? selectedTemplate.descriptionEs : selectedTemplate.descriptionEn}
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <LibraryField
                    label={t("motion.library.category")}
                    value={
                      MOTION_TEMPLATE_CATEGORIES.find(
                        (c) => c.id === selectedTemplate.category,
                      )
                        ? es
                          ? MOTION_TEMPLATE_CATEGORIES.find(
                              (c) => c.id === selectedTemplate.category,
                            )!.es
                          : MOTION_TEMPLATE_CATEGORIES.find(
                              (c) => c.id === selectedTemplate.category,
                            )!.en
                        : selectedTemplate.category
                    }
                  />
                  <LibraryField
                    label={t("motion.library.jurisdiction")}
                    value={selectedTemplate.jurisdiction}
                  />
                  <LibraryField
                    label={t("motion.library.authority")}
                    value={selectedTemplate.authorityFamily.join("; ")}
                  />
                  <LibraryField
                    label={t("motion.library.status")}
                    value={t("motion.library.requiresVerification")}
                  />
                </div>

                <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground">
                  {t("motion.library.verificationNotice")}
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    disabled={!caseId || templateDraftMutation.isPending}
                    onClick={() => templateDraftMutation.mutate(selectedTemplate)}
                    className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {templateDraftMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {templateDraftMutation.isPending
                      ? t("motion.action.drafting")
                      : t("motion.library.useTemplate")}
                  </button>
                </div>
              </div>
            </div>
          ) : templates.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => (
                <button
                  type="button"
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className="rounded-xl border border-border bg-card/60 p-4 text-left transition hover:border-primary/50 hover:bg-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {template.jurisdiction}
                    </span>
                  </div>
                  <h3 className="mt-3 font-semibold">
                    {es ? template.titleEs : template.titleEn}
                  </h3>
                  <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {es ? template.descriptionEs : template.descriptionEn}
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-[11px] font-medium text-primary">
                    <ShieldCheck className="h-3 w-3" />
                    {t("motion.library.caseVerificationRequired")}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <Library className="mx-auto h-8 w-8 text-muted-foreground" />
              <h3 className="mt-3 font-semibold">
                {t("motion.library.noTemplates")}
              </h3>
              <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
                {t("motion.library.noTemplatesDetail")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LibraryField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function OpportunityCard({
  o,
  caseId,
  copy,
  report,
  jurisdiction,
  onSelectCase,
}: {
  o: any;
  caseId: string;
  copy: (t: string) => void;
  report: any;
  jurisdiction: string | null;
  onSelectCase: (ctx: CaseDetailContext) => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const fetchDrafts = useServerFn(getMotionDrafts);
  const { data: draftsData } = useQuery({
    queryKey: ["motion-drafts", caseId],
    queryFn: () => fetchDrafts({ data: { caseId } }),
    enabled: !!caseId,
  });
  const drafts: Draft[] = draftsData?.drafts ?? [];
  const draftByTitle = new Map(drafts.map((d) => [d.motion_title, d]));

  return (
    <article className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{o.title}</h3>
        <span className="text-[11px] uppercase text-muted-foreground">
          {o.side} · {o.severity}
        </span>
      </div>
      <p className="mt-1.5 text-sm">{o.description}</p>
      {Array.isArray(o.recommended_motions) && o.recommended_motions.length > 0 ? (
        <div className="mt-3 space-y-2">
          {o.recommended_motions.map((m: any, i: number) => {
            const text = typeof m === "string" ? m : (m.title ?? m.name ?? JSON.stringify(m));
            const existing = draftByTitle.get(text);
            return (
              <MotionRow
                key={i}
                motionTitle={text}
                caseId={caseId}
                opportunityDescription={o.description ?? null}
                opportunitySeverity={o.severity ?? null}
                opportunityCitations={Array.isArray(o.citations) ? o.citations : []}
                report={report}
                jurisdiction={jurisdiction}
                onSelectCase={onSelectCase}
                existing={existing}
                copy={copy}
                onDrafted={() => qc.invalidateQueries({ queryKey: ["motion-drafts", caseId] })}
              />
            );
          })}
        </div>
      ) : null}
      {Array.isArray(o.citations) && o.citations.length > 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("motion.citations", { n: o.citations.length })}</p>
      ) : null}
    </article>
  );
}

function MotionRow({
  motionTitle,
  caseId,
  opportunityDescription,
  opportunitySeverity,
  opportunityCitations,
  report,
  jurisdiction,
  onSelectCase,
  existing,
  copy,
  onDrafted,
}: {
  motionTitle: string;
  caseId: string;
  opportunityDescription: string | null;
  opportunitySeverity?: string | null;
  opportunityCitations?: unknown[];
  report?: any;
  jurisdiction?: string | null;
  onSelectCase?: (ctx: CaseDetailContext) => void;
  existing?: Draft;
  copy: (t: string) => void;
  onDrafted: () => void;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [liveBody, setLiveBody] = useState<string | null>(null);
  const authority = useMemo(
    () =>
      buildSupportingAuthority({
        report,
        motionTitle,
        opportunityDescription,
        opportunitySeverity: opportunitySeverity ?? null,
        opportunityCitations: opportunityCitations ?? [],
      }),
    [report, motionTitle, opportunityDescription, opportunitySeverity, opportunityCitations],
  );
  const draftFn = useServerFn(draftMotion);
  const mutation = useMutation({
    mutationFn: (opts: { regenerate?: boolean }) =>
      draftFn({
        data: {
          caseId,
          motionTitle,
          opportunityDescription,
          caseLawCitations: authority.cases.slice(0, 5).map((c) => ({
            case_name: c.case_name,
            citation: c.citation,
            court: c.court,
            url: c.url,
          })),
        },
      }),
    onMutate: (opts) => {
      toast.info(opts.regenerate ? t("motion.toast.redrafting") : t("motion.toast.drafting"));
    },
    onSuccess: () => {
      toast.success(t("motion.toast.ready"));
      setExpanded(true);
      onDrafted();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : t("motion.toast.failed")),
  });

  useEffect(() => {
    setLiveBody(null);
    setEditing(false);
  }, [existing?.id]);

  const failed = existing?.status === "failed";
  const hasBody = !!existing && !failed && String(existing.body_markdown ?? "").trim().length > 0;

  return (
    <div className="rounded-lg bg-background/60 p-2.5">
      <SupportingAuthorityCard
        authority={authority}
        onSelectCase={(c) =>
          onSelectCase?.({
            case_: c,
            motionTitle,
            significance: authority.significance,
            jurisdiction: jurisdiction ?? null,
          })
        }
      />
      <div className="mt-2 flex items-start justify-between gap-2">
        <button
          className="flex items-center gap-1.5 text-left text-sm hover:underline disabled:no-underline"
          onClick={() => hasBody && setExpanded((v) => !v)}
          disabled={!hasBody}
        >
          {hasBody ? <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
          <span>{motionTitle}</span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {hasBody ? (
            <>
              <button
                title={t("motion.action.copy")}
                onClick={() => copy(liveBody ?? String(existing.body_markdown ?? ""))}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                title={t("motion.action.edit")}
                onClick={() => {
                  setExpanded(true);
                  setEditing((v) => !v);
                }}
                className={`rounded p-1 hover:text-foreground ${editing ? "text-foreground" : "text-muted-foreground"}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                title={t("motion.action.print")}
                onClick={() =>
                  printMotion(
                    String(existing.title ?? motionTitle),
                    liveBody ?? String(existing.body_markdown ?? ""),
                  ).catch((e) => toast.error(e instanceof Error ? e.message : t("motion.toast.exportFailed")))
                }
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <Printer className="h-3.5 w-3.5" />
              </button>
              <button
                title={t("motion.action.pdf")}
                onClick={() =>
                  downloadMotionPdf(
                    String(existing.title ?? motionTitle),
                    liveBody ?? String(existing.body_markdown ?? ""),
                  ).catch((e) => toast.error(e instanceof Error ? e.message : t("motion.toast.exportFailed")))
                }
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <FileDown className="h-3.5 w-3.5" />
              </button>
              <button
                title={t("motion.action.regenerate")}
                onClick={() => mutation.mutate({ regenerate: true })}
                disabled={mutation.isPending}
                className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {mutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" />
                )}
              </button>
            </>
          ) : (
            <button
              onClick={() => mutation.mutate({})}
              disabled={mutation.isPending}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted/40 disabled:opacity-50"
            >
              {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {mutation.isPending ? t("motion.action.drafting") : t("motion.action.generate")}
            </button>
          )}
        </div>
      </div>
      {failed ? (
        <p className="mt-1.5 text-xs text-muted-foreground">{existing?.error_message ?? t("motion.failed.retry")}</p>
      ) : null}
      {existing?.status === "unverified" || existing?.status === "rejected" ? (
        <p className="mt-1.5 text-xs text-amber-500">{existing.error_message}</p>
      ) : null}
      {hasBody && expanded ? (
        <>
          <p className="mt-2 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
            {t("motion.disclaimer")}
          </p>
          {editing ? (
            <MotionEditor
              draftId={String(existing.id)}
              title={String(existing.title ?? motionTitle)}
              initialMarkdown={liveBody ?? String(existing.body_markdown ?? "")}
              initialNotes={String(existing.attorney_notes ?? "")}
              onSaved={setLiveBody}
            />
          ) : (
            <div className="mt-2 max-h-96 overflow-y-auto rounded-md border border-border bg-card/80 p-4">
              <MotionPreview markdown={liveBody ?? String(existing.body_markdown ?? "")} />
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
