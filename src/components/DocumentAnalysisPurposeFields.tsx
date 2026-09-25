import { useId } from 'react';
export function DocumentAnalysisPurposeFields({purpose, onPurposeChange, connectionNote, onConnectionNoteChange, disabled = false, locale = 'es'}: {
  purpose: string; onPurposeChange: (value: string) => void; connectionNote?: string; onConnectionNoteChange?: (value: string) => void; disabled?: boolean; locale?: string;
}) {
  const id = useId(); const en = locale === 'en';
  return <div className="my-3 space-y-2 text-sm">
    <label htmlFor={id} className="block font-medium">{en ? 'Document purpose' : 'Finalidad del documento'}</label>
    <select id={id} className="w-full rounded border border-border bg-background p-2" value={purpose} disabled={disabled} onChange={e => onPurposeChange(e.target.value)}>
      <option value="">{en ? 'Unknown / not declared' : 'Desconocida / sin declarar'}</option>
      <option value="legal_research">{en ? 'Legal research / judgment analysis' : 'Investigación jurídica / análisis de sentencia'}</option>
      <option value="client_matter_evidence">{en ? 'Evidence submitted to a client matter' : 'Prueba aportada al asunto de un cliente'}</option>
    </select>
    {purpose === 'client_matter_evidence' && onConnectionNoteChange && <>
      <label htmlFor={`${id}-note`} className="block">{en ? 'Declared connection to this matter' : 'Vínculo declarado con este asunto'}</label>
      <textarea id={`${id}-note`} className="w-full rounded border border-border bg-background p-2" maxLength={4000} value={connectionNote ?? ''} disabled={disabled} onChange={e => onConnectionNoteChange(e.target.value)} />
    </>}
    <p className="text-xs text-muted-foreground">{en ? 'A declaration does not verify identity or prove the document’s assertions. Without a declared purpose or connection, client-specific conclusions remain unresolved.' : 'La declaración no verifica identidades ni prueba las afirmaciones del documento. Sin finalidad o vínculo declarado, las conclusiones sobre el cliente quedan sin resolver.'}</p>
  </div>;
}
export function MatterAnalysisFields({question, onQuestionChange, fixture, onFixtureChange, disabled = false, locale = 'es'}: {
  question: string; onQuestionChange: (value: string) => void; fixture: boolean; onFixtureChange: (value: boolean) => void; disabled?: boolean; locale?: string;
}) {
  const id = useId(); const en = locale === 'en';
  return <div className="my-3 space-y-2 text-sm">
    <label htmlFor={id} className="block font-medium">{en ? 'Legal question / research objective' : 'Pregunta jurídica / objetivo de investigación'}</label>
    <textarea id={id} className="w-full rounded border border-border bg-background p-2" value={question} maxLength={4000} disabled={disabled} onChange={e => onQuestionChange(e.target.value)} />
    <label className="flex items-center gap-2"><input type="checkbox" checked={fixture} disabled={disabled} onChange={e => onFixtureChange(e.target.checked)} />{en ? 'Test fixture (same verification requirements)' : 'Caso de prueba (mismos requisitos de verificación)'}</label>
  </div>;
}
