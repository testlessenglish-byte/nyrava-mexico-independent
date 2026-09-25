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
  type ClaimEntailmentDiagnostic,
  type EntailmentStatus,
  type SpeakerAttribution,
} from "./claim-evidence-entailment";
import { formatSpeakerRoleBadge, type SpeakerRoleBadge } from "./concluded-case-governance";

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

  let publicationStatus: PublicationStatus = "APPROVED";
  let suppressionReason: string | null = null;
  let repairedClaim: string | null = entailmentDiag.repaired_claim;
  let repairedDesc: string | null = entailmentDiag.repaired_description;

  if (isExplicitHolding) {
    publicationStatus = "APPROVED";
  } else if (!entailmentDiag.final_reportable || entailmentDiag.claim_action === "REMOVE") {
    publicationStatus = "SUPPRESSED";
    suppressionReason = entailmentDiag.entailment_reason;
  } else if (entailmentDiag.claim_action === "QUARANTINE") {
    publicationStatus = "QUARANTINED";
    suppressionReason = entailmentDiag.entailment_reason;
  } else if (entailmentDiag.claim_action === "REPAIR") {
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
    if (entailmentDiag.claim_action === "REPAIR") {
      publicationStatus = "REPAIRED";
    } else {
      publicationStatus = "APPROVED";
    }
  }

  const allowedSection = getAllowedSectionForClaim(claimType);

  return {
    claim_id: claimId,
    execution_id: context.executionId ?? (rawClaim.execution_id as string) ?? null,
    original_claim: `${title}: ${desc}`,
    repaired_claim: repairedClaim ? `${repairedClaim}: ${repairedDesc ?? desc}` : null,
    source_agent: (rawClaim.source_module as string) ?? (rawClaim.agent_type as string) ?? null,
    claim_type: claimType,
    speaker,
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
        speaker,
        roleLabel,
        badge,
        isPartyAllegation,
      },
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

  // Map published StandardClaimObjects back to finding row shapes
  const survivingFindingIds = new Set(published.map((p) => p.claim_id));
  const activeFindingsForPdf = findings
    .filter((f: any) => survivingFindingIds.has(String(f.id)))
    .map((f: any) => {
      const pub = published.find((p) => p.claim_id === String(f.id));
      if (!pub) return f;

      const repairedDesc = pub.repaired_claim
        ? pub.repaired_claim.split(": ").slice(1).join(": ")
        : f.description;

      return {
        ...f,
        description: repairedDesc,
        speaker_role: pub.speaker !== "unattributed" ? (f.speaker_role ?? "quejoso") : f.speaker_role,
        speaker_role_label: pub.attribution,
        finding_status: "verified",
        verification_status: "verified",
        lifecycle_status: null,
        metadata: {
          ...(f.metadata || {}),
          published_claim: pub,
          speaker_role_badge: pub.attribution,
        },
      };
    });

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

  return {
    ...data,
    findings: activeFindingsForPdf,
    report: updatedReport,
  };
}
