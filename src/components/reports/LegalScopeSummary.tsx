import {documentPurposeSummary} from '@/lib/reporting/document-purpose-summary';
export function LegalScopeSummary({fullReport}:{fullReport:unknown}) {
  const scope = (fullReport as {legal_context?:{summary?:string;notes?:string[]}} | null)?.legal_context;
  if (!scope?.summary) return null;
  return <section className="rounded-xl border border-border bg-card/60 p-4" aria-label="Jurisdicción y legislación aplicable">
    <h3 className="text-sm font-semibold">Jurisdicción y legislación aplicable</h3>
    <p className="mt-2 text-sm">{scope.summary}</p>
    {Array.isArray(scope.notes) && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{scope.notes.filter(n=>typeof n==='string').map((note,i)=><li key={i}>{note}</li>)}</ul>}
    {documentPurposeSummary((fullReport as any)?.document_analysis).map((line,i)=><p key={`purpose-${i}`} className="mt-2 text-xs text-muted-foreground">{line}</p>)}
  </section>;
}
