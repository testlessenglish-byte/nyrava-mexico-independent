import {useEffect, useState} from 'react';
import {useServerFn} from '@tanstack/react-start';
import {toast} from 'sonner';
import {updateDocumentAnalysisPurpose} from '@/lib/cases.functions';
import {resolveDocumentAnalysisScope, parseDocumentAnalysisPurpose} from '@/lib/intelligence/document-analysis-purpose';
import {DocumentAnalysisPurposeFields} from './DocumentAnalysisPurposeFields';
export function DocumentPurposeEditor({caseId, documentId, metadata, onSaved}: {caseId: string; documentId: string; metadata: unknown; onSaved: () => Promise<void>}) {
  const scope = resolveDocumentAnalysisScope({metadata});
  const stored = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
  const [purpose, setPurpose] = useState<string>(scope.purpose ?? '');
  const [note, setNote] = useState(String(stored.client_connection_note ?? ''));
  const [busy, setBusy] = useState(false);
  const save = useServerFn(updateDocumentAnalysisPurpose);
  useEffect(() => {setPurpose(scope.purpose ?? ''); setNote(String(stored.client_connection_note ?? ''));}, [scope.purpose, stored.client_connection_note]);
  return <div className="rounded border border-border p-3">
    <DocumentAnalysisPurposeFields purpose={purpose} onPurposeChange={setPurpose} connectionNote={note} onConnectionNoteChange={setNote} disabled={busy} />
    <p className="text-xs text-muted-foreground">Cambiar la finalidad invalida el análisis anterior. No inicia un análisis nuevo.</p>
    <button type="button" className="mt-2 rounded border border-border px-3 py-1 text-sm disabled:opacity-50" disabled={busy || (purpose === (scope.purpose ?? '') && note === String(stored.client_connection_note ?? ''))} onClick={async () => {
      setBusy(true);
      try {await save({data: {caseId, documentId, analysis_purpose: parseDocumentAnalysisPurpose(purpose), client_connection_note: note || null}}); await onSaved(); toast.success('Finalidad documental guardada.');}
      catch (error) {toast.error(error instanceof Error ? error.message : String(error));}
      finally {setBusy(false);}
    }}>Guardar finalidad</button>
  </div>;
}
