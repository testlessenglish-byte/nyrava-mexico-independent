import type { CaseExportData } from '../export';
import type { MatterSourcePage } from '../intelligence/source-matter-audit';
import { createCanonicalCitation, citationPropositionVerified, findingCitationReviews, reviewedAttributionMatches, type PropositionReview } from './citation-production';
import { auditSourceLocations } from './source-location-audit';
import { attributeCivilProposition } from '../civil/proposition-attribution';
import { sha256HexSync } from '../intelligence/sha256';
import { decisionCoreAtoms } from '../intelligence/mandatory-decision-core';
import { supportInput, type SupportClaim } from '../intelligence/claim-support-review';

type Row = Record<string, any>;
const obj = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const normalized = (value: string) => value.normalize('NFC').replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?]$/, '');
const assertion = (value: unknown) => text(value).replace(/\[DOC\s+[^\]]+\]/gi, '').trim();

// Reconstruct only the existing Civil subscriber view for proof comparison.
// Keep this export-boundary projection local; Civil analysis code is unchanged.
function projectCivilFinding(f: Row, pages: MatterSourcePage[]): Row {
  const canonical = attributeCivilProposition(f, pages);
  const labels: Record<string,string> = { PARTY_ALLEGATION:'Alegación de parte', COURT_HOLDING:'Determinación del órgano emisor', LOWER_COURT_HOLDING:'Determinación del órgano de origen', DOCUMENTED_FACT:'Hecho documentado', PROCEDURAL_HISTORY:'Antecedente procesal', EXPERT_OPINION:'Opinión pericial', NYRAVA_INFERENCE:'Inferencia de NYRAVA', UNRESOLVED:'Atribución pendiente de verificar' };
  const label=labels[canonical.attribution_type],party=canonical.attribution_type==='PARTY_ALLEGATION',unresolved=canonical.attribution_type==='UNRESOLVED';
  const metadata={...f.metadata};delete metadata.published_claim;
  return {...f,canonical_attribution:canonical,attribution_type:canonical.attribution_type,
    speaker_role:party?'party':canonical.attribution_type==='COURT_HOLDING'?'reviewing_court':canonical.attribution_type==='LOWER_COURT_HOLDING'?'lower_court':unresolved?'unresolved':canonical.speaker,
    speaker_role_label:label,metadata,title:label+': '+(canonical.source_verified?canonical.supporting_excerpt:'revisar la fuente del hallazgo'),
    description:unresolved?'Atribución pendiente de verificar en la fuente; no se presenta como hecho establecido.':canonical.safe_proposition,
    legal_significance:'Alcance limitado a la atribución verificada: '+label+'.',potential_impact:'El efecto jurídico requiere verificación independiente de autoridad y contexto aplicables.',canonical_actions:[],
    ...(party?{proposition_type:'party_argument',content_class:'PARTY_ARGUMENT',adoption_status:'party_position'}:{})};
}

/** A publication view may omit strategy and label an unknown speaker, but it
 * cannot alter the reviewed claim. Validate the original proof first, then
 * compare the current view to ONLY those deterministic display changes. Never
 * replace a stored review hash or borrow verification for changed content. */
function publicationReviewMatches(finding: Row, proof: PropositionReview, pages: MatterSourcePage[], payload: CaseExportData): boolean {
  if (proof.review.version !== 1 || proof.review.verdict !== 'supported' ||
      supportInput(proof.claim, pages).hash !== proof.review.hash) return false;
  if (supportInput(finding as SupportClaim, pages).hash === proof.review.hash) return true;
  const view = (payload as Row).report_presentation;
  const civil = finding.canonical_attribution != null;
  if (!civil && !view?.capability) return false;
  const projected = civil ? projectCivilFinding(proof.claim, pages) : { ...proof.claim };
  // Final presentation restores the ORIGINAL reviewed core speaker only when
  // the same authoritative core atom has the same source binding. An unresolved
  // Civil notice cannot authorize a new court identity.
  if (civil && projected.canonical_attribution?.attribution_type === 'UNRESOLVED' &&
      finding.speaker_role === proof.claim.speaker_role &&
      rows(obj(obj(payload.report).full_report).mandatory_decision_core?.items).some(item =>
        item.id === finding.metadata?.mandatory_decision_core_id && item.speaker_role === proof.claim.speaker_role &&
        normalized(text(item.text)) === normalized(text(proof.claim.description)) && rows(item.source_refs).some(ref =>
          ref.document_id === proof.claim.source_document_id && ref.page === proof.claim.source_page &&
          normalized(text(ref.quote)) === normalized(text(proof.claim.source_quote)))))
    projected.speaker_role = proof.claim.speaker_role;
  if (view?.capability && !view.capability.strategic_recommendations_allowed) delete projected.potential_impact;
  // Both representations explicitly retain UNKNOWN attribution; no court or
  // party identity can be inferred by this display conversion.
  if (projected.speaker_role == null) projected.speaker_role = 'unresolved';
  // Existing presentation names a party allegation 'party_argument'. The party
  // and its non-adopted status must be retained; all other fields remain hash-bound.
  if (view?.capability && projected.proposition_type === 'allegation' &&
      projected.adoption_status === 'party_position' &&
      /^(?:quejoso|quejosa|actor|actora|defensa|party|parte_actora)$/i.test(String(projected.speaker_role)))
    projected.proposition_type = 'party_argument';
  return supportInput(finding as SupportClaim, pages).hash === supportInput(projected, pages).hash;
}

function publicationFindingOwners(payload: CaseExportData): Set<Row> {
  const findings = rows(payload.findings), owners = new Set(findings);
  for (const card of rows((payload as Row).report_presentation?.finding_cards)) {
    const finding = obj(card.finding);
    owners.add(finding);
  }
  return owners;
}
function inlineAssertion(before: string): string {
  const trimmed = before.trim();
  const quoted = /[“"]([^“”"]+)[”"]$/.exec(trimmed);
  if (quoted) {
    const prefix = trimmed.slice(0, quoted.index);
    // A generated standalone quotation may follow a paragraph or a previous
    // complete sentence/reference. Never discard a substantive speech/negation
    // prefix such as "No es cierto que" or "El actor sostuvo que".
    if (!prefix.trim() || /\n\s*\n$/.test(prefix) || /[.!?\]]\s*$/.test(prefix)) return quoted[1].trim();
    return trimmed;
  }
  const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡“"])/);
  const last = sentences.at(-1) ?? '';
  const previous = sentences.at(-2) ?? '';
  return /^(?:PRIMERO|SEGUNDO|TERCERO|CUARTO|QUINTO)\.$/.test(previous)
    ? `${previous} ${last}` : last;
}
export const PENDING_CITATION_TEXT = 'Referencia localizada; transcripción/verificación pendiente';
const placeholder = /cita documental referenciada en el texto|referencia localizada;\s*transcripci[oó]n\/verificaci[oó]n pendiente|\[(?:cita|quote|excerpt|pendiente)\]|lorem ipsum/i;
const diagnosticKeys = new Set(['metadata', 'proposition_verification', 'pre_release_source_pages', 'pre_release_validation', 'citation_audit',
  'raw_findings', 'reconciled_findings', 'quarantined_findings', 'withheld_findings', 'merged_findings',
  'source_location_audit', 'claim_entailment_audit', 'final_review', 'qa_statuses', 'canonical_sources', 'render_output',
  'writer_proposition_quarantine']);
const fullContentKeys = new Set(['prose', 'final_published_claims', 'mandatory_decision_core', 'decision_reconstruction',
  'contradictions', 'legal_memorandum', 'cross_examination', 'executive_summary', 'recommendations']);

/** Only an exactly reconstructed Civil attribution label may wrap the literal
 * assertion. Recompute the speaker/type from the source instead of trusting a
 * caller-supplied safe_proposition, prefix, or source_verified flag. */
function publishedAssertion(parent: Row, ref: Row, pages: MatterSourcePage[], index: Array<{document_id: string; doc_n: number}>): string {
  const stated = assertion(parent.claim_text ?? parent.description ?? parent.text);
  const canonical = obj(parent.canonical_attribution);
  const quote = text(ref.quote ?? ref.excerpt ?? ref.source_quote);
  const pending = canonical.attribution_type === 'UNRESOLVED' &&
    parent.description === 'Atribución pendiente de verificar en la fuente; no se presenta como hecho establecido.';
  if ((!pending && parent.description !== canonical.safe_proposition) || canonical.source_verified !== true ||
      canonical.supporting_excerpt !== quote || !quote ||
      !['COURT_HOLDING', 'LOWER_COURT_HOLDING', 'PARTY_ALLEGATION', 'DOCUMENTED_FACT', 'PROCEDURAL_HISTORY', 'EXPERT_OPINION', 'UNRESOLVED'].includes(canonical.attribution_type)) return stated;
  const actual = attributeCivilProposition(parent, pages);
  if (!actual.source_verified || (!pending && actual.safe_proposition !== parent.description) ||
      actual.speaker !== canonical.speaker || actual.attribution_type !== canonical.attribution_type ||
      actual.source_document !== canonical.source_document || actual.source_page !== canonical.source_page ||
      actual.supporting_excerpt !== quote) return stated;
  const location = auditSourceLocations([{...ref, document_id:ref.document_id ?? ref.source_document_id,
    page:ref.page ?? ref.source_page, quote}], pages, index);
  if (!location.ok || location.verified[0]?.document_id !== canonical.source_document ||
      location.verified[0]?.page !== canonical.source_page) return stated;
  // A separate claim_text/text must not hide behind the description's label.
  if (parent.claim_text != null && assertion(parent.claim_text) !== assertion(parent.description)) return stated;
  return quote;
}

/** Presentation replaced the assertion with a source-attribution wrapper.
 * Produce new literal references for that exact source-backed wrapper; never
 * reuse verification of the previous paraphrase for newly rendered text. */
export function bindAttributedFindingCitations(payload: CaseExportData): void {
  const pages = rows(obj(obj(payload.report).full_report).pre_release_source_pages) as MatterSourcePage[];
  const index = payload.documents.map((d, i) => ({ document_id: String(d.id),
    doc_n: Number(d.doc_n ?? i + 1), canonical_source_id: text(d.canonical_source_id) }));
  for (const finding of rows(payload.findings)) {
    if (!finding.canonical_attribution) continue;
    finding.evidence_refs = rows(finding.evidence_refs).map(ref => {
      const proposition = publishedAssertion(finding, ref, pages, index);
      if (normalized(proposition) !== normalized(text(ref.quote))) return ref;
      return createCanonicalCitation(ref, proposition, pages, index) ?? ref;
    });
    const primary = rows(finding.evidence_refs).find(r => normalized(text(r.quote)) === normalized(text(finding.source_quote)));
    if (primary && normalized(text(primary.proposition_supported)) === normalized(text(finding.source_quote))) {
      finding.proposition_supported = primary.proposition_supported;
    }
  }
}

/** Fail closed: lexical entailment is a rejection filter, never semantic proof.
 * Automatic approval is limited to the same complete proposition as the literal
 * excerpt. Paraphrases need independent review; this audit never invents one. */
function supported(proposition: string, quote: string, ref: Row, pages: MatterSourcePage[] = [], reviews: PropositionReview[] = []): boolean {
  return citationPropositionVerified({ ...ref, quote }, proposition, pages, reviews);
}

/** Audits only subscriber content. Raw source pages and retained diagnostics
 * supply evidence but cannot become extra published claims by traversal. */
export function auditReportCitationIntegrity(payload: CaseExportData) {
  const report = obj(payload.report), full = obj(report.full_report);
  const pages = rows(full.pre_release_source_pages) as MatterSourcePage[];
  // composeFinalReportPayload snapshots DB findings before presentation changes.
  // Neither a writer citation nor full_report can supply this trust registry.
  const reviews = (payload as Row).citation_review_registry ?? findingCitationReviews(rows(payload.findings));
  const index = payload.documents.map((doc, i) => ({ document_id: String(doc.id ?? doc.document_id ?? ''),
    doc_n: Number(doc.doc_n ?? i + 1), canonical_source_id: text(doc.canonical_source_id) }));
  const owners = publicationFindingOwners(payload);
  const errors: string[] = [], verified: Row[] = [], unresolved: Row[] = [];
  const coreItems = rows(obj(full.mandatory_decision_core).items);
  const isCore = (parent: Row) => coreItems.some(item => item === parent ||
    item.id === parent.id && item.text === parent.text && item.kind === parent.kind);
  for (const item of coreItems) {
    for (const atom of decisionCoreAtoms(text(item.text))) {
      if (!rows(item.source_refs).some(ref => ref.verification_status === 'verified' &&
          ref.publication_status !== 'QUARANTINED' && normalized(text(ref.proposition_supported)) === normalized(atom)))
        errors.push(`citation_integrity:mandatory_decision_core:${item.id}:atomic_binding_missing`);
    }
  }
  for (const card of rows((payload as Row).report_presentation?.finding_cards)) {
    const finding = obj(card.finding);
    if (!rows(payload.findings).some(f => f.id === finding.id && f.case_id === finding.case_id &&
        (f.execution_id ?? f.metadata?.execution_id) === (finding.execution_id ?? finding.metadata?.execution_id)))
      errors.push('citation_integrity:report_presentation.finding_cards:finding_owner_missing');
  }
  let checked = 0;
  const auditRef = (raw: Row, path: string, parent: Row = {}) => {
    checked++;
    const ref: Row = { ...raw, document_id: raw.document_id ?? raw.source_document_id,
      page: raw.page ?? raw.source_page, quote: text(raw.quote ?? raw.excerpt ?? raw.source_quote) };
    const proposition = text(raw.proposition_supported);
    const reasons: string[] = [];
    if (owners.has(parent)) {
      if (!rows(payload.findings).some(f => f.id === parent.id && f.case_id === parent.case_id &&
          (f.execution_id ?? f.metadata?.execution_id) === (parent.execution_id ?? parent.metadata?.execution_id)))
        reasons.push('finding_owner_missing');
      const linkedId = raw.finding_id ?? raw.claim_id ?? raw.proposition_id;
      if (linkedId != null && linkedId !== parent.id) reasons.push('finding_ownership_mismatch');
      if (payload.case?.id && parent.case_id !== payload.case.id) reasons.push('finding_case_mismatch');
      if (payload.case?.execution_id && (parent.execution_id ?? parent.metadata?.execution_id) !== payload.case.execution_id ||
          parent.metadata?.execution_id != null && payload.case?.execution_id && parent.metadata.execution_id !== payload.case.execution_id)
        reasons.push('finding_execution_mismatch');
      if (parent.verification_status != null && parent.verification_status !== 'verified') reasons.push('finding_unverified');
      const proof = reviews.find((review: PropositionReview) => review.claim.id === parent.id);
      if ((proof || parent.metadata?.semantic_support_review || raw.proposition_verification) &&
          (!proof || !publicationReviewMatches(parent, proof, pages, payload))) reasons.push('finding_review_stale');
    }
    if (raw.publication_status === 'QUARANTINED') reasons.push('citation_quarantined');
    if (raw.execution_id && raw.execution_id !== payload.case?.execution_id) reasons.push('citation_execution_mismatch');
    if (raw.case_id && raw.case_id !== payload.case?.id) reasons.push('citation_case_mismatch');
    const excerpts = [raw.quote, raw.excerpt, raw.source_quote].filter(v => v != null).map(v => normalized(text(v)));
    if (new Set(excerpts).size > 1) reasons.push('conflicting_excerpt_aliases');
    if (!ref.quote || placeholder.test(ref.quote)) reasons.push('excerpt_missing_or_placeholder');
    if (!proposition) reasons.push('proposition_supported_missing');
    if (String(raw.verification_status ?? '').toLowerCase() !== 'verified') reasons.push('verification_pending');
    const canonicalSource = index.find(doc => doc.document_id === ref.document_id)?.canonical_source_id;
    if (!canonicalSource || raw.canonical_source_id && canonicalSource !== raw.canonical_source_id)
      reasons.push('canonical_source_identity_unverified');
    const location = auditSourceLocations([ref], pages, index);
    if (!location.ok) reasons.push('source_location_unverified');
    if (proposition && ref.quote && !supported(proposition, ref.quote, ref, pages, reviews)) reasons.push('proposition_not_supported');
    if (ref.proposition_verification && normalized(proposition) !== normalized(ref.quote) &&
      !reviewedAttributionMatches(parent, ref.proposition_verification.claim ?? {})) reasons.push('reviewed_attribution_mismatch');
    const asserted = publishedAssertion(parent, ref, pages, index);
    const assertions = isCore(parent) ? decisionCoreAtoms(asserted) : [asserted];
    if (asserted && proposition && !assertions.some(atom => normalized(atom) === normalized(proposition))) reasons.push('published_proposition_mismatch');
    if (reasons.length) {
      errors.push(...reasons.map(reason => `citation_integrity:${path}:${reason}`));
      unresolved.push({ path, ...ref, verification_status: 'unverified', reasons });
    } else verified.push({ ...location.verified[0], proposition_supported: proposition });
  };
  const annex = rows(report.citations);
  const inline = (value: string, path: string) => {
    if (placeholder.test(value)) errors.push(`citation_integrity:${path}:placeholder`);
    for (const match of value.matchAll(/\[(DOC\s+[^\]]+)\]/gi)) {
      const pairs = [...match[1].matchAll(/DOC\s+(\d+)(?:\s*p\.\s*(\d+))?/gi)];
      if (!pairs.length) errors.push(`citation_integrity:${path}:inline_reference_unresolved`);
      const before = value.slice(0, match.index).trim();
      const sentence = inlineAssertion(before);
      // A completed review may certify a compound paragraph as one claim.
      // Accept that exact complete assertion as well as a single sentence;
      // all referenced propositions still undergo source/proof auditing.
      const paragraph = before.split(/\n\s*\n/).at(-1)?.trim() ?? '';
      for (const pair of pairs) {
        const matches = annex.filter(ref => Number(ref.doc_n) === Number(pair[1]) && pair[2] &&
          Number(ref.page ?? ref.page_number) === Number(pair[2]));
        if (!matches.length) errors.push(`citation_integrity:${path}:inline_reference_unresolved`);
        else if (!matches.some(ref => [sentence, paragraph].some(candidate =>
          normalized(text(ref.proposition_supported)) === normalized(candidate))))
          errors.push(`citation_integrity:${path}:inline_proposition_not_supported`);
      }
    }
  };
  const walk = (value: unknown, path: string, key = '', parent: Row = {}) => {
    if (diagnosticKeys.has(key)) return;
    if (typeof value === 'string') { if (!['quote', 'excerpt', 'source_quote'].includes(key)) inline(value, path); return; }
    if (Array.isArray(value)) {
      value.forEach((entry, i) => ['citations', 'evidence_refs', 'source_refs'].includes(key)
        ? auditRef(obj(entry), `${path}[${i}]`, parent) : walk(entry, `${path}[${i}]`));
      return;
    }
    const row = obj(value);
    if (['citation', 'source_ref', 'evidence_ref'].includes(key) && Object.keys(row).length) {
      auditRef(row, path, parent);
      return;
    }
    if (row.source_quote !== undefined) {
      const matching = ['evidence_refs', 'source_refs', 'citations'].flatMap(k => rows(row[k])).find(ref =>
        normalized(text(ref.quote ?? ref.excerpt ?? ref.source_quote)) === normalized(text(row.source_quote)));
      auditRef({ ...matching, ...row, document_id: row.source_document_id ?? row.document_id ?? matching?.document_id,
        page: row.source_page ?? row.page ?? matching?.page, quote: row.source_quote }, path, row);
    }
    for (const [k, child] of Object.entries(row)) {
      if (k === 'full_report') {
        for (const [fullKey, content] of Object.entries(obj(child)))
          if (fullContentKeys.has(fullKey)) walk(content, `${path}.full_report.${fullKey}`, fullKey, obj(child));
      } else walk(child, `${path}.${k}`, k, row);
    }
  };
  // Audit every section supplied to the publication renderers, including
  // cards with rejected or absent certification. Diagnostics remain excluded.
  walk(report, 'report');
  for (const key of ['findings', 'theories', 'opportunities', 'witnesses', 'trial_prep', 'work_product',
    'perspectives', 'evidence_intel', 'strategy', 'strategy_center', 'report_presentation'])
    walk((payload as Row)[key], key);
  return { ok: errors.length === 0, errors: [...new Set(errors)], checked, verified, unresolved, unverified: unresolved };
}

/** Fill missing verification metadata only after binding a literal excerpt to
 * an actual published assertion. An orphan annex entry is never self-certified. */
export function canonicalizeReportCitations<T extends CaseExportData>(input: T): T {
  const payload = structuredClone(input);
  const report = obj(payload.report), full = obj(report.full_report);
  const pages = rows(full.pre_release_source_pages) as MatterSourcePage[];
  const index = payload.documents.map((doc, i) => ({ document_id: String(doc.id ?? doc.document_id ?? ''),
    doc_n: Number(doc.doc_n ?? i + 1), canonical_source_id: text(doc.canonical_source_id) }));
  // This registry was snapshotted from engine findings before presentation.
  // Neither report prose nor a writer-supplied verification object is trusted.
  const trustedReviews = Array.isArray((payload as Row).citation_review_registry)
    ? (payload as Row).citation_review_registry as PropositionReview[]
    : findingCitationReviews(rows(payload.findings));
  const owners = publicationFindingOwners(payload);
  const bindings = new Map<string, string[]>();
  const roots = [report, ...['findings', 'theories', 'opportunities', 'witnesses', 'trial_prep', 'work_product',
    'perspectives', 'evidence_intel', 'strategy', 'strategy_center', 'report_presentation'].map(k => (payload as Row)[k])];
  const visit = (value: unknown, fn: (row: Row, key: string, parent: Row) => void,
    prose: (value: string) => void, key = '', parent: Row = {}) => {
    if (diagnosticKeys.has(key)) return;
    if (typeof value === 'string') { if (!['quote', 'excerpt', 'source_quote'].includes(key)) prose(value); return; }
    if (Array.isArray(value)) { value.forEach(row => visit(row, fn, prose, key, parent)); return; }
    const row = obj(value);
    fn(row, key, parent);
    for (const [childKey, child] of Object.entries(row)) {
      if (childKey === 'full_report') {
        for (const [fullKey, content] of Object.entries(obj(child)))
          if (fullContentKeys.has(fullKey)) visit(content, fn, prose, fullKey, obj(child));
      } else visit(child, fn, prose, childKey, row);
    }
  };
  for (const root of roots) visit(root, () => {}, value => {
    for (const match of value.matchAll(/\[(DOC\s+[^\]]+)\]/gi)) {
      const before = value.slice(0, match.index).trim();
      const statement = assertion(inlineAssertion(before));
      for (const pair of match[1].matchAll(/DOC\s+(\d+)\s*p\.\s*(\d+)/gi)) {
        const key = `${Number(pair[1])}:${Number(pair[2])}`;
        bindings.set(key, [...(bindings.get(key) ?? []), statement]);
      }
    }
  });
  const certify = (ref: Row, statements: string[], parent: Row) => {
    const quote = text(ref.quote ?? ref.excerpt ?? ref.source_quote);
    if (!statements.length || !quote || placeholder.test(quote)) return;
    const coreFinding = rows(payload.findings).find(f => f.metadata?.mandatory_decision_core_id === parent.id);
    // Only a real finding may supply the fallback identity. A report section's
    // arbitrary `id` is not a claim ID. Explicit links never fall back on failure.
    const owner = owners.has(parent) ? parent : undefined;
    const stableId = ref.finding_id ?? ref.proposition_id ?? ref.evidence_id ?? ref.claim_id ?? owner?.id ?? coreFinding?.id;
    const proof = typeof stableId === 'string' ? trustedReviews.find(review => review.claim.id === stableId) : undefined;
    if (owner) {
      const execution = payload.case?.execution_id, caseId = payload.case?.id;
      if (execution && (parent.execution_id ?? parent.metadata?.execution_id) !== execution ||
          execution && parent.metadata?.execution_id != null && parent.metadata.execution_id !== execution ||
          caseId && parent.case_id !== caseId ||
          ref.execution_id != null && ref.execution_id !== execution ||
          ref.case_id != null && ref.case_id !== caseId) return;
      // Presentation may have rewritten this finding after the review snapshot.
      // Check the entire CURRENT input, not only the stored review's own claim.
      if (proof || parent.metadata?.semantic_support_review) {
        if (!proof || proof.claim.id !== owner.id || proof.review.version !== 1 ||
            proof.review.verdict !== 'supported' ||
            !publicationReviewMatches(parent, proof, pages, payload) ||
            supportInput(proof.claim, pages).hash !== proof.review.hash ||
            !reviewedAttributionMatches(ref, proof.claim)) return;
      }
    }
    if (ref.proposition_supported != null && normalized(text(ref.proposition_supported)) !== normalized(statements[0])) {
      // Legacy source-only citations may be bound to the full reviewed party
      // statement. Never replace a different assertion or reuse stale proof.
      if (!owner || !proof || normalized(text(ref.proposition_supported)) !== normalized(quote) ||
          normalized(statements[0]) !== normalized(text(proof.claim.description)) ||
          !publicationReviewMatches(parent, proof, pages, payload)) return;
    }
    const recovering = ref.publication_status === 'QUARANTINED' ||
      (ref.verification_status != null && String(ref.verification_status).toLowerCase() !== 'verified');
    // Rejected references require a new trusted producer run, not automatic
    // rehabilitation by a presentation canonicalizer.
    if (recovering || owner && parent.verification_status != null && parent.verification_status !== 'verified') return;
    const certified = createCanonicalCitation(
      ref,
      statements[0],
      pages,
      index,
      proof,
      { allowTrustedRecertification: false },
    );
    if (!certified || statements.some(s => normalized(s) !== normalized(statements[0]))) return;
    Object.assign(ref, certified, owner && proof ? { finding_id: owner.id } : {});
  };
  for (const root of roots) visit(root, (row, key, parent) => {
    if (['citation', 'citations', 'source_ref', 'source_refs', 'evidence_ref', 'evidence_refs'].includes(key)) {
      const canonicalSource = index.find(doc => doc.document_id === row.document_id)?.canonical_source_id;
      if (canonicalSource && !row.canonical_source_id) row.canonical_source_id = canonicalSource;
      const statement = publishedAssertion(parent, row, pages, index);
      const bound = bindings.get(`${Number(row.doc_n)}:${Number(row.page ?? row.page_number)}`) ?? [];
      const literal = bound.filter(value => normalized(value) === normalized(text(row.quote ?? row.excerpt ?? row.source_quote)));
      const stableId = row.finding_id ?? row.proposition_id ?? row.evidence_id ?? row.claim_id;
      const reviewed = typeof stableId === 'string' ? trustedReviews.find(review => review.claim.id === stableId) : undefined;
      const reviewedBound = reviewed ? bound.filter(value => normalized(value) === normalized(text(reviewed.claim.description))) : [];
      // A finding's own evidence ref is already bound by its stable finding
      // identity and source coordinates. Requiring it to also appear in writer
      // prose before certifying it leaves otherwise-valid findings unverified
      // whenever the writer omits inline citations. The trusted review only
      // supplies the proposition here; certify() still checks its full hash,
      // attribution, quote, page, and source binding before publication.
      const owner = owners.has(parent) ? parent : undefined;
      const ownerId = owner?.id;
      const explicitLink = row.finding_id ?? row.proposition_id ?? row.evidence_id ?? row.claim_id;
      const ownerProof = owner && typeof ownerId === 'string' &&
        (explicitLink == null || explicitLink === ownerId)
        ? trustedReviews.find(review => review.claim.id === ownerId &&
            review.claim.source_document_id === (row.document_id ?? row.source_document_id) &&
            Number(review.claim.source_page) === Number(row.page ?? row.page_number ?? row.source_page) &&
            normalized(text(review.claim.source_quote)) === normalized(text(row.quote ?? row.excerpt ?? row.source_quote)))
        : undefined;
      const statements = statement ? [statement] : literal.length ? literal : reviewedBound.length
        ? reviewedBound : ownerProof ? [text(ownerProof.claim.description)] : [];
      certify(row, statements, parent);
    }
    if (row.source_quote !== undefined) {
      const statement = publishedAssertion(row, row, pages, index);
      if (statement) certify(row, [statement], row);
    }
  }, () => {});
  // The appendix is the shared lookup for every published section, not only
  // Writer prose. Only independently audited references may enter it.
  const registry = new Map<string, Row>();
  const annex = rows(report.citations);
  for (const root of roots) visit(root, (ref, key) => {
    if (!['citation', 'citations', 'source_ref', 'source_refs', 'evidence_ref', 'evidence_refs'].includes(key)) return;
    const audit = auditReportCitationIntegrity({ case: payload.case, documents: payload.documents,
      findings: [], agents: [], analysis: null, score: null,
      citation_review_registry: trustedReviews,
      report: { citations: [ref], full_report: { pre_release_source_pages: pages } },
    } as any);
    if (!audit.ok) return;
    const source = index.find(d => d.document_id === ref.document_id);
    if (!source?.canonical_source_id) return;
    Object.assign(ref, { canonical_source_id: source.canonical_source_id, doc_n: source.doc_n,
      ...(payload.case?.id ? { case_id: payload.case.id } : {}),
      ...(payload.case?.execution_id ? { execution_id: payload.case.execution_id } : {}),
      citation_id: 'citation_' + sha256HexSync(JSON.stringify([payload.case?.id, payload.case?.execution_id,
        source.canonical_source_id, ref.document_id, ref.page, ref.quote, ref.proposition_supported])).slice(0, 32) });
    registry.set(ref.citation_id, ref);
  }, () => {});
  report.citations = [...annex];
  for (const ref of registry.values()) if (!annex.some(c => c.citation_id === ref.citation_id)) report.citations.push({ ...ref });
  // The primary finding and its evidence ref carry the same certified binding.
  // Copy certification fields only; never replace the finding's own identity or
  // claim text with citation metadata. Cards reuse these findings downstream.
  for (const finding of rows(payload.findings)) {
    const primary = rows(finding.evidence_refs).find(ref => ref.finding_id === finding.id &&
      ref.document_id === finding.source_document_id && ref.page === finding.source_page &&
      normalized(text(ref.quote)) === normalized(text(finding.source_quote)) &&
      ref.proposition_supported === finding.proposition_supported && registry.get(ref.citation_id) === ref);
    if (!primary || !finding.proposition_supported || finding.source_location_verified !== true) continue;
    for (const key of ['citation_id', 'writer_ref_id', 'canonical_source_id', 'proposition_supported',
      'proposition_verification', 'verification_status', 'source_location_verified']) finding[key] = primary[key];
  }
  return payload;
}
