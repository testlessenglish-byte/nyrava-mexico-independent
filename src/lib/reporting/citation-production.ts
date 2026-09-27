import { auditSourceLocations } from './source-location-audit';
import { evaluateClaimEntailment } from '../intelligence/claim-evidence-entailment';
import { supportInput, type SupportClaim, type SupportVerdict } from '../intelligence/claim-support-review';
import type { MatterSourcePage } from '../intelligence/source-matter-audit';
type Row = Record<string, any>;
type Index = Array<{ document_id: string; doc_n: number }>;
export type PropositionReview = { claim: SupportClaim; review: SupportVerdict };
export function reviewedAttributionMatches(value: Row, claim: SupportClaim): boolean {
  const canonical = (key: string, v: unknown) => key === 'proposition_type' && v === 'court_holding' ? 'holding' : v;
  return ['speaker_role','proposition_type','adoption_status'].every(key =>
    value[key] == null || canonical(key, value[key]) === canonical(key, (claim as Row)[key]));
}
/** This input comes from engine finding records, never Report Writer objects. */
export function findingCitationReviews(findings: Row[]): PropositionReview[] {
  return findings.flatMap(f => f.metadata?.semantic_support_review ? [{
    claim: Object.fromEntries(['id','title','description','source_document_id','source_page','source_quote',
      'speaker_role','proposition_type','adoption_status','legal_significance','potential_impact','rationale',
      'audit_classification','finding_type','authority_level'].filter(k => f[k] !== undefined).map(k => [k, f[k]])) as SupportClaim,
    review: f.metadata.semantic_support_review,
  }] : []);
}
export const citationText = (s: unknown) => typeof s === 'string' ? s.normalize('NFC').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?]$/, '') : '';

/** Re-use an existing semantic review only for its exact claim and source input.
 * A verified flag or lexical overlap is never semantic proof. */
export function citationPropositionVerified(ref: Row, proposition: string, pages: MatterSourcePage[], trustedReviews: PropositionReview[] = []): boolean {
  const quote = String(ref.quote ?? '');
  if (!proposition || !quote) return false;
  if (citationText(proposition) === citationText(quote)) {
    const party = /^(?:quejoso|quejosa|actor|actora|defensa|party|parte_actora)$/i.test(String(ref.speaker_role ?? ''));
    const court = /court|tribunal|scjn|sala/i.test(String(ref.speaker_role ?? ''));
    if (party && /^(?:el tribunal|la sala|la scjn|la suprema corte)\s/i.test(quote)) return false;
    if (court && /^(?:el quejoso|la quejosa|la parte actora|el actor|la defensa)\s/i.test(quote)) return false;
    const check = evaluateClaimEntailment({ id: String(ref.id ?? 'citation'), title: proposition,
      source_document_id: String(ref.document_id ?? ''), source_quote: quote, speaker_role: ref.speaker_role });
    return check.entailment_status === 'ENTAILED' && check.final_reportable;
  }
  const proof = ref.proposition_verification as PropositionReview | undefined;
  if (!proof?.claim || proof.review?.version !== 1 || proof.review.verdict !== 'supported') return false;
  const claim = proof.claim, review = proof.review;
  if (!trustedReviews.some(trusted => trusted.claim.id === claim.id &&
      supportInput(trusted.claim, pages).hash === review.hash && trusted.review.hash === review.hash &&
      trusted.review.verdict === review.verdict && trusted.review.supporting_quote === review.supporting_quote)) return false;
  if (!reviewedAttributionMatches(ref, claim)) return false;
  if (citationText(claim.description) !== citationText(proposition) ||
      claim.source_document_id !== ref.document_id || claim.source_page !== ref.page ||
      citationText(claim.source_quote) !== citationText(quote)) return false;
  const input = supportInput(claim, pages);
  return input.hash === review.hash && typeof review.supporting_quote === 'string' && review.supporting_quote.length >= 20 &&
    input.context.includes(review.supporting_quote.normalize('NFC').replace(/\s+/g, ' ').trim());
}

/** Canonical object creation, before final validation. Never changes the source
 * or manufactures a supported proposition from a legacy verification flag. */
export function createCanonicalCitation(ref: Row, proposition: string, pages: MatterSourcePage[], index: Index, proof?: PropositionReview): Row | null {
  const quote = String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? '');
  const candidate = { ...ref, document_id: ref.document_id ?? ref.doc_id ?? ref.source_document_id,
    page: ref.page ?? ref.page_number ?? ref.source_page, quote,
    ...(proof ? { proposition_verification: proof } : {}) };
  const audit = auditSourceLocations([candidate], pages, index);
  if (!audit.ok || audit.verified.length !== 1) return null;
  const located = audit.verified[0];
  if (!citationPropositionVerified({ ...candidate, ...located }, proposition, pages, proof ? [proof] : [])) return null;
  const doc = index.find(d => d.document_id === located.document_id);
  return { ...candidate, ...located, doc_n: doc?.doc_n, page_number: located.page, page_located: located.page,
    proposition_supported: proposition, verification_status: 'verified' };
}

export function completedCoreCitations<T extends { id: string; text: string; source_refs: Row[] }>(
  core: T[], findings: Row[], pages: MatterSourcePage[], index: Index,
): T[] {
  return core.map(item => {
    const finding = findings.find(f => f.metadata?.mandatory_decision_core_id === item.id);
    const review = finding?.metadata?.semantic_support_review;
    const claim = finding ? Object.fromEntries(['id','title','description','source_document_id','source_page','source_quote',
      'speaker_role','proposition_type','adoption_status','legal_significance','potential_impact','rationale','audit_classification',
      'finding_type','authority_level'].filter(k => finding[k] !== undefined).map(k => [k, finding[k]])) as SupportClaim : null;
    const proof = claim && review ? { claim, review } : undefined;
    return { ...item, source_refs: item.source_refs.map(ref =>
      createCanonicalCitation(ref, item.text, pages, index, proof) ?? ref) };
  });
}

export function writerCitationCatalog(refs: Row[], pages: MatterSourcePage[], index: Index): Row[] {
  const checked = refs.flatMap(ref => {
    const citation = createCanonicalCitation(ref, String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? ''), pages, index);
    return citation ? [citation] : [];
  });
  return [...new Map(checked.map(c => [c.document_id + ':' + c.page + ':' + citationText(c.quote), c])).values()];
}

export function inlineCitationStatement(before: string): string {
  const trimmed = before.trim();
  const quoted = /[“"]([^“”"]+)[”"]$/.exec(trimmed);
  if (quoted) {
    const prefix = trimmed.slice(0, quoted.index);
    if (!prefix.trim() || /\n\s*\n$/.test(prefix) || /[.!?\]]\s*$/.test(prefix)) return quoted[1].trim();
    return trimmed;
  }
  const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ“"])/);
  const last = sentences.at(-1) ?? '', previous = sentences.at(-2) ?? '';
  return /^(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO)\.$/.test(previous) ? previous + ' ' + last : last;
}

/** Writer output cannot invent a page or attach a verified quote to new prose. */
export function assertWriterCitationReferences(value: unknown, catalog: Row[]): void {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\[(DOC\s+[^\]]+)\]/gi)) {
      const statement = inlineCitationStatement(value.slice(0, match.index));
      const pairs = [...match[1].matchAll(/DOC\s+(\d+)\s+p\.\s*(\d+)/gi)];
      if (!pairs.length || pairs.some(pair => !catalog.some(c => c.doc_n === Number(pair[1]) && c.page === Number(pair[2]) &&
        c.verification_status === 'verified' && citationText(c.proposition_supported) === citationText(statement))))
        throw new Error('REPORT_WRITER_CITATION_UNRESOLVED: ' + match[0]);
    }
  } else if (Array.isArray(value)) value.forEach(v => assertWriterCitationReferences(v, catalog));
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (!['quote', 'source_quote', 'excerpt', 'proposition_supported', 'proposition_verification'].includes(key)) assertWriterCitationReferences(child, catalog);
  }
}
