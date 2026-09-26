/**
 * Central Final Claim Publication Layer
 *
 * PERMANENT NYRAVA INVARIANT:
 * STRICT ON CLAIMS. PERMISSIVE ON REPORT RELEASE.
 *
 * Agents analyze. Agents propose candidate output.
 * NO AGENT HAS FINAL PUBLICATION AUTHORITY.
 * ONE CENTRAL PUBLICATION LAYER decides what attorneys see.
 *
 * If a claim is bad: repair it, narrow it, reclassify it, merge it,
 * quarantine it, or suppress it. DO NOT BLOCK THE ENTIRE REPORT.
 */

import {
  evaluateClaimEntailment,
  splitCompoundClaim,
  formatReconstructedPropositions,
  SPANISH_STOPWORDS,
  type ClaimEntailmentDiagnostic,
  type EntailmentStatus,
  type SpeakerAttribution,
} from "./claim-evidence-entailment";
import { formatSpeakerRoleBadge, type SpeakerRoleBadge } from "./concluded-case-governance";
import { auditSourceLocations, relocateSourceRefs } from "../reporting/source-location-audit";
import { locateQuoteInText } from "./evidence-provenance-text";
import type { MatterSourcePage } from "./source-matter-audit";

export type ClaimType =
  | "COURT_HOLDING"
  | "COURT_DETERMINATION"
  | "PARTY_ALLEGATION"
  | "VERIFIED_FACT"
  | "LEGAL_AUTHORITY"
  | "EVIDENCE_BASED_INFERENCE"
  | "CONTRADICTION"
  | "EVIDENCE_GAP"
  | "STRATEGY"
  | "POSSIBLE_NEXT_ACTION"
  | "AI_THEORY"
  | "UNKNOWN";

export type PublicationStatus =
  | "APPROVED"
  | "REPAIRED"
  | "MERGED"
  | "QUARANTINED"
  | "SUPPRESSED";

export interface StandardClaimObject {
  claim_id: string;
  execution_id: string | null;
  original_claim: string;
  repaired_claim: string | null;
  repaired_title?: string | null;
  repaired_description?: string | null;
  canonical_title: string;
  canonical_description: string;
  canonical_speaker_role?: string;
  canonical_speaker_badge?: string;
  is_party_allegation?: boolean;
  source_agent: string | null;
  claim_type: ClaimType;
  speaker: SpeakerAttribution;
  attribution: string;
  source_ids: string[];
  source_quotes: string[];
  source_pages: number[];
  entailment_status: EntailmentStatus;
  publication_status: PublicationStatus;
  requested_section: string | null;
  allowed_section: string | null;
  suppression_reason: string | null;
  merged_into: string | null;
  metadata?: Record<string, unknown>;
}

export interface PublicationContext {
  executionId?: string | null;
  caseType?: string | null;
  isConcludedAudit?: boolean;
  hasIdentifiedClient?: boolean;
  clientRole?: string | null;
  proceduralAvailabilityVerified?: boolean;
}

// Regex rules for deterministic speaker attribution
const PARTY_ALLEGATION_SPEAKER_RULES: Array<{
  pattern: RegExp;
  speaker: SpeakerAttribution;
  roleLabel: string;
  badge: SpeakerRoleBadge;
}> = [
  {
    pattern: /\b(?:el\s+quejoso|la\s+quejosa)\s+(?:argumenta|sostiene|alega|aduce|senala|señala|expone|plantea|refiere|afirma|solicita)\b/i,
    speaker: "party",
    roleLabel: "quejoso",
    badge: "ARGUMENTO DEL QUEJOSO",
  },
  {
    pattern: /\b(?:el\s+recurrente|la\s+recurrente)\s+(?:argumenta|sostiene|alega|aduce|senala|señala|expone|plantea|refiere|afirma|solicita)\b/i,
    speaker: "party",
    roleLabel: "recurrente",
    badge: "ARGUMENTO DEL QUEJOSO",
  },
  {
    pattern: /\b(?:la\s+parte\s+actora|el\s+actor|la\s+actora)\s+(?:argumenta|sostiene|alega|aduce|senala|señala|expone|plantea|refiere|afirma)\b/i,
    speaker: "party",
    roleLabel: "parte_actora",
    badge: "ARGUMENTO / ALEGACIÓN DE PARTE",
  },
  {
    pattern: /\b(?:la\s+demandada|el\s+demandado|la\s+parte\s+demandada)\s+(?:argumenta|sostiene|alega|aduce|senala|señala|expone|plantea|refiere|afirma)\b/i,
    speaker: "party",
    roleLabel: "parte_demandada",
    badge: "ARGUMENTO / ALEGACIÓN DE PARTE",
  },
  {
    pattern: /\b(?:el\s+tercero\s+interesado|la\s+tercera\s+interesada)\s+(?:argumenta|sostiene|alega|aduce|senala|señala|expone|plantea)\b/i,
    speaker: "party",
    roleLabel: "tercero_interesado",
    badge: "ARGUMENTO DEL TERCERO INTERESADO",
  },
  {
    pattern: /\b(?:el\s+ministerio\s+p[uú]blico)\s+(?:argumenta|sostiene|alega|solicita|plantea|formula)\b/i,
    speaker: "party",
    roleLabel: "ministerio_publico",
    badge: "ARGUMENTO / ALEGACIÓN DE PARTE",
  },
  {
    pattern: /\b(?:la\s+autoridad\s+responsable)\s+(?:argumenta|sostiene|alega|aduce|senala|señala|manifiesta|rinde|informa)\b/i,
    speaker: "autoridad",
    roleLabel: "autoridad_responsable",
    badge: "ARGUMENTO DE LA AUTORIDAD RESPONSABLE",
  },
];

// Procedural / strategic language patterns
const UNVERIFIED_PROCEDURAL_RX =
  /\b(?:la\s+decisi[oó]n\s+puede\s+ser\s+impugnada|puede\s+(?:ser\s+impugnad[oa]|promoverse|interponerse|solicitarse)|debe\s+(?:interponerse|promoverse|apelarse)|procede\s+(?:el\s+recurso|la\s+impugnaci[oó]n)|podr[ií]a\s+resultar\s+en\s+una\s+revisi[oó]n\s+de\s+la\s+sentencia|nueva\s+evaluaci[oó]n\s+de\s+la\s+custodia|solicitar\s+un\s+dictamen\s+pericial)\b/i;

const CLIENT_PREJUDGMENT_RX =
  /\b(?:el\s+expediente\s+respalda\s+la\s+pretensi[oó]n\s+del\s+cliente|sostiene\s+la\s+posici[oó]n\s+del\s+cliente|favorece\s+la\s+pretensi[oó]n\s+del\s+cliente)\b/i;

function normalizeText(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Step 2: Deterministic speaker and attribution analysis
 */
export function determineSpeakerAndAttribution(
  title: string,
  desc: string,
  quote: string,
  existingSpeaker?: string | null,
): {
  speaker: SpeakerAttribution;
  roleLabel: string;
  badge: SpeakerRoleBadge;
  isPartyAllegation: boolean;
} {
  const combined = `${title} ${desc} ${quote}`;

  for (const rule of PARTY_ALLEGATION_SPEAKER_RULES) {
    if (rule.pattern.test(combined)) {
      return {
        speaker: rule.speaker,
        roleLabel: rule.roleLabel,
        badge: rule.badge,
        isPartyAllegation: true,
      };
    }
  }

  // Check explicit speaker role
  const sp = String(existingSpeaker ?? "").toLowerCase();
  if (sp === "quejoso" || sp === "recurrente") {
    return {
      speaker: "party",
      roleLabel: sp,
      badge: "ARGUMENTO DEL QUEJOSO",
      isPartyAllegation: true,
    };
  }
  if (sp === "actor" || sp === "demandado" || sp === "party") {
    return {
      speaker: "party",
      roleLabel: sp,
      badge: "ARGUMENTO / ALEGACIÓN DE PARTE",
      isPartyAllegation: true,
    };
  }
  if (sp === "autoridad_responsable") {
    return {
      speaker: "autoridad",
      roleLabel: sp,
      badge: "ARGUMENTO DE LA AUTORIDAD RESPONSABLE",
      isPartyAllegation: true,
    };
  }
  if (sp === "scjn" || sp === "reviewing_court") {
    return {
      speaker: "reviewing_court",
      roleLabel: sp,
      badge: "DETERMINACIÓN ADOPTADA POR EL TRIBUNAL REVISOR",
      isPartyAllegation: false,
    };
  }
  if (sp === "lower_court" || sp === "juez_distrito" || sp === "tribunal_colegiado_a_quo") {
    return {
      speaker: "lower_court",
      roleLabel: sp,
      badge: "DETERMINACIÓN DEL TRIBUNAL INFERIOR",
      isPartyAllegation: false,
    };
  }

  // General allegation fallback
  if (/\b(?:alega|argumenta|sostiene|aduce|expone\s+como\s+agravio|plantea\s+como\s+violaci[oó]n)\b/i.test(combined)) {
    return {
      speaker: "party",
      roleLabel: "parte",
      badge: "ARGUMENTO / ALEGACIÓN DE PARTE",
      isPartyAllegation: true,
    };
  }

  // Resolutivo
  if (/puntos?\s+resolutivos?|se\s+resuelve|resolutivo|se\s+desecha|queda\s+firme/i.test(title)) {
    return {
      speaker: "reviewing_court",
      roleLabel: "tribunal",
      badge: "RESOLUTIVO",
      isPartyAllegation: false,
    };
  }

  return {
    speaker: "unattributed",
    roleLabel: "no_determinado",
    badge: "NO DETERMINADO",
    isPartyAllegation: false,
  };
}

/**
 * Step 1: Classify every substantive claim into one primary type
 */
export function classifyClaimPrimaryType(
  claim: {
    title?: string | null;
    description?: string | null;
    finding_type?: string | null;
    category?: string | null;
    audit_classification?: string | null;
    source_quote?: string | null;
    source_document_id?: string | null;
    isPartyAllegation?: boolean;
    speaker?: SpeakerAttribution;
  },
): ClaimType {
  const title = String(claim.title ?? "");
  const desc = String(claim.description ?? "");
  const combined = `${title} ${desc}`.toLowerCase();
  const quote = String(claim.source_quote ?? "").trim();
  const hasSource = Boolean(quote.length > 0 && (claim.source_document_id || quote.length > 15));

  // Party Allegation
  if (claim.isPartyAllegation || claim.speaker === "party") {
    return "PARTY_ALLEGATION";
  }

  // Strategy / Next Action / Tactical advice
  if (
    /contrainterrogatorio:|t[aá]ctica|estrategia|recomendaci[oó]n|solicitar\s+un\s+dictamen/i.test(title) ||
    UNVERIFIED_PROCEDURAL_RX.test(combined)
  ) {
    if (/puede|debe|procede|podr[ií]a/i.test(combined)) {
      return "POSSIBLE_NEXT_ACTION";
    }
    return "STRATEGY";
  }

  // Evidence Gap
  if (
    claim.finding_type === "EVIDENCE_GAP" ||
    claim.audit_classification === "EVIDENCE_GAP" ||
    /falta\s+de\s+especificaci[oó]n|omisi[oó]n\s+probatoria|evidencia\s+faltante|no\s+se\s+aport[oó]/i.test(title)
  ) {
    return "EVIDENCE_GAP";
  }

  // Contradiction
  if (
    claim.finding_type === "CONTRADICTION" ||
    claim.audit_classification === "CONTRADICTION" ||
    /contradicci[oó]n|inconsistencia|conflicto\s+entre/i.test(title)
  ) {
    return "CONTRADICTION";
  }

  // Resolutivo / Court Holding
  if (
    /puntos?\s+resolutivos?|se\s+desecha|se\s+sobresee|se\s+concede|se\s+niega|queda\s+firme/i.test(title) ||
    claim.audit_classification === "VERIFIED_COURT_HOLDING"
  ) {
    return "COURT_HOLDING";
  }

  // Court Determination
  if (
    /determinaci[oó]n\s+del\s+tribunal|la\s+sala\s+resolvi[oó]|el\s+juez\s+determin[oó]|el\s+tribunal\s+consider[oó]/i.test(title) ||
    /el\s+tribunal\s+consider[oó]\s+que|la\s+sentencia\s+cumple/i.test(desc)
  ) {
    return "COURT_DETERMINATION";
  }

  // Legal Authority
  if (
    /jurisprudencia|criterio\s+reiterado|tesis|art[ií]culo\s+\d+|ley\s+de\s+amparo/i.test(title) ||
    claim.finding_type === "LEGAL_AUTHORITY"
  ) {
    return "LEGAL_AUTHORITY";
  }

  // Verified Fact
  if (hasSource && (claim.finding_type === "DIRECT_EVIDENCE" || /hecho\s+procesal|constancia/i.test(title))) {
    return "VERIFIED_FACT";
  }

  // Evidence Based Inference
  if (hasSource && claim.finding_type === "EVIDENCE_BASED_INFERENCE") {
    return "EVIDENCE_BASED_INFERENCE";
  }

  // AI Theory / Unsupported
  if (!hasSource) {
    return "AI_THEORY";
  }

  return "UNKNOWN";
}

/**
 * Step 9: Section Permission Matrix
 */
export function getAllowedSectionForClaim(type: ClaimType): string {
  switch (type) {
    case "COURT_HOLDING":
      return "Holdings / Findings / Legal Analysis";
    case "COURT_DETERMINATION":
      return "Result / Procedural History / Findings";
    case "PARTY_ALLEGATION":
      return "Party Arguments / Labeled Allegation";
    case "VERIFIED_FACT":
      return "Facts / Findings";
    case "LEGAL_AUTHORITY":
      return "Legal Framework / Authorities";
    case "EVIDENCE_BASED_INFERENCE":
      return "Analysis (Inference Labeled)";
    case "CONTRADICTION":
      return "Contradictions only";
    case "EVIDENCE_GAP":
      return "Evidence Gaps only";
    case "STRATEGY":
      return "Strategy only";
    case "POSSIBLE_NEXT_ACTION":
      return "Possible Actions only";
    case "AI_THEORY":
      return "Internal Audit only (Never Fact)";
    case "UNKNOWN":
    default:
      return "Quarantine";
  }
}

/**
 * Classifies, validates, and makes publication decisions for a single candidate claim.
 */
export function classifyValidatePublishClaim(
  rawClaim: Record<string, unknown>,
  context: PublicationContext = {},
): StandardClaimObject {
  const claimId = String(rawClaim.id ?? crypto.randomUUID());
  const title = String(rawClaim.title ?? "");
  const desc = String(rawClaim.description ?? "");
  const evidenceRefs = Array.isArray(rawClaim.evidence_refs) ? rawClaim.evidence_refs : [];
  const quote =
    (typeof rawClaim.source_quote === "string" ? rawClaim.source_quote.trim() : "") ||
    (typeof evidenceRefs[0]?.quote === "string" ? evidenceRefs[0].quote.trim() : "") ||
    (typeof rawClaim.supporting_quote === "string" ? rawClaim.supporting_quote.trim() : "");
  const docId =
    (rawClaim.source_document_id as string) ||
    (evidenceRefs[0]?.document_id ? String(evidenceRefs[0].document_id) : null) ||
    (Array.isArray(rawClaim.source_doc_ids) && rawClaim.source_doc_ids[0] ? String(rawClaim.source_doc_ids[0]) : null);
  const page =
    typeof rawClaim.source_page === "number"
      ? rawClaim.source_page
      : typeof evidenceRefs[0]?.page === "number"
        ? evidenceRefs[0].page
        : null;

  const existingSpeaker = (rawClaim.speaker_role as string) ?? null;

  const isExplicitHolding = Boolean(
    rawClaim.mandatory_decision_kind ||
    rawClaim.mandatory_decision_core_id ||
    rawClaim.audit_classification === "VERIFIED_COURT_HOLDING" ||
    (rawClaim.proposition_type === "holding" && rawClaim.adoption_status === "adopted")
  );

  // Step 2: Deterministic speaker & attribution
  const { speaker, roleLabel, badge, isPartyAllegation } = determineSpeakerAndAttribution(
    title,
    desc,
    quote,
    existingSpeaker,
  );

  // Step 1: Primary type classification
  const claimType = isExplicitHolding
    ? "COURT_HOLDING"
    : classifyClaimPrimaryType({
        title,
        description: desc,
        finding_type: rawClaim.finding_type as string,
        category: rawClaim.category as string,
        audit_classification: rawClaim.audit_classification as string,
        source_quote: quote,
        source_document_id: docId,
        isPartyAllegation,
        speaker,
      });

  // Step 3 & 4: Reuse Priority #2 Entailment
  const entailmentDiag = evaluateClaimEntailment({
    id: claimId,
    title,
    description: desc,
    source_document_id: docId,
    source_page: page,
    source_quote: quote,
    source_doc_ids: Array.isArray(rawClaim.source_doc_ids) ? rawClaim.source_doc_ids : docId ? [docId] : null,
    evidence_refs: rawClaim.evidence_refs,
    speaker_role: roleLabel !== "no_determinado" ? roleLabel : existingSpeaker,
    finding_type: rawClaim.finding_type as string,
    audit_classification: rawClaim.audit_classification as string,
  });

  // Step 5: Strategy & Procedural Availability Control
  const hasUnverifiedProceduralAdvice = UNVERIFIED_PROCEDURAL_RX.test(`${title} ${desc}`);
  const isConcludedOrDismissed =
    context.isConcludedAudit ||
    /desechamiento|se\s+desecha|queda\s+firme/i.test(`${title} ${desc} ${quote}`);

  const isPreSuppressed =
    rawClaim.finding_status === "suppressed" ||
    rawClaim.lifecycle_status === "quarantined" ||
    rawClaim.lifecycle_status === "superseded" ||
    rawClaim.lifecycle_status === "rejected" ||
    rawClaim.lifecycle_status === "suppressed" ||
    rawClaim.publication_status === "SUPPRESSED" ||
    rawClaim.publication_status === "QUARANTINED" ||
    rawClaim.verification_status === "quarantined" ||
    rawClaim.superseded_at != null ||
    (rawClaim.metadata as any)?.quarantined === true ||
    (rawClaim.metadata as any)?.publication_status === "SUPPRESSED" ||
    (rawClaim.metadata as any)?.publication_status === "QUARANTINED" ||
    (rawClaim.metadata as any)?.claim_entailment_diagnostic?.final_reportable === false ||
    (rawClaim.metadata as any)?.claim_entailment_diagnostic?.claim_action === "REMOVE" ||
    (rawClaim.metadata as any)?.claim_entailment_diagnostic?.claim_action === "QUARANTINE";

  let publicationStatus: PublicationStatus = "APPROVED";
  let suppressionReason: string | null = null;
  let repairedClaim: string | null =
    (rawClaim.repaired_title as string) ||
    (rawClaim.repaired_claim as string) ||
    ((rawClaim.metadata as any)?.repaired_title as string) ||
    ((rawClaim.metadata as any)?.repaired_claim as string) ||
    entailmentDiag.repaired_claim ||
    null;
  let repairedDesc: string | null =
    (rawClaim.repaired_description as string) ||
    ((rawClaim.metadata as any)?.repaired_description as string) ||
    entailmentDiag.repaired_description ||
    null;

  if (repairedClaim && repairedClaim.includes(": ") && !repairedDesc) {
    const parts = repairedClaim.split(": ");
    repairedClaim = parts[0];
    repairedDesc = parts.slice(1).join(": ");
  }

  if (isPreSuppressed) {
    const isQuar =
      rawClaim.lifecycle_status === "quarantined" ||
      rawClaim.publication_status === "QUARANTINED" ||
      rawClaim.verification_status === "quarantined" ||
      (rawClaim.metadata as any)?.quarantined === true ||
      (rawClaim.metadata as any)?.claim_entailment_diagnostic?.claim_action === "QUARANTINE";
    publicationStatus = isQuar ? "QUARANTINED" : "SUPPRESSED";
    suppressionReason =
      (rawClaim.suppression_reason as string) ||
      (rawClaim.metadata as any)?.suppressed_reason ||
      (rawClaim.metadata as any)?.suppression_reason ||
      "Claim previously suppressed or quarantined in upstream verification.";
  } else if (isExplicitHolding) {
    publicationStatus = "APPROVED";
  } else if (!entailmentDiag.final_reportable || entailmentDiag.claim_action === "REMOVE") {
    publicationStatus = "SUPPRESSED";
    suppressionReason = entailmentDiag.entailment_reason;
  } else if (entailmentDiag.claim_action === "QUARANTINE") {
    publicationStatus = "QUARANTINED";
    suppressionReason = entailmentDiag.entailment_reason;
  } else if (
    entailmentDiag.claim_action === "REPAIR" ||
    (repairedDesc && repairedDesc !== desc) ||
    (repairedClaim && repairedClaim !== title)
  ) {
    publicationStatus = "REPAIRED";
  }

  // Rule 2: Strategy / Possible Next Action in a concluded or unverified procedural context
  if (
    (claimType === "STRATEGY" || claimType === "POSSIBLE_NEXT_ACTION" || hasUnverifiedProceduralAdvice) &&
    isConcludedOrDismissed &&
    !context.proceduralAvailabilityVerified
  ) {
    publicationStatus = "SUPPRESSED";
    suppressionReason =
      "Procedural challenge / strategy suppressed: decision is final or procedural availability is unverified.";
  }

  // Rule 3: Reclassify party allegations correctly
  if (isPartyAllegation && publicationStatus !== "SUPPRESSED" && publicationStatus !== "QUARANTINED") {
    if (
      entailmentDiag.claim_action === "REPAIR" ||
      (repairedDesc && repairedDesc !== desc) ||
      (repairedClaim && repairedClaim !== title)
    ) {
      publicationStatus = "REPAIRED";
    } else {
      publicationStatus = "APPROVED";
    }
  }

  const canonicalTitle = (publicationStatus === "REPAIRED" && repairedClaim) ? repairedClaim : title;
  const canonicalDesc = (publicationStatus === "REPAIRED" && repairedDesc) ? repairedDesc : desc;
  const canonicalSpeakerRole = isPartyAllegation
    ? roleLabel
    : (speaker !== "unattributed" ? speaker : (existingSpeaker ?? "unresolved"));
  const canonicalSpeakerBadge = isPartyAllegation ? badge : (existingSpeaker ? formatSpeakerRoleBadge(rawClaim) : badge);

  const allowedSection = getAllowedSectionForClaim(isPartyAllegation ? "PARTY_ALLEGATION" : claimType);

  return {
    claim_id: claimId,
    execution_id: context.executionId ?? (rawClaim.execution_id as string) ?? null,
    original_claim: `${title}: ${desc}`,
    repaired_claim: repairedClaim ? `${repairedClaim}: ${repairedDesc ?? desc}` : null,
    repaired_title: repairedClaim,
    repaired_description: repairedDesc,
    canonical_title: canonicalTitle,
    canonical_description: canonicalDesc,
    canonical_speaker_role: canonicalSpeakerRole,
    canonical_speaker_badge: canonicalSpeakerBadge,
    is_party_allegation: isPartyAllegation,
    source_agent: (rawClaim.source_module as string) ?? (rawClaim.agent_type as string) ?? null,
    claim_type: isPartyAllegation ? "PARTY_ALLEGATION" : claimType,
    speaker: isPartyAllegation ? "party" : speaker,
    attribution: badge,
    source_ids: rawClaim.source_document_id ? [String(rawClaim.source_document_id)] : [],
    source_quotes: quote ? [quote] : [],
    source_pages: typeof rawClaim.source_page === "number" ? [rawClaim.source_page] : [],
    entailment_status: entailmentDiag.entailment_status,
    publication_status: publicationStatus,
    requested_section: (rawClaim.section as string) ?? null,
    allowed_section: allowedSection,
    suppression_reason: suppressionReason,
    merged_into: null,
    metadata: {
      ...(typeof rawClaim.metadata === "object" && rawClaim.metadata !== null ? rawClaim.metadata : {}),
      claim_entailment_diagnostic: entailmentDiag,
      deterministic_attribution: {
        speaker: isPartyAllegation ? "party" : speaker,
        roleLabel: canonicalSpeakerRole,
        badge: canonicalSpeakerBadge,
        isPartyAllegation,
      },
      raw_unreconciled_title: title,
      raw_unreconciled_description: desc,
    },
  };
}

/**
 * Step 8: Semantic Deduplication
 * Merges redundant claims communicating the same core proposition.
 * e.g. "Discriminación de género" and "Discriminación en la custodia"
 */
export function deduplicateAndMergeClaims(
  claims: StandardClaimObject[],
): { surviving: StandardClaimObject[]; merged: StandardClaimObject[] } {
  const surviving: StandardClaimObject[] = [];
  const merged: StandardClaimObject[] = [];

  for (let i = 0; i < claims.length; i++) {
    const candidate = claims[i];
    if (candidate.publication_status === "SUPPRESSED" || candidate.publication_status === "QUARANTINED") {
      surviving.push(candidate);
      continue;
    }

    // Check if this candidate merges into an already accepted surviving claim
    let matchIdx = -1;
    for (let j = 0; j < surviving.length; j++) {
      const prev = surviving[j];
      if (prev.publication_status === "SUPPRESSED" || prev.publication_status === "QUARANTINED") continue;

      const sameSpeaker = prev.speaker === candidate.speaker;
      const sameType = prev.claim_type === candidate.claim_type;
      const prevNorm = normalizeText(prev.original_claim);
      const candNorm = normalizeText(candidate.original_claim);

      // Specific Case: Gender / custody discrimination duplicate
      const bothGenderCustodyDiscrim =
        /discriminacion/i.test(prevNorm) &&
        /discriminacion/i.test(candNorm) &&
        /(?:genero|sexo|custodia)/i.test(prevNorm) &&
        /(?:genero|sexo|custodia)/i.test(candNorm);

      // General duplicate disposition check (e.g. dismissal of revision)
      const bothDismissal =
        /desecha\s+el\s+recurso/i.test(prevNorm) && /desecha\s+el\s+recurso/i.test(candNorm);

      // Semantic token overlap check
      const prevTokens = new Set(prevNorm.split(" ").filter((t) => t.length > 3));
      const candTokens = candNorm.split(" ").filter((t) => t.length > 3);
      const common = candTokens.filter((t) => prevTokens.has(t));
      const overlapRatio = candTokens.length > 0 ? common.length / candTokens.length : 0;

      if ((sameSpeaker && sameType && (overlapRatio >= 0.75 || bothGenderCustodyDiscrim)) || bothDismissal) {
        matchIdx = j;
        break;
      }
    }

    if (matchIdx >= 0) {
      const parent = surviving[matchIdx];
      const mergedObj: StandardClaimObject = {
        ...candidate,
        publication_status: "MERGED",
        suppression_reason: `Merged into canonical claim ${parent.claim_id}`,
        merged_into: parent.claim_id,
      };
      merged.push(mergedObj);
      surviving.push(mergedObj);
    } else {
      surviving.push(candidate);
    }
  }

  return { surviving, merged };
}

/**
 * Classifies, validates, dedupes, and filters a collection of candidate claims.
 */
export function classifyValidatePublishClaims(
  rawClaims: Array<Record<string, unknown>>,
  context: PublicationContext = {},
): {
  published: StandardClaimObject[];
  all: StandardClaimObject[];
  diagnostics: StandardClaimObject[];
} {
  const initial = rawClaims.map((c) => classifyValidatePublishClaim(c, context));
  const { surviving } = deduplicateAndMergeClaims(initial);

  const published = surviving.filter(
    (c) => c.publication_status === "APPROVED" || c.publication_status === "REPAIRED",
  );

  return {
    published,
    all: surviving,
    diagnostics: surviving,
  };
}

/**
 * Step 10 & 11: Scrub Executive Summary, Direct Answer, and Decision Support.
 * Ensures unverified client claims and procedural options do not publish.
 */
export function sanitizeReportObjectiveAndProse(
  reportRow: Record<string, unknown>,
  approvedClaims: StandardClaimObject[],
  context: PublicationContext = {},
): {
  executiveSummary: string;
  objective: Record<string, unknown> | null;
} {
  const full = (reportRow.full_report as Record<string, unknown>) ?? {};
  const prose = (full.prose as Record<string, unknown>) ?? {};
  let execSummary = String(reportRow.executive_summary ?? prose.executive_summary ?? "");

  const hasApprovedClientClaim = approvedClaims.some(
    (c) => c.claim_type === "PARTY_ALLEGATION" && (c.speaker === "party" || c.attribution.includes("QUEJOSO")),
  );
  const isJudicialAudit =
    context.isConcludedAudit ||
    approvedClaims.some((c) => c.claim_type === "COURT_HOLDING" || c.claim_type === "COURT_DETERMINATION");

  // Step 10: "El expediente respalda la pretensión del cliente..."
  // If no client position is verified or if this is a judicial decision audit:
  // Rewrite client prejudgment statements to factual descriptions
  if (CLIENT_PREJUDGMENT_RX.test(execSummary)) {
    if (!context.hasIdentifiedClient || !hasApprovedClientClaim || isJudicialAudit) {
      execSummary = execSummary
        .replace(
          CLIENT_PREJUDGMENT_RX,
          "El expediente contiene determinaciones judiciales verificadas que permiten identificar con precisión lo resuelto.",
        )
        .trim();
    }
  }

  // Step 11: Objective block sanitation
  const objective = (full.objective as Record<string, unknown>) ? { ...full.objective } : null;
  if (objective) {
    let answer = String(objective.answer ?? "");
    if (CLIENT_PREJUDGMENT_RX.test(answer)) {
      if (!context.hasIdentifiedClient || !hasApprovedClientClaim || isJudicialAudit) {
        answer =
          "El expediente contiene determinaciones judiciales verificadas que permiten identificar con precisión lo resuelto.";
      }
    }
    objective.answer = answer;

    // Sanitize decision points
    if (Array.isArray(objective.decision_points)) {
      objective.decision_points = objective.decision_points.map((rawDp: any) => {
        const dp = { ...rawDp };
        const impactText = String(dp.impact ?? "");
        const actionText = String(dp.next_action ?? "");

        if (UNVERIFIED_PROCEDURAL_RX.test(impactText)) {
          if (!context.proceduralAvailabilityVerified) {
            dp.impact =
              "Determinación judicial verificada; el expediente documenta el alcance resolutivo fijado por el tribunal.";
          }
        }

        if (UNVERIFIED_PROCEDURAL_RX.test(actionText)) {
          if (!context.proceduralAvailabilityVerified) {
            dp.next_action =
              "Revisión documental: Verificar el engrose y los puntos resolutivos antes de atribuir efectos posteriores.";
          }
        }

        return dp;
      });
    }
  }

  return {
    executiveSummary: execSummary,
    objective,
  };
}

function matchesUnsupportedProposition(text: string, unsupported: string): boolean {
  const normText = normalizeText(text);
  const normUns = normalizeText(unsupported);
  if (!normText || !normUns) return false;
  if (normText.includes(normUns) || normUns.includes(normText)) return true;

  // Check distinctive token overlap
  const unsTokens = normUns.split(" ").filter((t) => t.length > 3 && !SPANISH_STOPWORDS.has(t));
  if (unsTokens.length >= 3) {
    const matching = unsTokens.filter((t) => normText.includes(t));
    if (matching.length >= 3 && matching.length / unsTokens.length >= 0.5) {
      return true;
    }
  }
  return false;
}

/**
 * Rule 3: Unsupported proposition cannot reappear in another report section.
 * Scrubs stripped or unsupported propositions from executive summary, objective,
 * priority review, executive questions, and next actions.
 */
export function scrubUnsupportedPropositionsFromSections(
  reportRow: Record<string, any>,
  pres: Record<string, any> | undefined,
  unsupportedPropositions: string[],
): { executiveSummary: string } {
  const normUnsupported = unsupportedPropositions
    .map((p) => p.trim())
    .filter((p) => p.length >= 8);

  if (!normUnsupported.length) {
    return { executiveSummary: String(reportRow.executive_summary ?? "") };
  }

  // 1. Scrub executive summary
  let exec = String(reportRow.executive_summary ?? "");
  for (const uns of normUnsupported) {
    if (matchesUnsupportedProposition(exec, uns)) {
      const sentences = exec.split(/(?<=[.!?])\s+/);
      exec = sentences
        .filter((s) => !matchesUnsupportedProposition(s, uns))
        .join(" ")
        .trim();
    }
  }
  reportRow.executive_summary = exec;
  if (reportRow.full_report?.prose) {
    (reportRow.full_report.prose as any).executive_summary = exec;
  }

  // 2. Scrub snapshot priorityReview
  if (pres?.snapshot?.priorityReview && Array.isArray(pres.snapshot.priorityReview)) {
    pres.snapshot.priorityReview = pres.snapshot.priorityReview.filter((item: string) => {
      return !normUnsupported.some((uns) => matchesUnsupportedProposition(item, uns));
    });
  }

  // 3. Scrub executive questions
  if (pres?.executive_questions && Array.isArray(pres.executive_questions)) {
    pres.executive_questions = pres.executive_questions.filter((q: any) => {
      const qText = String(typeof q === "string" ? q : q.question ?? q.answer ?? "");
      return !normUnsupported.some((uns) => matchesUnsupportedProposition(qText, uns));
    });
  }

  // 4. Scrub next_actions and recommendations
  if (Array.isArray(reportRow.next_actions)) {
    reportRow.next_actions = reportRow.next_actions.filter((act: any) => {
      const actText = String(act.action ?? act.title ?? "");
      return !normUnsupported.some((uns) => matchesUnsupportedProposition(actText, uns));
    });
  }
  if (Array.isArray(reportRow.full_report?.canonical_recommendations)) {
    reportRow.full_report.canonical_recommendations = reportRow.full_report.canonical_recommendations.filter(
      (rec: any) => {
        const recText = String(rec.title ?? rec.reason ?? "");
        return !normUnsupported.some((uns) => matchesUnsupportedProposition(recText, uns));
      },
    );
  }

  // 5. Scrub objective
  if (reportRow.full_report?.objective) {
    const obj = reportRow.full_report.objective;
    if (obj.answer) {
      for (const uns of normUnsupported) {
        if (matchesUnsupportedProposition(String(obj.answer), uns)) {
          const sentences = String(obj.answer).split(/(?<=[.!?])\s+/);
          obj.answer = sentences
            .filter((s) => !matchesUnsupportedProposition(s, uns))
            .join(" ")
            .trim();
        }
      }
    }
    if (Array.isArray(obj.decision_points)) {
      obj.decision_points = obj.decision_points.filter((dp: any) => {
        const dpText = `${dp.issue || ""} ${dp.impact || ""} ${dp.next_action || ""}`;
        return !normUnsupported.some((uns) => matchesUnsupportedProposition(dpText, uns));
      });
    }
  }

  return { executiveSummary: exec };
}

/**
 * Rule 4: Downstream prose cannot add a new substantive proposition after verification.
 * Formatting and shortening are allowed. Adding meaning is NOT.
 */
export function enforceNoAddedPropositions(
  candidateText: string,
  verifiedClaim: StandardClaimObject,
): string {
  const verifiedDesc = (verifiedClaim.canonical_description || verifiedClaim.repaired_description || "").trim();
  if (!candidateText || candidateText.trim() === verifiedDesc) {
    return verifiedDesc || candidateText;
  }

  const normCandidate = normalizeText(candidateText);
  const normVerified = normalizeText(verifiedDesc);
  if (normVerified.includes(normCandidate) || normCandidate === normVerified) {
    return candidateText;
  }

  // Split candidateText into atomic propositions
  const candidateProps = splitCompoundClaim("", candidateText);
  const quote = verifiedClaim.source_quotes[0] || "";
  const normQuote = normalizeText(quote);

  // Check each proposition: must either be part of verifiedDesc or directly entailed by the quote
  const survivingProps = candidateProps.filter((cp) => {
    const normCp = normalizeText(cp.text);
    if (normVerified.includes(normCp)) return true;

    // Check if directly entailed by the quote
    if (cp.is_legal_conclusion) {
      const quoteHasLegalTerms =
        /\b(?:inconstitucional|contraviene|vulnera|viola|derechos\s+humanos|ilegal|invalido|indemnizaci[oó]n|suspender|desacato|sancionable|injustificado)\b/i.test(
          normQuote,
        );
      const tokens = normCp.split(" ").filter((t) => t.length > 3 && !SPANISH_STOPWORDS.has(t));
      const matching = tokens.filter((t) => normQuote.includes(t));
      return quoteHasLegalTerms && tokens.length > 0 && matching.length / tokens.length >= 0.5;
    }

    const tokens = normCp.split(" ").filter((t) => t.length > 2 && !SPANISH_STOPWORDS.has(t));
    const matching = tokens.filter((t) => normQuote.includes(t));
    return tokens.length > 0 && matching.length / tokens.length >= 0.45;
  });

  if (survivingProps.length === 0) {
    return verifiedDesc;
  }

  if (survivingProps.length < candidateProps.length) {
    return formatReconstructedPropositions(survivingProps.map((p) => p.text));
  }

  return candidateText;
}

/**
 * Step 13: Final Pre-PDF Sweep
 * Runs immediately before PDF rendering.
 * Sweeps findings, scrubs executive summary and objective, updates live counters.
 */
export function sweepReportForPdfPublication<T extends { findings?: any[]; report?: any; documents?: any[] }>(
  data: T,
): T {
  const findings = data.findings ?? [];
  const report = data.report ?? {};
  const c = ((data as any).case ?? {}) as Record<string, unknown>;

  const context: PublicationContext = {
    executionId: (c.execution_id as string) ?? null,
    caseType: (c.case_type as string) ?? null,
    isConcludedAudit: c.case_analysis_mode === "concluded_audit",
    hasIdentifiedClient: Boolean(c.client_id || (c.matter_metadata as any)?.client_name),
    proceduralAvailabilityVerified: false,
  };

  // Classify and validate all findings
  const { published, all } = classifyValidatePublishClaims(findings, context);

  // Collect all unsupported/stripped propositions for section scrubbing (Rule 3)
  const unsupportedPropositions: string[] = [];
  for (const item of all) {
    if (item.publication_status === "SUPPRESSED" || item.publication_status === "QUARANTINED") {
      const rawTitle = item.original_claim.split(": ")[0];
      const rawDesc = item.original_claim.split(": ").slice(1).join(": ");
      if (rawTitle && rawTitle.length > 5) unsupportedPropositions.push(rawTitle);
      if (rawDesc && rawDesc.length > 5) unsupportedPropositions.push(rawDesc);
    }
    const diag = (item.metadata as any)?.claim_entailment_diagnostic;
    if (Array.isArray(diag?.stripped_propositions)) {
      unsupportedPropositions.push(...diag.stripped_propositions);
    }
    if (Array.isArray(diag?.atomic_evaluation?.failed_texts)) {
      unsupportedPropositions.push(...diag.atomic_evaluation.failed_texts);
    }
  }

  // Map published StandardClaimObjects back to finding row shapes
  const survivingFindingIds = new Set(published.map((p) => p.claim_id));
  const activeFindingsForPdf = findings
    .filter((f: any) => survivingFindingIds.has(String(f.id)))
    .map((f: any) => {
      const pub = published.find((p) => p.claim_id === String(f.id));
      if (!pub) return f;

      const isParty =
        pub.claim_type === "PARTY_ALLEGATION" ||
        pub.speaker === "party" ||
        pub.is_party_allegation === true ||
        (pub.metadata?.deterministic_attribution as any)?.isPartyAllegation === true;

      const canonicalTitle =
        pub.canonical_title ||
        pub.repaired_title ||
        (pub.repaired_claim ? pub.repaired_claim.split(": ")[0] : f.title);

      const canonicalDesc =
        pub.canonical_description ||
        pub.repaired_description ||
        (pub.repaired_claim ? pub.repaired_claim.split(": ").slice(1).join(": ") : f.description);

      // Rule 4: Enforce downstream text cannot add unverified propositions
      const finalDesc = enforceNoAddedPropositions(canonicalDesc, pub);

      const canonicalSpeakerRole = isParty
        ? ((pub.metadata?.deterministic_attribution as any)?.roleLabel || "quejoso")
        : f.speaker_role;

      const candidateFinding: any = {
        ...f,
        title: canonicalTitle,
        description: finalDesc,
        speaker_role: canonicalSpeakerRole,
        finding_status: "verified",
        verification_status: "verified",
        lifecycle_status: null,
        audit_classification: isParty ? "PARTY_ALLEGATION" : f.audit_classification,
        content_class: isParty ? "PARTY_ARGUMENT" : f.content_class,
        proposition_type: isParty ? "party_argument" : f.proposition_type,
        adoption_status: isParty ? "party_position" : f.adoption_status,
      };

      const canonicalSpeakerBadge = formatSpeakerRoleBadge(candidateFinding);
      candidateFinding.speaker_role_label = canonicalSpeakerBadge;
      candidateFinding.metadata = {
        ...(f.metadata || {}),
        published_claim: pub,
        speaker_role_badge: canonicalSpeakerBadge,
        raw_unreconciled_title: f.title,
        raw_unreconciled_description: f.description,
      };

      return candidateFinding;
    });

  // Synchronize report_presentation if already constructed
  if ((data as any).report_presentation) {
    const pres = (data as any).report_presentation;
    if (Array.isArray(pres.finding_cards)) {
      pres.finding_cards = pres.finding_cards
        .filter((card: any) => survivingFindingIds.has(String(card.finding?.id)))
        .map((card: any) => {
          const updated = activeFindingsForPdf.find((f: any) => String(f.id) === String(card.finding?.id));
          if (!updated) return card;
          const pub = published.find((p) => p.claim_id === String(updated.id));
          const safeDesc = pub
            ? enforceNoAddedPropositions(card.finding?.description || updated.description, pub)
            : updated.description;
          return { ...card, finding: { ...updated, description: safeDesc } };
        });
    }
    if (pres.snapshot && Array.isArray(pres.snapshot.priorityReview)) {
      const suppressedClaims = all.filter(
        (c) => c.publication_status === "SUPPRESSED" || c.publication_status === "QUARANTINED",
      );
      pres.snapshot.priorityReview = pres.snapshot.priorityReview
        .filter((text: string) => {
          return !suppressedClaims.some((s) => {
            const rawTitle = s.original_claim.split(": ")[0];
            return text.includes(rawTitle);
          });
        })
        .map((text: string) => {
          for (const pub of published) {
            if (pub.publication_status === "REPAIRED" && pub.canonical_title) {
              const rawTitle = pub.original_claim.split(": ")[0];
              if (rawTitle && text.includes(rawTitle)) {
                return text.replace(rawTitle, pub.canonical_title);
              }
            }
          }
          return text;
        });
    }
  }

  // Sanitize executive summary and objective
  const { executiveSummary, objective } = sanitizeReportObjectiveAndProse(report, published, context);

  const updatedReport = {
    ...report,
    executive_summary: executiveSummary,
    findings_count: activeFindingsForPdf.length,
    full_report: {
      ...((report.full_report as Record<string, unknown>) ?? {}),
      prose: {
        ...(((report.full_report as Record<string, unknown>)?.prose as Record<string, unknown>) ?? {}),
        executive_summary: executiveSummary,
      },
      objective: objective,
      final_published_claims: published,
      all_publication_diagnostics: all,
    },
  };

  // Rule 3: Scrub any unsupported proposition text across all report sections
  scrubUnsupportedPropositionsFromSections(updatedReport, (data as any).report_presentation, unsupportedPropositions);

  return {
    ...data,
    findings: activeFindingsForPdf,
    report: updatedReport,
  };
}

/**
 * Attempts existing fuzzy (whitespace/accent folding) or page-offset verification
 * for a citation reference against candidate pages of its identified document.
 */
export function attemptCitationFuzzyOrPageOffset(
  ref: Record<string, any>,
  pages: MatterSourcePage[],
  docIndex: Array<{ doc_n: number; document_id: string }>,
): Record<string, any> | null {
  const quote = String(ref.quote ?? ref.excerpt ?? ref.source_quote ?? "").trim();
  if (!quote || quote.length < 8) return null;

  const locId =
    ref.document_id ??
    ref.doc_id ??
    docIndex.find((d) => d.doc_n === Number(ref.doc_n))?.document_id;
  if (!locId) return null;

  const docCandidates = pages.filter((p) => p.document_id === locId);
  if (!docCandidates.length) return null;

  const targetPage = Number(ref.page ?? ref.page_number ?? ref.page_located ?? 1);

  // Sort candidate pages by proximity to claimed page (page-offset search)
  const sortedCandidates = docCandidates.slice().sort((a, b) =>
    Math.abs(a.page - targetPage) - Math.abs(b.page - targetPage)
  );

  const qNorm = quote.normalize("NFC").replace(/\s+/g, " ").trim();

  // 1. Candidate search by page proximity
  for (const cand of sortedCandidates) {
    if (cand.text.includes(quote)) {
      return {
        ...ref,
        quote,
        document_id: cand.document_id,
        page: cand.page,
        page_number: cand.page,
        page_located: cand.page,
        label: `p.${cand.page}`,
        filename: cand.filename,
        page_extraction_ref: `${cand.document_id}:${cand.page}`,
      };
    }

    const span = locateQuoteInText(quote, cand.text);
    if (span) {
      const realSlice = cand.text.slice(span.start, span.end).trim();
      if (realSlice.length >= 8) {
        return {
          ...ref,
          quote: realSlice,
          document_id: cand.document_id,
          page: cand.page,
          page_number: cand.page,
          page_located: cand.page,
          label: `p.${cand.page}`,
          filename: cand.filename,
          page_extraction_ref: `${cand.document_id}:${cand.page}`,
        };
      }
    }
  }

  return null;
}

export interface ReconcileCitationsInput {
  reportRow: Record<string, any>;
  findings: Array<Record<string, any>>;
  pages: MatterSourcePage[];
  docIndex: Array<{ doc_n: number; document_id: string }>;
  context?: PublicationContext;
  db?: any;
}

export interface ReconcileCitationsOutput {
  activeFindings: Array<Record<string, any>>;
  quarantinedFindings: Array<Record<string, any>>;
  survivingCitations: Array<Record<string, any>>;
  quarantinedCitations: Array<Record<string, any>>;
  diagnosticWarnings: string[];
  reportRow: Record<string, any>;
  hasVerifiedContent: boolean;
  locationsAudit: {
    ok: boolean;
    errors: string[];
    verified: Array<Record<string, any>>;
    failed_refs: Array<{ index: number; ref: Record<string, any>; reason: string }>;
    diagnostic_warnings: string[];
    quarantined_citations: Array<Record<string, any>>;
    quarantined_claims: Array<{ id: string; title: string }>;
    unique_citations: number;
    checked: number;
    citation_audit_status: string;
  };
}

/**
 * Priority #1 & #2 Invariant: Strict on claims, permissive on report release.
 *
 * Citation verification:
 * 1. Checks exact and relocated citations against physical pages.
 * 2. Attempts existing fuzzy / page-offset verification for any citation that fails.
 * 3. If verification still fails, identifies the dependent claim(s) and quarantines them
 *    via Final Claim Publication Control.
 * 4. Rebuilds active counters and summary/prose from remaining approved claims.
 * 5. A citation-level failure NEVER independently sets REPORT_BLOCKED when other verified
 *    report content exists. Diagnostic warnings and audit trail are preserved.
 */
export async function reconcileCitationsAndDependentClaims(
  input: ReconcileCitationsInput,
): Promise<ReconcileCitationsOutput> {
  const reportRow = { ...input.reportRow };
  const fullReport = { ...((reportRow.full_report as Record<string, any>) ?? {}) };
  reportRow.full_report = fullReport;

  const pages = input.pages ?? [];
  const docIndex = input.docIndex ?? [];
  const context = input.context ?? {};
  const db = input.db;

  const findings = [...(input.findings ?? [])];
  const diagnosticWarnings: string[] = [];

  // Collect all citations and stamp with parent context where known
  const stampedReportCitations = (
    Array.isArray(reportRow.citations) ? reportRow.citations : []
  ).map((c: any) => ({ ...c, __origin: "report_citations" }));

  const stampedFindingRefs: Array<Record<string, any>> = [];
  for (const f of findings) {
    if (Array.isArray(f.evidence_refs)) {
      for (const er of f.evidence_refs) {
        if (er && typeof er === "object") {
          stampedFindingRefs.push({
            ...er,
            __origin: "finding_evidence_ref",
            __parent_finding_id: f.id,
            __parent_finding_title: f.title,
          });
        }
      }
    }
  }

  const coreItems = Array.isArray(fullReport.mandatory_decision_core?.items)
    ? fullReport.mandatory_decision_core.items
    : [];
  const stampedCoreRefs: Array<Record<string, any>> = [];
  for (const ci of coreItems) {
    if (Array.isArray(ci.source_refs)) {
      for (const sr of ci.source_refs) {
        if (sr && typeof sr === "object") {
          stampedCoreRefs.push({
            ...sr,
            __origin: "core_source_ref",
            __parent_core_id: ci.id,
          });
        }
      }
    }
  }

  const allRefs = [...stampedReportCitations, ...stampedFindingRefs, ...stampedCoreRefs];
  const relocatedRefs = relocateSourceRefs(allRefs, pages, docIndex);

  // Initial audit
  let auditResult = auditSourceLocations(relocatedRefs, pages, docIndex);

  // Attempt fuzzy/page-offset recovery for any failed refs
  const stillFailedRefs: Array<{ index: number; ref: Record<string, any>; reason: string }> = [];
  const verifiedCitations = [...auditResult.verified];

  if (!auditResult.ok && auditResult.failed_refs) {
    for (const failed of auditResult.failed_refs) {
      const recovered = attemptCitationFuzzyOrPageOffset(failed.ref, pages, docIndex);
      if (recovered) {
        const recheck = auditSourceLocations([recovered], pages, docIndex);
        if (recheck.ok && recheck.verified.length > 0) {
          verifiedCitations.push(recheck.verified[0]);
          continue;
        }
      }
      stillFailedRefs.push(failed);
    }
  }

  // Process still-failed citations: quarantine dependent claims
  const quarantinedFindings: Array<Record<string, any>> = [];
  const quarantinedFindingIds = new Set<string>();
  const quarantinedCoreIds = new Set<string>();

  for (const failed of stillFailedRefs) {
    const failedRef = failed.ref;
    const failedQuote = (failedRef.quote ?? failedRef.source_quote ?? "")
      .normalize("NFC")
      .replace(/\s+/g, " ")
      .trim();
    const parentFindingId = failedRef.__parent_finding_id || failedRef.finding_id || failedRef.claim_id;

    // Identify dependent findings
    const dependent = findings.filter((f) => {
      if (parentFindingId && String(f.id) === String(parentFindingId)) return true;
      if (
        failedQuote &&
        f.source_quote &&
        f.source_quote.normalize("NFC").replace(/\s+/g, " ").trim() === failedQuote
      ) {
        return true;
      }
      if (
        Array.isArray(f.evidence_refs) &&
        f.evidence_refs.some((er: any) => {
          if (!er) return false;
          if (er === failedRef) return true;
          const erQuote = (er.quote ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
          return failedQuote && erQuote === failedQuote;
        })
      ) {
        return true;
      }
      return false;
    });

    for (const f of dependent) {
      if (!quarantinedFindingIds.has(String(f.id))) {
        quarantinedFindingIds.add(String(f.id));
        f.finding_status = "suppressed";
        f.lifecycle_status = "quarantined";
        f.verification_status = "unverified";
        f.audit_classification = "QUARANTINED";
        f.metadata = {
          ...(f.metadata || {}),
          quarantined: true,
          suppression_reason: `Cita no verificable en el expediente (${failed.reason}). Reclamo puesto en cuarentena por control de publicación.`,
          citation_error: failed.reason,
        };
        quarantinedFindings.push(f);

        const warning = `${failed.reason} Reclamo dependiente "${f.title || f.id}" puesto en cuarentena por control de publicación.`;
        diagnosticWarnings.push(warning);

        if (db) {
          try {
            await db
              .from("case_findings")
              .update({
                finding_status: "suppressed",
                lifecycle_status: "quarantined",
                verification_status: "unverified",
                audit_classification: "QUARANTINED",
                metadata: f.metadata,
              })
              .eq("id", f.id);
          } catch (dbErr) {
            console.warn(`[reconcileCitations] DB update for quarantined finding ${f.id} skipped:`, dbErr);
          }
        }
      }
    }

    // Identify dependent mandatory decision core items
    if (failedRef.__parent_core_id) {
      quarantinedCoreIds.add(String(failedRef.__parent_core_id));
      diagnosticWarnings.push(
        `${failed.reason} Punto resolutivo [${failedRef.__parent_core_id}] puesto en cuarentena por cita no verificada.`,
      );
    }

    if (!dependent.length && !failedRef.__parent_core_id) {
      diagnosticWarnings.push(`${failed.reason} Cita huérfana eliminada del anexo.`);
    }
  }

  // Filter surviving active findings
  const activeFindings = findings.filter(
    (f) =>
      !quarantinedFindingIds.has(String(f.id)) &&
      f.finding_status !== "suppressed" &&
      f.lifecycle_status !== "quarantined",
  );

  // Filter surviving citations in reportRow.citations
  const survivingCitations = (Array.isArray(reportRow.citations) ? reportRow.citations : []).filter(
    (c: any) => {
      const q = (c.quote ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
      const failedMatch = stillFailedRefs.some(
        (fr) => (fr.ref.quote ?? "").normalize("NFC").replace(/\s+/g, " ").trim() === q,
      );
      const isQuarantinedFinding = c.finding_id && quarantinedFindingIds.has(String(c.finding_id));
      return !failedMatch && !isQuarantinedFinding;
    },
  );

  // Filter surviving core items
  if (quarantinedCoreIds.size > 0 && Array.isArray(fullReport.mandatory_decision_core?.items)) {
    fullReport.mandatory_decision_core.items = fullReport.mandatory_decision_core.items.filter(
      (ci: any) => !quarantinedCoreIds.has(String(ci.id)),
    );
  }

  // Rebuild counters
  reportRow.findings_count = activeFindings.length;
  reportRow.citations = survivingCitations;
  fullReport.active_findings_count = activeFindings.length;
  fullReport.quarantined_findings_count =
    (Number(fullReport.quarantined_findings_count) || 0) + quarantinedFindings.length;
  fullReport.quarantined_findings = [
    ...(Array.isArray(fullReport.quarantined_findings) ? fullReport.quarantined_findings : []),
    ...quarantinedFindings,
  ];
  fullReport.reconciled_findings = activeFindings;

  // Rebuild published claims & prose from surviving claims
  const { published, all } = classifyValidatePublishClaims(activeFindings, context);
  fullReport.final_published_claims = published;
  fullReport.all_publication_diagnostics = all;

  const sanitized = sanitizeReportObjectiveAndProse(reportRow, published, context);
  reportRow.executive_summary = sanitized.executiveSummary;
  fullReport.prose = {
    ...((fullReport.prose as Record<string, any>) || {}),
    executive_summary: sanitized.executiveSummary,
  };
  fullReport.objective = sanitized.objective;

  // Invariant check: Never block report when other verified content exists
  const hasVerifiedContent = activeFindings.length > 0 || published.length > 0;

  if (hasVerifiedContent) {
    const nonCitationBlockReasons = (
      Array.isArray(reportRow.quality_block_reasons) ? reportRow.quality_block_reasons : []
    ).filter(
      (r: string) =>
        !r.includes("Las citas deben coincidir") &&
        !r.includes("no se pudo verificar la cita literal") &&
        !r.startsWith("Cita ") &&
        !r.includes("citation_not_verified") &&
        !r.includes("CITATION_UNRESOLVED"),
    );
    reportRow.quality_block_reasons = nonCitationBlockReasons;
    if (nonCitationBlockReasons.length === 0) {
      reportRow.quality_blocked = false;
    }
  } else {
    reportRow.quality_blocked = true;
    reportRow.quality_block_reasons = [
      "Todas las citas del informe fallaron la verificación documental; no queda contenido verificado para publicar.",
    ];
  }

  const locationsAudit = {
    ok: hasVerifiedContent, // Releases report cleanly because unsupported claims were quarantined
    errors: stillFailedRefs.map((f) => f.reason),
    verified: verifiedCitations,
    failed_refs: stillFailedRefs,
    quarantined_citations: stillFailedRefs.map((f) => f.ref),
    quarantined_claims: quarantinedFindings.map((f) => ({ id: String(f.id), title: String(f.title || f.id) })),
    diagnostic_warnings: diagnosticWarnings,
    unique_citations: verifiedCitations.length,
    checked: allRefs.length,
    citation_audit_status:
      stillFailedRefs.length > 0 ? "PASSED_WITH_QUARANTINED_CITATIONS" : "ALL_CITATIONS_VERIFIED",
  };

  fullReport.source_location_audit = locationsAudit;
  fullReport.release_warnings = [
    ...(Array.isArray(fullReport.release_warnings) ? fullReport.release_warnings : []),
    ...diagnosticWarnings,
  ];

  return {
    activeFindings,
    quarantinedFindings,
    survivingCitations,
    quarantinedCitations: stillFailedRefs.map((f) => f.ref),
    diagnosticWarnings,
    reportRow,
    hasVerifiedContent,
    locationsAudit,
  };
}

