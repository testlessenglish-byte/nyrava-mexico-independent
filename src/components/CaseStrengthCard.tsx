import { assessCase, assessmentLabels, type CaseAssessment } from '@/lib/reporting/qualitative-assessment';

export function CaseStrengthCard({ report, findings, language = 'es', coverage = false, assessment: supplied }: {
  assessment?: CaseAssessment; report?: unknown; findings?: unknown[]; language?: string; coverage?: boolean;
}) {
  const assessment = supplied ?? assessCase(report, findings);
  const labels = assessmentLabels(assessment, language);
  return <section data-case-strength-state={assessment.state} className="rounded-xl border border-border bg-card p-4">
    <h3 className="text-xs uppercase tracking-wider text-muted-foreground">{labels.caseStrengthTitle}</h3>
    <p className="mt-2 text-base font-semibold">{labels.caseStrength}</p>
    <p className="mt-1 text-xs text-muted-foreground">{labels.explanation}</p>
    {coverage && <div className="mt-4">
      <h4 className="text-sm font-semibold">{labels.title}</h4>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">{labels.rows.map(([label, value]) => <div key={label}>
        <dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm">{value}</dd>
      </div>)}</dl>
    </div>}
  </section>;
}
