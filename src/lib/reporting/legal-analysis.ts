type Row = Record<string, any>;

const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
const normalize = (value: unknown) => typeof value === "string"
  ? value.normalize("NFC").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().replace(/[.!?]$/, "")
  : "";

/** Build IRAC application entries only from the exact, verified proposition
 * that the report's citation appendix will certify. Do not attach a citation
 * for a source quote to an expanded finding paraphrase. */
export function buildVerifiedLegalAnalysis(findings: Row[], citations: Row[]): Row[] {
  return rows(findings).flatMap((finding) => {
    const sourceRefs = rows(finding.evidence_refs);
    const citation = citations.find((candidate) => sourceRefs.some((ref) =>
      ref.document_id === candidate.document_id &&
      Number(ref.page ?? ref.page_number ?? ref.source_page) === Number(candidate.page) &&
      normalize(ref.quote ?? ref.excerpt ?? ref.source_quote) === normalize(candidate.quote)) &&
      candidate.verification_status === "verified" &&
      candidate.publication_status !== "QUARANTINED" &&
      typeof candidate.proposition_supported === "string" && candidate.proposition_supported.trim() &&
      Number.isSafeInteger(candidate.doc_n) && Number.isSafeInteger(candidate.page));
    if (!citation) return [];

    const proposition = String(citation.proposition_supported).trim();
    return [{
      issue: `Evidentiary significance of: ${finding.title ?? proposition}`,
      rule: "La valoración jurídica debe limitarse a lo que la fuente verificada permite afirmar.",
      application: `“${proposition}” [DOC ${citation.doc_n} p.${citation.page}]`,
      conclusion: "El alcance jurídico de este pasaje debe determinarse conforme a la norma aplicable al asunto.",
      cited_evidence: [String(citation.quote)],
    }];
  });
}
