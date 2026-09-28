import type { CaseExportData } from '../export';
import type { MatterSourcePage } from '../intelligence/source-matter-audit';
import { createCanonicalCitation, citationPropositionVerified, findingCitationReviews, reviewedAttributionMatches, type PropositionReview } from './citation-production';
import { auditSourceLocations } from './source-location-audit';
import { attributeCivilProposition } from '../civil/proposition-attribution';
import { sha256HexSync } from '../intelligence/sha256';

type Row = Record<string, any>;
const obj = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const normalized = (value: string) => value.normalize('NFC').replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?]$/, '');
const assertion = (value: unknown) => text(value).replace(/\[DOC\s+[^\]]+\]/gi, '').trim();
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
  const sentences = trimmed.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ“"])/);
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
  const errors: string[] = [], verified: Row[] = [], unresolved: Row[] = [];
  let checked = 0;
  const auditRef = (raw: Row, path: string, parent: Row = {}) => {
    checked++;
    const ref: Row = { ...raw, document_id: raw.document_id ?? raw.source_document_id,
      page: raw.page ?? raw.source_page, quote: text(raw.quote ?? raw.excerpt ?? raw.source_quote) };
    const proposition = text(raw.proposition_supported);
    const reasons: string[] = [];
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
    if (asserted && proposition && normalized(asserted) !== normalized(proposition)) reasons.push('published_proposition_mismatch');
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
      for (const pair of pairs) {
        const matches = annex.filter(ref => Number(ref.doc_n) === Number(pair[1]) && pair[2] &&
          Number(ref.page ?? ref.page_number) === Number(pair[2]));
        if (!matches.length) errors.push(`citation_integrity:${path}:inline_reference_unresolved`);
        else if (!matches.some(ref => normalized(text(ref.proposition_supported)) === normalized(sentence)))
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
  walk(report, 'report');
  for (const key of ['findings', 'theories', 'opportunities', 'witnesses', 'trial_prep', 'work_product',
    'perspectives', 'evidence_intel', 'strategy', 'strategy_center', 'report_presentation'])
    walk((payload as unknown as Row)[key], key, key);
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
    if (!statements.length || !quote || placeholder.test(quote) ||
      (ref.verification_status != null && String(ref.verification_status).toLowerCase() !== 'verified') ||
      (ref.proposition_supported != null && normalized(text(ref.proposition_supported)) !== normalized(statements[0]))) return;
    const coreFinding = rows(payload.findings).find(f => f.metadata?.mandatory_decision_core_id === parent.id);
    const stableId = ref.finding_id ?? ref.proposition_id ?? ref.evidence_id ?? ref.claim_id ?? coreFinding?.id;
    const proof = typeof stableId === 'string' ? trustedReviews.find(review => review.claim.id === stableId) : undefined;
    const certified = createCanonicalCitation(ref, statements[0], pages, index, proof);
    if (!certified || statements.some(s => normalized(s) !== normalized(statements[0]))) return;
    Object.assign(ref, certified);
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
      const statements = statement ? [statement] : literal.length ? literal : reviewedBound;
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
  return payload;
}
