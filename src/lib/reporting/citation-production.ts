import { auditSourceLocations } from './source-location-audit';
import { sha256HexSync } from '../intelligence/sha256';
import { evaluateClaimEntailment } from '../intelligence/claim-evidence-entailment';
import { supportInput, type SupportClaim, type SupportVerdict } from '../intelligence/claim-support-review';
import type { MatterSourcePage } from '../intelligence/source-matter-audit';
type Row = Record<string, any>;
type Index = Array<{ document_id: string; doc_n: number; canonical_source_id?: string }>;
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

/** Retain evidence for diagnosis without letting an uncertified reference look published. */
export function unresolvedCitation(ref: Row, reason: string): Row {
  return { ...ref, verification_status: 'unverified', publication_status: 'QUARANTINED',
    source_location_verified: false, certification_error: reason };
}

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
  if (ref.publication_status === 'QUARANTINED' ||
      (ref.verification_status != null && ref.verification_status !== 'verified')) return null;
  const quote = String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? '');
  const candidate = { ...ref, document_id: ref.document_id ?? ref.doc_id ?? ref.source_document_id,
    page: ref.page ?? ref.page_number ?? ref.source_page, quote,
    ...(proof ? { proposition_verification: proof } : {}) };
  const registered = index.find(doc => doc.document_id === candidate.document_id);
  if (candidate.canonical_source_id && (!registered?.canonical_source_id ||
      candidate.canonical_source_id !== registered.canonical_source_id)) return null;
  const audit = auditSourceLocations([candidate], pages, index);
  if (!audit.ok || audit.verified.length !== 1) return null;
  const located = audit.verified[0];
  if (!citationPropositionVerified({ ...candidate, ...located }, proposition, pages, proof ? [proof] : [])) return null;
  const doc = index.find(d => d.document_id === located.document_id);
  const result = { ...candidate, ...located, doc_n: doc?.doc_n,
    ...(doc?.canonical_source_id ? { canonical_source_id: doc.canonical_source_id } : {}),
    page_number: located.page, page_located: located.page,
    proposition_supported: proposition, verification_status: 'verified', source_location_verified: true };
  return { ...result, writer_ref_id: 'cite_' + sha256HexSync(JSON.stringify([result.canonical_source_id, result.document_id, result.page, citationText(result.proposition_supported), citationText(result.quote)])).slice(0, 24) };
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
      (() => {
  const atomicFinding = findings.find(f => f.metadata?.mandatory_decision_core_id === item.id && 
    Array.isArray(f.evidence_refs) && f.evidence_refs.some((r) => 
      r.document_id === ref.document_id && String(r.quote).trim() === String(ref.quote ?? ref.source_quote).trim()
    ));
  const atomicProposition = atomicFinding && atomicFinding.description ? String(atomicFinding.description) : item.text;
  const atomicProof = atomicFinding && atomicFinding.metadata?.semantic_support_review ? 
    { claim: Object.fromEntries(['id','title','description','source_document_id','source_page','source_quote'].filter(k => atomicFinding[k] !== undefined).map(k => [k, atomicFinding[k]])), review: atomicFinding.metadata.semantic_support_review } : proof;
  return createCanonicalCitation(ref, atomicProposition, pages, index, atomicProof);
})() ?? unresolvedCitation(ref, 'CORE_PROPOSITION_NOT_CERTIFIED')) };
  });
}

export function completedTheoriesCitations<T extends Row>(
  theories: T[], findings: Row[], pages: MatterSourcePage[], index: Index,
): T[] {
  return theories.map(theory => {
    const refs = Array.isArray(theory.citations) ? theory.citations : [];
    return {
      ...theory,
      citations: refs.map(ref => {
        const proposition = String(ref.proposition_supported || theory.title || theory.theory_type || "");
        return createCanonicalCitation(ref, proposition, pages, index) ?? unresolvedCitation(ref, 'THEORY_PROPOSITION_NOT_CERTIFIED');
      })
    };
  });
}

export function completedPerspectivesCitations<T extends Row>(
  perspectives: T[], findings: Row[], pages: MatterSourcePage[], index: Index,
): T[] {
  return perspectives.map(perspective => {
    const keyEvidence = Array.isArray(perspective.key_evidence) ? perspective.key_evidence : [];
    return {
      ...perspective,
      key_evidence: keyEvidence.map(ev => {
        if (!ev || !ev.citation) return ev;
        const proposition = String(ev.citation.proposition_supported || ev.description || perspective.perspective || "");
        const canonical = createCanonicalCitation(ev.citation, proposition, pages, index);
        return { ...ev, citation: canonical ?? unresolvedCitation(ev.citation, 'PERSPECTIVE_PROPOSITION_NOT_CERTIFIED') };
      })
    };
  });
}

export function writerCitationCatalog(refs: Row[], pages: MatterSourcePage[], index: Index): Row[] {
  const checked = refs.flatMap(ref => {
    const citation = createCanonicalCitation(ref, String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? ''), pages, index);
    return citation ? [citation] : [];
  });
  return [...new Map(checked.map(c => [c.document_id + ':' + c.page + ':' + citationText(c.quote), c])).values()]
    .map(c => ({ ...c, writer_ref_id: 'cite_' + sha256HexSync(JSON.stringify([
      c.canonical_source_id, c.document_id, c.page, citationText(c.proposition_supported), citationText(c.quote),
    ])).slice(0, 24) }));
}

/** The Writer names a verified catalog object, never a document/page pair.
 * Resolve the source identity and display page from that object only. A raw
 * Writer-authored [DOC N p.M] or an unsupported assertion is a producer error.
 * This is deliberately run before writing any generated report section.
 *
 * STRICT variant — throws on first violation. Use in test assertions and
 * contexts where a single bad token must abort the entire operation. */
export function resolveWriterCitationReferences<T>(
  value: T, catalog: Row[], validateAttribution?: (precedingText: string, citation: Row) => void,
): { value: T; citations: Row[] } {
  const referenced = new Map<string, Row>();
  const resolve = (part: unknown): unknown => {
    if (typeof part === 'string') {
      if (/\bDOC\s+\d+\s+p\.\s*\d+\b/i.test(part))
        throw new Error('REPORT_WRITER_CITATION_UNRESOLVED: raw document/page reference');
      return part.replace(/\[(?:CITE|DOC)\b[^\]]*\]/gi, (token, offset: number) => {
        const parsed = /^\[CITE\s+(cite_[a-f0-9]{24})\]$/i.exec(token);
        if (!parsed) throw new Error('REPORT_WRITER_CITATION_UNRESOLVED: ' + token);
        const matches = catalog.filter(c => c.writer_ref_id === parsed[1] && c.verification_status === 'verified');
        if (matches.length !== 1) throw new Error('REPORT_WRITER_CITATION_UNRESOLVED: ' + token);
        const citation = matches[0];
        const proposition = inlineCitationStatement(part.slice(0, offset));
        if (citationText(proposition) !== citationText(citation.proposition_supported) ||
          !Number.isSafeInteger(citation.doc_n) || !Number.isSafeInteger(citation.page))
          throw new Error('REPORT_WRITER_PROPOSITION_UNSUPPORTED: ' + token);
        validateAttribution?.(part.slice(Math.max(0, offset - 350), offset), citation);
        referenced.set(citation.writer_ref_id, citation);
        return `[DOC ${citation.doc_n} p.${citation.page}]`;
      });
    }
    if (Array.isArray(part)) return part.map(resolve);
    if (part && typeof part === 'object') return Object.fromEntries(Object.entries(part).map(([key, child]) =>
      [key, ['quote', 'source_quote', 'excerpt', 'proposition_supported', 'proposition_verification'].includes(key)
        ? child : resolve(child)]));
    return part;
  };
  return { value: resolve(value) as T, citations: [...referenced.values()] };
}

// ---------------------------------------------------------------------------
// QUARANTINE RESULT — returned by the SAFE resolver for every proposition
// that cannot be published. Never thrown. Callers use this to decide whether
// the surviving content can still form a valid report.
// ---------------------------------------------------------------------------
export interface WriterPropositionQuarantine {
  /** The citation token that was quarantined, e.g. "[CITE cite_4347267cac90…]" */
  token: string;
  /** Machine-readable reason code — never materia-specific. */
  reason:
    | 'CITATION_UNRESOLVED'
    | 'PROPOSITION_UNSUPPORTED'
    | 'RAW_PAGE_REFERENCE'
    | 'ATTRIBUTION_MISMATCH';
  /** Human-readable detail for the audit log. */
  detail: string;
  /** The sentence fragment that preceded this citation token, for context. */
  preceding_text: string;
  /** The path within the Writer output tree where this occurred. */
  path: string;
}

export interface SafeResolveResult<T> {
  value: T;
  citations: Row[];
  quarantined: WriterPropositionQuarantine[];
  /** True if ANY citation token was quarantined (but does NOT mean the report must be blocked). */
  has_quarantined: boolean;
}

/**
 * SAFE (quarantine-first) variant of resolveWriterCitationReferences.
 *
 * CONTRACT — universal across ALL materias (Familiar, Civil, Mercantil,
 * Laboral, Penal, Amparo, Administrativo, Fiscal, Agrario, Ambiental,
 * Electoral, Inmobiliario, Constitucional, Migratorio):
 *
 * - A verified, supported citation   → resolved to [DOC N p.M] and published.
 * - An unresolved citation token     → the [CITE …] token is stripped from the
 *   prose; the quarantine is recorded.
 * - An unsupported proposition       → same quarantine path. The Writer
 *   invented prose that the catalog cannot back; the token is stripped and
 *   quarantined. Citation identity (citation_id, document_id, page, quote,
 *   proposition_type, speaker_role) is preserved in the quarantine record and
 *   never re-used for a different proposition.
 * - A raw [DOC N p.M] reference      → stripped; quarantined.
 * - An attribution mismatch          → stripped; quarantined.
 *
 * THIS FUNCTION NEVER THROWS. The caller MUST then:
 *   1. Inspect quarantined items.
 *   2. Prune affected sentences via pruneQuarantinedSentences().
 *   3. Attempt deterministic reconstruction from surviving verified propositions.
 *   4. Recompute the citation appendix.
 *   5. Re-run the final-report contract.
 *   6. Release if still complete; BLOCK with exact reason if a mandatory
 *      proposition is irreparably missing.
 */
export function safeResolveWriterCitationReferences<T>(
  value: T,
  catalog: Row[],
  opts: {
    validateAttribution?: (precedingText: string, citation: Row) => void;
    /** Path prefix for quarantine records (e.g. "narrative", "memo"). */
    path?: string;
  } = {},
): SafeResolveResult<T> {
  const referenced = new Map<string, Row>();
  const quarantined: WriterPropositionQuarantine[] = [];
  const basePath = opts.path ?? '';

  const resolve = (part: unknown, currentPath: string): unknown => {
    if (typeof part === 'string') {
      // Raw [DOC N p.M] — writer invented a page reference directly.
      if (/\bDOC\s+\d+\s+p\.\s*\d+\b/i.test(part)) {
        for (const match of part.matchAll(/\bDOC\s+\d+\s+p\.\s*\d+\b/gi)) {
          quarantined.push({
            token: match[0], reason: 'RAW_PAGE_REFERENCE',
            detail: 'Writer emitted a raw [DOC N p.M] reference instead of a [CITE id] reference.',
            preceding_text: part.slice(Math.max(0, (match.index ?? 0) - 200), match.index ?? 0),
            path: currentPath,
          });
        }
        // Strip raw DOC refs and then process remaining [CITE …] tokens.
        const stripped = part.replace(/\[?DOC\s+\d+\s+p\.\s*\d+\]?/gi, '');
        return resolve(stripped, currentPath);
      }

      return part.replace(/\[(?:CITE|DOC)\b[^\]]*\]/gi, (token, offset: number) => {
        const parsed = /^\[CITE\s+(cite_[a-f0-9]{24})\]$/i.exec(token);
        if (!parsed) {
          quarantined.push({
            token, reason: 'CITATION_UNRESOLVED',
            detail: 'Writer emitted an unrecognised citation token that is not in the verified catalog.',
            preceding_text: part.slice(Math.max(0, offset - 200), offset),
            path: currentPath,
          });
          return '';
        }

        const matches = catalog.filter(c => c.writer_ref_id === parsed[1] && c.verification_status === 'verified');
        if (matches.length !== 1) {
          quarantined.push({
            token, reason: 'CITATION_UNRESOLVED',
            detail: `Citation ${parsed[1]} not found in verified catalog (found ${matches.length} matches).`,
            preceding_text: part.slice(Math.max(0, offset - 200), offset),
            path: currentPath,
          });
          return '';
        }

        const citation = matches[0];
        const proposition = inlineCitationStatement(part.slice(0, offset));

        if (citationText(proposition) !== citationText(citation.proposition_supported) ||
            !Number.isSafeInteger(citation.doc_n) || !Number.isSafeInteger(citation.page)) {
          quarantined.push({
            token, reason: 'PROPOSITION_UNSUPPORTED',
            detail: `Writer proposition "${proposition.slice(0, 120)}" does not match verified proposition_supported "${citationText(citation.proposition_supported).slice(0, 120)}" for ${parsed[1]}.`,
            preceding_text: part.slice(Math.max(0, offset - 350), offset),
            path: currentPath,
          });
          return '';
        }

        // Attribution check — quarantine without throwing.
        if (opts.validateAttribution) {
          try {
            opts.validateAttribution(part.slice(Math.max(0, offset - 350), offset), citation);
          } catch (e) {
            quarantined.push({
              token, reason: 'ATTRIBUTION_MISMATCH',
              detail: e instanceof Error ? e.message : String(e),
              preceding_text: part.slice(Math.max(0, offset - 350), offset),
              path: currentPath,
            });
            return '';
          }
        }

        referenced.set(citation.writer_ref_id, citation);
        return `[DOC ${citation.doc_n} p.${citation.page}]`;
      });
    }

    if (Array.isArray(part)) return part.map((item, i) => resolve(item, `${currentPath}[${i}]`));
    if (part && typeof part === 'object') {
      return Object.fromEntries(Object.entries(part).map(([key, child]) => [
        key,
        ['quote', 'source_quote', 'excerpt', 'proposition_supported', 'proposition_verification'].includes(key)
          ? child
          : resolve(child, currentPath ? `${currentPath}.${key}` : key),
      ]));
    }
    return part;
  };

  const resolved = resolve(value, basePath) as T;
  return {
    value: resolved,
    citations: [...referenced.values()],
    quarantined,
    has_quarantined: quarantined.length > 0,
  };
}

// ---------------------------------------------------------------------------
// PARAGRAPH PRUNING — removes sentences that still reference stripped tokens
// (empty [] brackets) after quarantine. Operates on already-resolved strings.
// Called on every prose string before it is merged into the final report.
// ---------------------------------------------------------------------------

/** Remove empty citation stubs ([] brackets) from any prose string, and remove
 * sentences that consist only of whitespace or such stubs after stripping.
 * A sentence with substantive text is always preserved, including its whitespace. */
export function pruneQuarantinedSentences(text: string): string {
  if (!text) return text;
  // First pass: strip all empty bracket stubs globally.
  const cleaned = text.replace(/\[\s*\]/g, '').replace(/[ \t]{2,}/g, ' ');
  if (!cleaned.trim()) return '';
  // Second pass: remove any sentence fragments that are now entirely whitespace.
  // Split preserving the sentence-ending whitespace so the output can be re-joined cleanly.
  const sentences = cleaned.split(/((?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ""]))/);
  const kept: string[] = [];
  for (const seg of sentences) {
    if (seg.trim().length > 0) kept.push(seg);
  }
  return kept.join('').trim();
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

