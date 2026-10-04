import {invalidateChangedFindingReview} from './claim-support-review';
/** Speaker provenance from the passage's position in the extracted decision.
 * A court named in a party's grievance is the subject, not the speaker. */
export type SpeakerSourcePage = {
  document_id: string;
  page: number;
  text: string;
};

export type SpeakerSourceRef = {
  document_id: string;
  page: number;
  quote: string;
};

const partySectionAnchors = [
  /formulando\s+(?:\w+\s+){0,5}motivos?\s+de\s+agravio/gi,
  /con\s+los\s+siguientes\s+razonamientos/gi,
  /estiman\s+los\s+recurrentes/gi,
  /(?:los|las)\s+(?:recurrentes|quejosos)\s+(?:alegan|sostienen|aducen|afirman|plantean)/gi,
];
const sectionEndAnchors = [
  /\b\d+\.\s*Tr[aá]mite\s+del\s+recurso\s+de\s+revisi[oó]n/gi,
  /\b[IVXLCDM]+\.\s*[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{5,}/g,
  /\b(?:la|esta)\s+(?:Primera|Segunda)\s+Sala\s+(?:considera|estima|concluye|advierte|determina)/gi,
  /\b(?:el|este)\s+Tribunal\s+(?:considera|estima|concluye|resuelve|determina)/gi,
];

function compact(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function lastMatch(text: string, patterns: RegExp[]): number {
  let last = -1;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) last = Math.max(last, match.index ?? -1);
  }
  return last;
}

/** Returns a speaker only when a source section explicitly identifies one. */
export function sourceSpeakerForQuote(
  ref: SpeakerSourceRef,
  pages: SpeakerSourcePage[],
): 'recurrente' | null {
  const current = pages.find(p => p.document_id === ref.document_id && p.page === ref.page);
  const quote = compact(ref.quote);
  if (!current || !quote) return null;
  const currentText = compact(current.text);
  const start = currentText.indexOf(quote);
  if (start < 0) return null;
  const previous = pages.find(p => p.document_id === ref.document_id && p.page === ref.page - 1);
  // Keep only the adjacent source context. A distant grievance heading must
  // never characterize a later holding merely because both share a document.
  const preceding = `${compact(previous?.text ?? '').slice(-1800)} ${currentText.slice(0, start)}`.slice(-3200);
  const partyStart = lastMatch(preceding, partySectionAnchors);
  const partyEnd = lastMatch(preceding, sectionEndAnchors);
  return partyStart >= 0 && partyStart > partyEnd ? 'recurrente' : null;
}

const partyAttribution = /(?:seg[uú]n|a\s+juicio\s+de)\s+(?:los|las)\s+(?:recurrentes|quejosos)|(?:los|las)\s+(?:recurrentes|quejosos)\s+(?:sostuvieron|sostienen|alegaron|alegan|adujeron|aducen|afirmaron|afirman|plantearon|plantean|argumentaron|argumentan)/i;

/** Producer preflight: a party grievance cannot be emitted as an adopted fact. */
export function validateSourceAttribution(
  text: string,
  ref: SpeakerSourceRef,
  pages: SpeakerSourcePage[],
): { ok: boolean; reason?: string } {
  if (sourceSpeakerForQuote(ref, pages) !== 'recurrente') return { ok: true };
  return partyAttribution.test(text)
    ? { ok: true }
    : { ok: false, reason: 'party_argument_misattributed_as_court_fact' };
}

/** Annotate source-backed finding inputs before Report Writer consumes them. */
export function attributeFindingsFromSource<T extends Record<string, any>>(
  findings: T[],
  pages: SpeakerSourcePage[],
): T[] {
  return findings.map(finding => {
    const firstRef = Array.isArray(finding.evidence_refs) ? finding.evidence_refs[0] : null;
    const documentId = finding.source_document_id ?? firstRef?.document_id;
    const page = finding.source_page ?? firstRef?.page;
    const quote = finding.source_quote ?? firstRef?.quote;
    if (typeof documentId !== 'string' || typeof page !== 'number' || typeof quote !== 'string') return finding;
    if (sourceSpeakerForQuote({ document_id: documentId, page, quote }, pages) !== 'recurrente') return finding;
    const description = String(finding.description ?? '');
    const qualified = partyAttribution.test(description)
      ? description
      : `Los recurrentes sostuvieron que ${description.charAt(0).toLowerCase()}${description.slice(1)}`;
    const unchanged = finding.speaker_role === 'quejoso' &&
      finding.proposition_type === 'allegation' &&
      finding.adoption_status === 'party_position' &&
      description === qualified;
    if (unchanged) return finding;
    // Speaker and claim text are part of the support-review hash. Discard any
    // old verdict so only the existing reviewer can verify this new claim.
    const {
      semantic_support_review: _oldReview,
      claim_entailment_diagnostic: _oldEntailment,
      ...safeMetadata
    } = (finding.metadata ?? {}) as Record<string, unknown>;
    return invalidateChangedFindingReview(finding as any, {
      ...finding,
      description: qualified,
      speaker_role: 'quejoso',
      proposition_type: 'allegation',
      adoption_status: 'party_position',
      audit_classification: null,
      verification_status: 'pending',
      metadata: {
        ...safeMetadata,
        source_speaker_provenance: { speaker_role: 'recurrente', document_id: documentId, page },
        original_unqualified_description: description,
      },
    } as any) as T;
  });
}
