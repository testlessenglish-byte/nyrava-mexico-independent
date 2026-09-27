import { civilPresentation } from '@/lib/civil/presentation';
export function CivilAnalysisPanel({ report, language = 'es' }: { report: unknown; language?: string }) {
  const view = civilPresentation(report, language);
  if (!view) return null;
  return <section className="space-y-4 rounded-xl border border-border bg-card p-4" data-civil-analysis>
    <h3 className="font-semibold">{view.title}</h3>
    <dl className="grid gap-3 sm:grid-cols-2">{view.contextRows.map(([label, value]) => <div key={label}>
      <dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm">{value}</dd>
    </div>)}</dl>
    <h3 className="font-semibold">{view.elementsTitle}</h3>
    {view.elements.map((e: any, i: number) => <article key={i} className="space-y-1 rounded-lg border border-border p-3 text-sm">
      <h4 className="font-medium">{e.issue} — {e.element}: {e.status}</h4>
      <p>{e.reason}</p><p>{e.authority}</p><p>{e.evidence}</p><p>{e.gaps}</p><p className="text-xs text-muted-foreground">{e.availability}</p>
    </article>)}
  </section>;
}
