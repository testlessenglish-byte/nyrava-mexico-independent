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
  stripped_propositions?: string[];
  atomic_evaluation?: {
    total: number;
    passed: number;
    failed: number;
    passed_texts: string[];
    failed_texts: string[];
  };
}

export const SPANISH_STOPWORDS = new Set([
  "de", "la", "que", "el", "en", "y", "a", "los", "del", "se", "las", "por", "un", "para", "con", "no", "una",
  "su", "al", "lo", "como", "mas", "pero", "sus", "le", "ya", "o", "este", "si", "porque", "esta", "entre",
  "cuando", "muy", "sin", "sobre", "tambien", "me", "hasta", "hay", "donde", "quien", "desde", "todo", "nos",
  "durante", "todos", "uno", "les", "ni", "contra", "otros", "ese", "eso", "ante", "ellos", "e", "esto", "mi",
  "antes", "algunos", "unos", "yo", "otro", "otras", "otra", "tanto", "esa", "estos", "mucho",
  "quienes", "nada", "muchos", "cual", "poco", "ella", "estar", "estas", "algunas", "algo", "nosotros",
  "mis", "tu", "te", "ti", "tus", "ellas", "nosotras", "vosostros", "vosostras", "os", "mio", "mia",
  "mios", "mias", "tuyo", "tuya", "tuyos", "tuyas", "suyo", "suya", "suyos", "suyas", "nuestro", "nuestra",
  "nuestros", "nuestras", "vuestro", "vuestra", "vuestros", "vuestras", "esos", "esas", "aquel", "aquella",
  "aquellos", "aquellas", "hacia", "tras", "mediante", "asimismo", "ademas", "ello", "dicho", "dicha",
  "dichos", "dichas", "cada", "uno", "unos", "una", "unas", "tal", "tales", "primer", "primera", "primero",
]);

export const ATOMIC_CONNECTOR_SPLIT_RX =
  /(?:,\s*|\s+;\s*|\s+)(?:por\s+lo\s+que|por\s+lo\s+tanto|por\s+ende|en\s+consecuencia|de\s+ah[ií]\s+que|derivado\s+de\s+lo\s+cual|con\s+lo\s+cual|por\s+consiguiente|de\s+modo\s+que|de\s+manera\s+que|lo\s+que\s+(?:hace|demuestra|implica|evidencia|conlleva|determina|conduce|obliga|genera|resulta|vulnera|viola|contraviene|constituye|acredita|justifica)|lo\s+cual\s+(?:hace|demuestra|implica|evidencia|conlleva|determina|conduce|obliga|genera|resulta|vulnera|viola|contraviene|constituye|acredita|justifica)|vulnerando|violando|contraviniendo|resultando\s+en|resultando\s+inconstitucional|implicando|generando|evidenciando|demostrando|ocasionando|y\s+(?:por\s+(?:ello|tanto|ende)|en\s+consecuencia))\b|,\s*(?:y|e)\s+(?=[a-záéíóúñ0-9])/i;

export const LEGAL_CONCLUSION_RX =
  /\b(?:inconstitucional|violaci[oó]n|ilegalidad|vulneraci[oó]n|contraviene|vulnera|viola|indemnizaci[oó]n|debi[oó]\s+suspender|debe\s+pagar|responsabilidad|sancionable|arbitrariedad|nulidad|daños\s+y\s+perjuicios|reparaci[oó]n\s+del\s+daño|desacato|procede\s+(?:la\s+indemnizaci[oó]n|el\s+pago)|hace\s+procedente|resulta\s+(?:ilegal|invalido|improcedente|nulo|contrario|injustificado))\b/i;

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
 * Reconstructs a grammatically coherent, published sentence using ONLY
 * propositions that passed independent atomic verification.
 */
export function formatReconstructedPropositions(propositions: string[]): string {
  if (!propositions.length) return "";
  return propositions
    .map((p) => {
      let t = p.trim().replace(/^[,;\s]+/, "");
      t = t.replace(
        /^(?:y|o|e|pero|por\s+lo\s+que|por\s+lo\s+tanto|por\s+ende|en\s+consecuencia|lo\s+que|lo\s+cual|de\s+ah[ií]\s+que|asimismo|adem[aá]s)\s+/i,
        "",
      );
      t = t.charAt(0).toUpperCase() + t.slice(1);
      if (!/[.!?]$/.test(t)) t += ".";
      return t;
    })
    .join(" ");
}

/**
 * Splits a compound claim into independent atomic sub-propositions.
 * Separates factual assertions from legal conclusions, deductions, and secondary consequences.
 */
export function splitCompoundClaim(
  title: string,
  description: string,
): Array<{ text: string; is_legal_conclusion: boolean; is_factual_assertion: boolean }> {
  const fullDesc = (description || title).trim();
  if (!fullDesc) return [];

  // 1. Split on sentence boundaries
  const rawSentences = fullDesc
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ0-9])/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const rawSegments: string[] = [];

  for (const sentence of rawSentences) {
    let rem = sentence;
    let guard = 0;
    while (rem && guard++ < 10) {
      const match = rem.match(ATOMIC_CONNECTOR_SPLIT_RX);
      if (match && typeof match.index === "number" && match.index > 5) {
        const left = rem.slice(0, match.index).trim().replace(/[,;]\s*$/, "");
        const right = rem.slice(match.index).trim();
        if (left.length > 5) {
          rawSegments.push(left);
        }
        rem = right;
      } else {
        if (rem.trim().length > 5) {
          rawSegments.push(rem.trim().replace(/[,;]\s*$/, ""));
        }
        break;
      }
    }
  }

  if (rawSegments.length === 0) {
    rawSegments.push(fullDesc);
  }

  return rawSegments.map((segment) => {
    const cleanedText = segment
      .replace(
        /^([,;\s]+|(?:y|o|e|pero|por\s+lo\s+que|por\s+lo\s+tanto|por\s+ende|en\s+consecuencia|asimismo|adem[aá]s|de\s+ah[ií]\s+que|lo\s+que|lo\s+cual)\s+)+/i,
        "",
      )
      .replace(/[.;,]\s*$/, "")
      .trim();

    const text = cleanedText.length > 5 ? cleanedText : segment;
    const isConclusion = LEGAL_CONCLUSION_RX.test(text);

    return {
      text,
      is_legal_conclusion: isConclusion,
      is_factual_assertion: !isConclusion,
    };
  });
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
        /\b(?:inconstitucional|contraviene|vulnera|viola|derechos\s+humanos|ilegal|invalido|indemnizaci[oó]n|suspender|desacato|sancionable|injustificado)\b/i.test(
          normQuote,
        );

      const propTokens = normProp.split(" ").filter((t) => t.length > 3 && !SPANISH_STOPWORDS.has(t));
      const matchingTokens = propTokens.filter((t) => normQuote.includes(t));
      const matchRatio = propTokens.length > 0 ? matchingTokens.length / propTokens.length : 0;

      if (quoteHasRightsViolation && (matchRatio >= 0.35 || normQuote.includes(normProp))) {
        propStatus = "ENTAILED";
        propReason = "Quote explicitly supports legal conclusion.";
      } else {
        propStatus = "NOT_ENTAILED";
        propReason =
          "Factual passage does not entail the asserted constitutional or rights violation conclusion.";
      }
    } else {
      // Factual assertion / holding / party proposition entailment
      // Strip speech attribution prefix before tokenizing so core substantive tokens are tested
      const cleanedNormProp = normProp.replace(
        /^(?:el\s+quejoso|la\s+quejosa|la\s+parte\s+actora|el\s+actor|la\s+actora|la\s+demandada|el\s+demandado|el\s+tercero\s+interesado|el\s+ministerio\s+p[uú]blico|la\s+autoridad\s+responsable)\s+(?:argumenta|sostiene|alega|aduce|senala|señala|expone|refiere|afirma|solicita)\s+(?:que\s+)?/i,
        "",
      );
      const propTokens = cleanedNormProp.split(" ").filter((t) => t.length > 2 && !SPANISH_STOPWORDS.has(t));
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
      } else if (
        matchRatio >= 0.4 ||
        normQuote.includes(normProp) ||
        normProp.includes(normQuote) ||
        (cleanedNormProp.length > 10 && normQuote.includes(cleanedNormProp))
      ) {
        propStatus = "ENTAILED";
        propReason = "Passage entails the asserted proposition.";
      } else if (isPartyAllegation) {
        // Party allegation grounding in case record
        const quoteHasAllegationRecord =
          /\b(?:agravio|agravios|alega|alegaci[oó]n|argumenta|demanda|recurso|apelaci[oó]n|quejoso|recurrente|pretensi[oó]n|respuesta)\b/i.test(
            normQuote,
          );
        if (quoteHasAllegationRecord || matchRatio >= 0.25) {
          propStatus = "ENTAILED";
          propReason = "Party allegation grounded in case record.";
        } else {
          propStatus = "NOT_ENTAILED";
          propReason = "Passage does not support this proposition (insufficient evidence grounding).";
        }
      } else {
        propStatus = "NOT_ENTAILED";
        propReason = "Passage does not support this proposition (insufficient evidence grounding).";
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
  const passedProps = evaluatedProps.filter((p) => p.entailment_status === "ENTAILED");
  const failedProps = evaluatedProps.filter((p) => p.entailment_status !== "ENTAILED");

  let overallStatus: EntailmentStatus = "ENTAILED";
  let claimAction: ClaimAction = "KEEP";
  let repairedClaim: string | null = null;
  let repairedDesc: string | null = null;
  let reason = "Claim fully entailed by cited evidence.";
  let reportable = true;

  if (passedProps.length > 0 && failedProps.length === 0) {
    // RULE: P1 supported + P2 supported → publish both
    if (isPartyAllegation) {
      overallStatus = "ENTAILED";
      claimAction = "RECLASSIFY";
      reason = "Verified party allegation grounded in case record.";
      repairedClaim = title;
      repairedDesc = desc;
      reportable = true;
    } else {
      overallStatus = "ENTAILED";
      claimAction = "KEEP";
      reason = "All atomic propositions independently entailed by cited evidence.";
      repairedClaim = title;
      repairedDesc = desc;
      reportable = true;
    }
  } else if (passedProps.length > 0 && failedProps.length > 0) {
    // RULE: P1 supported + P2 unsupported → publish P1 ONLY
    // Do NOT discard a valid claim simply because another proposition in the same sentence fails.
    // The final published text must be reconstructed ONLY from propositions that passed verification.
    overallStatus = "PARTIALLY_ENTAILED";
    claimAction = "REPAIR";
    repairedClaim = title;
    repairedDesc = formatReconstructedPropositions(passedProps.map((p) => p.proposition_text));
    reason = `Atomic verification: ${passedProps.length} passed, ${failedProps.length} unsupported propositions removed.`;
    reportable = true;
  } else {
    // RULE: P1 unsupported → quarantine/remove P1
    overallStatus = "NOT_ENTAILED";
    claimAction = "REMOVE";
    repairedClaim = null;
    repairedDesc = null;
    reason = failedProps[0]?.entailment_reason || "No atomic propositions could be verified against cited evidence.";
    reportable = false;
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
    stripped_propositions: failedProps.map((p) => p.proposition_text),
    atomic_evaluation: {
      total: evaluatedProps.length,
      passed: passedProps.length,
      failed: failedProps.length,
      passed_texts: passedProps.map((p) => p.proposition_text),
      failed_texts: failedProps.map((p) => p.proposition_text),
    },
  };
}
