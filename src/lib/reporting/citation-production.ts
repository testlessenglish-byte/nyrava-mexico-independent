import { auditSourceLocations } from './source-location-audit';
import { sha256HexSync } from '../intelligence/sha256';
import { evaluateClaimEntailment } from '../intelligence/claim-evidence-entailment';
import { supportInput, type SupportClaim, type SupportVerdict } from '../intelligence/claim-support-review';
import type { MatterSourcePage } from '../intelligence/source-matter-audit';
import { decisionCoreAtoms } from '../intelligence/mandatory-decision-core';
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
  return findings.flatMap(f => f.metadata?.semantic_support_review && isClaimReportable(f) ? [{
    claim: Object.fromEntries(['id','case_id','execution_id','title','description','source_document_id','source_page','source_quote',
      'speaker_role','proposition_type','adoption_status','legal_significance','potential_impact','rationale',
      'audit_classification','finding_type','authority_level'].filter(k => f[k] !== undefined || k === 'execution_id' && f.metadata?.execution_id !== undefined)
      .map(k => [k, k === 'execution_id' ? f.execution_id ?? f.metadata?.execution_id : f[k]])) as SupportClaim,
    review: f.metadata.semantic_support_review,
  }] : []);
}
export const citationText = (s: unknown) => typeof s === 'string' ? s.normalize('NFC').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?]$/, '') : '';

function isClaimReportable(value: Row): boolean {
  if (String(value.verification_status ?? '').toLowerCase() === 'quarantined') return false;
  const diagnostic = value.metadata?.claim_entailment_diagnostic ?? value.claim_entailment_diagnostic;
  if (diagnostic == null) return true;
  return diagnostic.final_reportable === true && diagnostic.claim_action === 'KEEP' &&
    diagnostic.entailment_status === 'ENTAILED';
}

/** Retain evidence for diagnosis without letting an uncertified reference look published. */
export function unresolvedCitation(ref: Row, reason: string): Row {
  return { ...ref, verification_status: 'unverified', publication_status: 'QUARANTINED',
    source_location_verified: false, certification_error: reason };
}

/** Re-use an existing semantic review only for its exact claim and source input.
 * A verified flag or lexical overlap is never semantic proof. */
export function citationPropositionVerified(ref: Row, proposition: string, pages: MatterSourcePage[], trustedReviews: PropositionReview[] = []): boolean {
  if (!isClaimReportable(ref)) return false;
  const quote = String(ref.quote ?? '');
  if (!proposition || !quote) return false;
  if (citationText(proposition) === citationText(quote) || citationText(quote).includes(citationText(proposition))) {
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
  const debugInput = supportInput(claim, pages);
  console.warn("[citation-proof-debug]", JSON.stringify({ finding_id: claim.id, document_id: claim.source_document_id, page: claim.source_page, stored_hash: review.hash, calculated_hash: debugInput.hash, hash_match: debugInput.hash === review.hash, supporting_quote_in_context: typeof review.supporting_quote === "string" && debugInput.context.includes(review.supporting_quote.normalize("NFC").replace(/\s+/g, " ").trim()), quote_match: citationText(claim.source_quote) === citationText(quote), proposition_match: citationText(claim.description) === citationText(proposition), trusted_review_count: trustedReviews.length }));
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
export function createCanonicalCitation(
  ref: Row,
  proposition: string,
  pages: MatterSourcePage[],
  index: Index,
  proof?: PropositionReview,
  options: { allowTrustedRecertification?: boolean } = {},
): Row | null {
  const trustedRecertification = options.allowTrustedRecertification === true && proof != null;
  if (!isClaimReportable(ref) ||
      (!trustedRecertification && ref.publication_status === 'QUARANTINED') ||
      (!trustedRecertification && ref.verification_status != null && ref.verification_status !== 'verified')) return null;
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
  if (trustedRecertification) {
    delete result.publication_status;
    delete result.certification_error;
  }
  return { ...result, writer_ref_id: 'cite_' + sha256HexSync(JSON.stringify([result.canonical_source_id, result.document_id, result.page, citationText(result.proposition_supported), citationText(result.quote)])).slice(0, 24) };
}

export function completedCoreCitations<T extends { id: string; text: string; source_refs: Row[] }>(
  core: T[], findings: Row[], pages: MatterSourcePage[], index: Index, registry: Row[] = [],
): T[] {
  const reviews = findingCitationReviews(findings);
  return core.map(item => {
    const atoms = decisionCoreAtoms(item.text);
    const source_refs = item.source_refs.flatMap(ref => {
      const document = ref.document_id ?? ref.doc_id ?? ref.source_document_id;
      const page = ref.page ?? ref.page_number ?? ref.source_page;
      const quote = citationText(ref.quote ?? ref.source_quote);
      const bound = atoms.flatMap(atom => {
        const canonical = registry.find(c => c.document_id === document && c.page === page &&
          citationText(c.quote) === quote && citationText(c.proposition_supported) === citationText(atom) &&
          (!ref.canonical_source_id || ref.canonical_source_id === c.canonical_source_id) &&
          (!ref.execution_id || ref.execution_id === c.execution_id) &&
          c.verification_status === 'verified' && c.publication_status !== 'QUARANTINED' &&
          c.source_location_verified === true && auditSourceLocations([c], pages, index).ok &&
          citationPropositionVerified(c, atom, pages, reviews));
        // Reuse the authoritative object, including its identity and full proof.
        if (canonical) return [canonical];
        const proof = reviews.find(p => citationText(p.claim.description) === citationText(atom) &&
          p.claim.source_document_id === document && p.claim.source_page === page &&
          citationText(p.claim.source_quote) === quote && findings.some(f => f.id === p.claim.id &&
            f.metadata?.mandatory_decision_core_id === item.id));
        const certified = createCanonicalCitation(ref, atom, pages, index, proof, { allowTrustedRecertification: Boolean(proof) });
        if (!certified) return [];
        registry.push(certified);
        return [certified];
      });
      return bound.length ? bound : [unresolvedCitation(ref, 'CORE_PROPOSITION_NOT_CERTIFIED')];
    });
    // A valid A cannot hide a missing or unsupported B.
    const missing = atoms.filter(atom => !source_refs.some(ref =>
      ref.verification_status === 'verified' && citationText(ref.proposition_supported) === citationText(atom)));
    return { ...item, source_refs, ...(missing.length ? { certification_error: 'CORE_PROPOSITION_NOT_CERTIFIED' } : {}) };
  });
}

export function completedFindingsCitations<T extends Row>(
  findings: T[], pages: MatterSourcePage[], index: Index,
): T[] {
  return findings.map(finding => {
    const refs = Array.isArray(finding.evidence_refs) ? finding.evidence_refs : [];
    return {
      ...finding,
      evidence_refs: refs.map(ref => {
        const refDocument = ref.document_id ?? ref.source_document_id;
        const refPage = ref.page ?? ref.page_number ?? ref.source_page;
        const refQuote = ref.quote ?? ref.excerpt ?? ref.source_quote ?? "";
        const matchesReviewedFinding =
          refDocument === finding.source_document_id &&
          Number(refPage) === Number(finding.source_page) &&
          citationText(refQuote) === citationText(finding.source_quote);

        const atomicProof = matchesReviewedFinding && finding.metadata?.semantic_support_review ? {
          claim: Object.fromEntries(
            ['id','title','description','source_document_id','source_page','source_quote']
              .filter(k => finding[k] !== undefined)
              .map(k => [k, finding[k]])
          ),
          review: finding.metadata.semantic_support_review
        } as PropositionReview : undefined;

        const proposition = String(
          ref.proposition_supported ??
          (matchesReviewedFinding && atomicProof ? finding.description : "")
        );
        return proposition
          ? createCanonicalCitation(ref, proposition, pages, index, atomicProof) ??
              unresolvedCitation(ref, "FINDING_PROPOSITION_NOT_CERTIFIED")
          : unresolvedCitation(ref, "FINDING_PROPOSITION_MISSING");
      })
    };
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
        const quote = String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? "");
        const atomicFinding = findings.find(f => Array.isArray(f.evidence_refs) && f.evidence_refs.some((r) =>
          r.document_id === ref.document_id && citationText(r.quote) === citationText(quote)));
        const authoritativeRef = atomicFinding?.evidence_refs?.find((r: Row) =>
          r.document_id === ref.document_id && citationText(r.quote) === citationText(quote));
        const atomicProof = atomicFinding && atomicFinding.metadata?.semantic_support_review ? { claim: Object.fromEntries(["id","title","description","source_document_id","source_page","source_quote"].filter(k => atomicFinding[k] !== undefined).map(k => [k, atomicFinding[k]])), review: atomicFinding.metadata.semantic_support_review } : undefined;
        const proposition = String(ref.proposition_supported || theory.title || theory.theory_type || "");
        const sourceRef = authoritativeRef ?? ref;
        return createCanonicalCitation(sourceRef, proposition, pages, index, atomicProof) ?? unresolvedCitation(ref, "THEORY_PROPOSITION_NOT_CERTIFIED");
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
        const quote = String(ev.citation.quote ?? ev.citation.excerpt ?? ev.citation.source_quote ?? "");
        const atomicFinding = findings.find(f => Array.isArray(f.evidence_refs) && f.evidence_refs.some((r) =>
          r.document_id === ev.citation.document_id && citationText(r.quote) === citationText(quote)));
        const authoritativeRef = atomicFinding?.evidence_refs?.find((r: Row) =>
          r.document_id === ev.citation.document_id && citationText(r.quote) === citationText(quote));
        const atomicProof = atomicFinding && atomicFinding.metadata?.semantic_support_review ? { claim: Object.fromEntries(["id","title","description","source_document_id","source_page","source_quote"].filter(k => atomicFinding[k] !== undefined).map(k => [k, atomicFinding[k]])), review: atomicFinding.metadata.semantic_support_review } : undefined;
        const sourceRef = authoritativeRef ?? ev.citation;
        const canonical = createCanonicalCitation(sourceRef, proposition, pages, index, atomicProof);
        return { ...ev, citation: canonical ?? unresolvedCitation(ev.citation, "PERSPECTIVE_PROPOSITION_NOT_CERTIFIED") };
      })
    };
  });
}

export function writerCitationCatalog(
  refs: Row[], pages: MatterSourcePage[], index: Index, findings: Row[] = [],
  scope: { caseId?: string; executionId?: string } = {},
): Row[] {
  const reviews = findingCitationReviews(findings);
  const checked = refs.flatMap(ref => {
    if (scope.caseId && ref.case_id != null && ref.case_id !== scope.caseId) return [];
    if (scope.executionId && ref.execution_id != null && ref.execution_id !== scope.executionId) return [];
    if (ref.verification_status === 'verified' && ref.publication_status !== 'QUARANTINED' &&
        ref.source_location_verified === true && ref.proposition_supported &&
        auditSourceLocations([ref], pages, index).ok &&
        citationPropositionVerified(ref, ref.proposition_supported, pages, reviews)) {
      const registered = index.find(doc => doc.document_id === (ref.document_id ?? ref.source_document_id));
      if (!registered?.canonical_source_id || ref.canonical_source_id && ref.canonical_source_id !== registered.canonical_source_id) return [];
      if (ref.canonical_source_id === registered.canonical_source_id &&
          (!scope.caseId || ref.case_id === scope.caseId) && (!scope.executionId || ref.execution_id === scope.executionId)) return [ref];
      return [{ ...ref, canonical_source_id: registered.canonical_source_id,
        ...(scope.caseId ? { case_id: scope.caseId } : {}), ...(scope.executionId ? { execution_id: scope.executionId } : {}) }];
    }

    // Prefer a finding's exact current semantic review over the literal quote.
    // The review is eligible only when its source coordinates and quote match
    // this reference and its stable finding link (when present) is exact.
    const document = ref.document_id ?? ref.doc_id ?? ref.source_document_id;
    const page = ref.page ?? ref.page_number ?? ref.source_page;
    const quote = citationText(ref.quote ?? ref.excerpt ?? ref.source_quote);
    const linkedFinding = findings.find(f => {
      if (ref.finding_id != null && f.id !== ref.finding_id) return false;
      if (ref.claim_id != null && f.id !== ref.claim_id) return false;
      if (scope.executionId && (f.execution_id ?? f.metadata?.execution_id) !== scope.executionId) return false;
      return f.id != null && Array.isArray(f.evidence_refs) && f.evidence_refs.some((e: Row) =>
        (e.document_id ?? e.source_document_id) === document &&
        Number(e.page ?? e.source_page) === Number(page) &&
        citationText(e.quote ?? e.source_quote ?? e.excerpt) === quote);
    });
    const proof = reviews.find(candidate =>
      (!ref.finding_id && !ref.claim_id || candidate.claim.id === (ref.finding_id ?? ref.claim_id)) &&
      (!linkedFinding || candidate.claim.id === linkedFinding.id) &&
      candidate.claim.source_document_id === document && Number(candidate.claim.source_page) === Number(page) &&
      citationText(candidate.claim.source_quote) === quote &&
      (!scope.executionId || candidate.claim.execution_id === scope.executionId));
    const proposition = proof?.claim.description;
    const citation = proof && proposition
      ? createCanonicalCitation({ ...ref, document_id: document, page, quote }, proposition, pages, index, proof, { allowTrustedRecertification: true })
      : createCanonicalCitation(ref, String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? ''), pages, index);
    if (citation && scope.executionId && citation.execution_id != null && citation.execution_id !== scope.executionId) return [];
    if (citation && scope.caseId && citation.case_id != null && citation.case_id !== scope.caseId) return [];
    return citation ? [{ ...citation, ...(scope.caseId ? { case_id: scope.caseId } : {}), ...(scope.executionId ? { execution_id: scope.executionId } : {}) }] : [];
  });
  return [...new Map(checked.map(c => [JSON.stringify([c.document_id, c.page,
    citationText(c.quote), citationText(c.proposition_supported)]), c])).values()];
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

