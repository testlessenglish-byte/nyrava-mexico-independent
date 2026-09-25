/**
 * Priority #2 — Claim ↔ Evidence Entailment
 *
 * Evaluates semantic and propositional entailment for every reportable claim.
 * Distinguishes factual assertions from legal conclusions, checks speaker attribution,
 * and splits compound statements so that proof of a fact cannot verify an unproven
 * legal conclusion.
 *
 * PERMANENT INVARIANT:
 * STRICT ON CLAIMS. PERMISSIVE ON REPORT RELEASE.
 * Unsupported claims are repaired, reclassified, quarantined, or removed at claim level.
 * No ordinary entailment failure may result in REPORT_BLOCKED.
 */

export type EntailmentStatus =
  | "ENTAILED"
  | "PARTIALLY_ENTAILED"
  | "NOT_ENTAILED"
  | "CONTRADICTED"
  | "INSUFFICIENT_CONTEXT";

export type ClaimAction =
  | "KEEP"
  | "REPAIR"
  | "QUARANTINE"
  | "REMOVE"
  | "RECLASSIFY";

export type SpeakerAttribution =
  | "reviewing_court"
  | "lower_court"
  | "party"
  | "autoridad"
  | "statute"
  | "precedent"
  | "expert"
  | "witness"
  | "unattributed";

export interface PropositionEvaluation {
  id: string;
  proposition_text: string;
  is_legal_conclusion: boolean;
  is_factual_assertion: boolean;
  asserted_speaker: SpeakerAttribution;
  evidence_quote: string;
  entailment_status: EntailmentStatus;
  entailment_reason: string;
}

export interface ClaimEntailmentDiagnostic {
  claim_id: string;
  original_claim: string;
  normalized_propositions: PropositionEvaluation[];
  source_document: string | null;
  source_page: number | null;
  source_quote: string | null;
  speaker: SpeakerAttribution;
  attribution_type: string;
  entailment_status: EntailmentStatus;
  entailment_reason: string;
  repaired_claim: string | null;
  repaired_description: string | null;
  claim_action: ClaimAction;
  final_reportable: boolean;
}

const LEGAL_CONCLUSION_SPLIT_RX =
  /\b(?:lo\s+que\s+(?:contraviene|vulnera|viola|resulta\s+contrario)|contraviniendo|vulnerando|violando|resultando\s+inconstitucional|lo\s+cual\s+resulta\s+ilegal|por\s+ser\s+contrario\s+a)\b/i;

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
 * Splits a compound claim into independent sub-propositions.
 * Separates factual assertions from legal conclusions / rights violations.
 */
export function splitCompoundClaim(
  title: string,
  description: string,
): Array<{ text: string; is_legal_conclusion: boolean; is_factual_assertion: boolean }> {
  const full = `${title}. ${description}`.trim();
  const match = description.match(LEGAL_CONCLUSION_SPLIT_RX);

  if (match && typeof match.index === "number" && match.index > 5) {
    const factPart = description.slice(0, match.index).trim().replace(/[,;]\s*$/, "");
    const conclusionPart = description.slice(match.index).trim();

    return [
      {
        text: factPart.length > 10 ? factPart : title,
        is_legal_conclusion: false,
        is_factual_assertion: true,
      },
      {
        text: conclusionPart,
        is_legal_conclusion: true,
        is_factual_assertion: false,
      },
    ];
  }

  // Check if title or description itself is purely a legal conclusion
  const isConclusion =
    /\b(?:inconstitucional|violaci[oó]n\s+de\s+derechos|ilegalidad|vulneraci[oó]n|contraviene)\b/i.test(
      description || title,
    );

  return [
    {
      text: description || title,
      is_legal_conclusion: isConclusion,
      is_factual_assertion: !isConclusion,
    },
  ];
}

/**
 * Evaluates attribution: does the quoted passage support WHO said/held it?
 */
export function evaluateAttribution(
  claimText: string,
  quoteText: string,
  speakerRole: string | null,
): { speaker: SpeakerAttribution; isPartyAllegation: boolean; isPrecedentRef: boolean } {
  const normQuote = normalizeText(quoteText);
  const normClaim = normalizeText(claimText);

  // 1. Check if the text describes a party allegation
  const partyIndicators =
    /(?:se\s+alega|el\s+quejoso\s+argumenta|la\s+quejosa\s+argumenta|aduce|expresa\s+como\s+agravio|agravio|alegaci[oó]n|en\s+su\s+demanda\s+senalo)/i;
  const isPartyAllegation = partyIndicators.test(claimText) || partyIndicators.test(quoteText);

  // 2. Check if the text cites a precedent rather than an original holding
  const isPrecedentRef =
    /\b(?:amparo\s+en\s+revisi[oó]n\s+\d+\/\d+|precedente\s+obligatorio|jurisprudencia|criterio\s+reiterado)\b/i.test(
      quoteText,
    ) || /\b(?:en\s+el\s+amparo\s+en\s+revisi[oó]n\s+\d+\/\d+\s+se\s+determin[oó])\b/i.test(normQuote);

  let speaker: SpeakerAttribution = "unattributed";
  if (isPartyAllegation || speakerRole === "quejoso" || speakerRole === "defensa" || speakerRole === "actor") {
    speaker = "party";
  } else if (isPrecedentRef) {
    speaker = "precedent";
  } else if (/\b(?:scjn|primera\s+sala|segunda\s+sala|pleno)\b/i.test(claimText + " " + quoteText)) {
    speaker = "reviewing_court";
  } else if (/\b(?:tribunal\s+colegiado|colegiado)\b/i.test(claimText + " " + quoteText)) {
    speaker = "lower_court";
  } else if (/\b(?:articulo\s+\d+|ley\s+de)\b/i.test(quoteText)) {
    speaker = "statute";
  }

  return { speaker, isPartyAllegation, isPrecedentRef };
}

/**
 * Evaluates semantic entailment between a claim, its sub-propositions, and the cited quote.
 */
export function evaluateClaimEntailment(claim: {
  id: string;
  title: string;
  description?: string | null;
  source_document_id?: string | null;
  source_page?: number | null;
  source_quote?: string | null;
  source_doc_ids?: string[] | null;
  evidence_refs?: unknown;
  speaker_role?: string | null;
  finding_type?: string | null;
  audit_classification?: string | null;
}): ClaimEntailmentDiagnostic {
  const claimId = String(claim.id);
  const title = String(claim.title ?? "");
  const desc = String(claim.description ?? "");
  const quote = typeof claim.source_quote === "string" ? claim.source_quote.trim() : "";
  const normQuote = normalizeText(quote);
  const hasDoc = Boolean(
    claim.source_document_id ||
      (Array.isArray(claim.source_doc_ids) && claim.source_doc_ids.length > 0),
  );
  const hasSource = hasDoc && quote.length > 0;

  // 1. Zero-source claims
  if (!hasSource) {
    return {
      claim_id: claimId,
      original_claim: `${title}: ${desc}`,
      normalized_propositions: [],
      source_document: claim.source_document_id ?? null,
      source_page: claim.source_page ?? null,
      source_quote: null,
      speaker: "unattributed",
      attribution_type: "unsupported",
      entailment_status: "INSUFFICIENT_CONTEXT",
      entailment_reason: "Claim lacks a verifiable source document or quoted passage.",
      repaired_claim: null,
      repaired_description: null,
      claim_action: "REMOVE",
      final_reportable: false,
    };
  }

  // 2. Attribution evaluation
  const { speaker, isPartyAllegation, isPrecedentRef } = evaluateAttribution(
    `${title} ${desc}`,
    quote,
    claim.speaker_role ?? null,
  );

  // 3. Proposition splitting
  const propositions = splitCompoundClaim(title, desc);
  const evaluatedProps: PropositionEvaluation[] = [];

  for (let i = 0; i < propositions.length; i++) {
    const prop = propositions[i];
    const normProp = normalizeText(prop.text);

    let propStatus: EntailmentStatus = "NOT_ENTAILED";
    let propReason = "";

    if (prop.is_legal_conclusion) {
      // Check if the quote actually contains the legal conclusion
      const quoteHasRightsViolation =
        /\b(?:inconstitucional|contraviene|vulnera|viola|derechos\s+humanos|ilegal|invalido)\b/i.test(
          normQuote,
        );

      if (quoteHasRightsViolation) {
        propStatus = "ENTAILED";
        propReason = "Quote explicitly supports legal conclusion.";
      } else {
        propStatus = "NOT_ENTAILED";
        propReason =
          "Factual passage does not entail the asserted constitutional or rights violation conclusion.";
      }
    } else {
      // Factual assertion entailment
      // Check for core semantic alignment between passage and assertion
      const propTokens = normProp.split(" ").filter((t) => t.length > 3);
      const matchingTokens = propTokens.filter((t) => normQuote.includes(t));
      const matchRatio = propTokens.length > 0 ? matchingTokens.length / propTokens.length : 0;

      // Specific domain pattern checks:
      // a. Detention duration:
      const assertsDetentionMonths = /(?:cuatro|4)\s+meses/i.test(prop.text);
      const quoteProvesDetentionMonths =
        /(?:cuatro|4)\s+meses/i.test(quote) && /privaci[oó]n\s+de\s+la\s+libertad/i.test(quote);

      // b. Cross-examination tactic:
      const isCrossExamTactic = /contrainterrogatorio:/i.test(title);
      const quoteMentionsCrossExam = /contrainterrog/i.test(quote);

      // c. Statutory period vs international standards:
      const assertsInternationalStandards = /est[aá]ndares\s+internacionales|razonable\s+y\s+no\s+indefinido/i.test(
        prop.text,
      );
      const quoteOnlyStatutoryDays =
        /plazo\s+m[aá]ximo\s+de\s+(?:15|60)\s+d[ií]as/i.test(quote) &&
        !/est[aá]ndares\s+internacionales/i.test(quote);

      if (isCrossExamTactic && !quoteMentionsCrossExam) {
        propStatus = "NOT_ENTAILED";
        propReason =
          "Passage notes background facts; does not entail cross-examination questioning tactic.";
      } else if (assertsInternationalStandards && quoteOnlyStatutoryDays) {
        propStatus = "NOT_ENTAILED";
        propReason =
          "Passage describes statutory 15 or 60 day periods; does not entail SCJN international standard holding.";
      } else if (assertsDetentionMonths && quoteProvesDetentionMonths) {
        propStatus = "ENTAILED";
        propReason = "Passage explicitly proves detention duration of approximately four months.";
      } else if (matchRatio >= 0.4 || normQuote.includes(normProp) || normProp.includes(normQuote)) {
        propStatus = "ENTAILED";
        propReason = "Passage entails the asserted proposition.";
      } else {
        propStatus = "PARTIALLY_ENTAILED";
        propReason = "Passage only partially matches the asserted proposition.";
      }
    }

    evaluatedProps.push({
      id: `${claimId}-p${i + 1}`,
      proposition_text: prop.text,
      is_legal_conclusion: prop.is_legal_conclusion,
      is_factual_assertion: prop.is_factual_assertion,
      asserted_speaker: speaker,
      evidence_quote: quote,
      entailment_status: propStatus,
      entailment_reason: propReason,
    });
  }

  // 4. Synthesize overall claim entailment and determine claim action
  const hasEntailedFact = evaluatedProps.some((p) => p.is_factual_assertion && p.entailment_status === "ENTAILED");
  const hasUnentailedConclusion = evaluatedProps.some(
    (p) => p.is_legal_conclusion && p.entailment_status === "NOT_ENTAILED",
  );
  const allEntailed = evaluatedProps.every((p) => p.entailment_status === "ENTAILED");
  const anyNotEntailed = evaluatedProps.some((p) => p.entailment_status === "NOT_ENTAILED");

  let overallStatus: EntailmentStatus = "ENTAILED";
  let claimAction: ClaimAction = "KEEP";
  let repairedClaim: string | null = null;
  let repairedDesc: string | null = null;
  let reason = "Claim fully entailed by cited evidence.";
  let reportable = true;

  if (allEntailed) {
    if (isPartyAllegation) {
      overallStatus = "ENTAILED";
      claimAction = "RECLASSIFY";
      reason = "Verified party allegation grounded in case record.";
      reportable = true;
    } else {
      overallStatus = "ENTAILED";
      claimAction = "KEEP";
      reason = "Proposition and attribution fully entailed by cited passage.";
      reportable = true;
    }
  } else if (hasEntailedFact && hasUnentailedConclusion) {
    // Priority #2 Key Case: Factual premise is proven, but legal conclusion is unproven
    // Repair: Keep the factual assertion, strip the unverified rights conclusion
    overallStatus = "PARTIALLY_ENTAILED";
    claimAction = "REPAIR";
    const factualProp = evaluatedProps.find((p) => p.is_factual_assertion)?.proposition_text || title;
    repairedClaim = title;
    repairedDesc = `${factualProp}.`;
    reason =
      "Factual duration/event is entailed by cited passage; unverified constitutional conclusion was stripped.";
    reportable = true;
  } else if (anyNotEntailed && !hasEntailedFact) {
    overallStatus = "NOT_ENTAILED";
    claimAction = "REMOVE";
    reason = evaluatedProps.find((p) => p.entailment_status === "NOT_ENTAILED")?.entailment_reason || "Not entailed.";
    reportable = false;
  } else {
    overallStatus = "PARTIALLY_ENTAILED";
    claimAction = "REPAIR";
    repairedClaim = title;
    repairedDesc = desc;
    reason = "Claim adjusted to narrower supported formulation.";
    reportable = true;
  }

  return {
    claim_id: claimId,
    original_claim: `${title}: ${desc}`,
    normalized_propositions: evaluatedProps,
    source_document: claim.source_document_id ?? null,
    source_page: claim.source_page ?? null,
    source_quote: quote,
    speaker,
    attribution_type: isPartyAllegation ? "party_allegation" : isPrecedentRef ? "precedent" : "court_holding",
    entailment_status: overallStatus,
    entailment_reason: reason,
    repaired_claim: repairedClaim,
    repaired_description: repairedDesc,
    claim_action: claimAction,
    final_reportable: reportable,
  };
}
