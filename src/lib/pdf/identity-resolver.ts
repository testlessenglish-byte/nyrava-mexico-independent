/**
 * Resolves the safe identity and client metadata for a case.
 * Enforces the rule: NEVER assume a litigant role (quejoso, recurrente) is the firm's client.
 * Only use explicitly stored Nyrava client information.
 */

function asRecord(v: unknown): Record<string, any> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, any>) : {};
}

/** First non-empty string in the list, trimmed. */
function firstText(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Strips appended materia or case type suffix from a client or matter name.
 * e.g. "New Family 1 - Familiar" -> "New Family 1"
 * e.g. "Empresa ABC — Mercantil" -> "Empresa ABC"
 */
export function cleanClientMatterName(name?: string, materia?: string): string {
  if (!name || typeof name !== "string") return "Caso en identificación...";
  let cleaned = name.trim();
  if (materia) {
    const escMat = materia.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`\\s*[-—–/|]\\s*${escMat}\\b`, "i"), "").trim();
  }
  cleaned = cleaned.replace(/\s*[-—–/|]\s*(?:familiar|civil|penal|amparo|migratorio|inmigraci[oó]n|mercantil|laboral|fiscal|administrativo|agrario|ambiental|electoral|constitucional)\b/i, "").trim();
  return cleaned || name.trim();
}

/**
 * Checks if a string represents an internal user instruction or prompt
 * rather than factual case description or metadata.
 */
export function isUserInstructionOrPrompt(text?: string): boolean {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Prefix checks for prompts or instructions
  if (
    /^(?:analiza|analice|analizar|revisa|revise|revisar|determina|determine|determinar|eval[uú]a|eval[uú]e|evaluar|busca|buscar|verifique|verificar|instrucci[oó]n(?:es)?|prompt|user\s+prompt|favor\s+de|se\s+solicita|pregunta(?:\s+jur[ií]dica)?|objetivo(?:\s+del\s+an[aá]lisis)?|note|nota)\b[:\s]/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  // Imperative task requests directed to the system/AI
  if (
    /\b(?:por\s+favor\s+(?:analizar|revisar|verificar|determinar)|necesito\s+que|quiero\s+que|act[uú]a\s+como|eres\s+un|dar\s+prioridad\s+a|se\s+requiere\s+que\s+(?:el\s+sistema|la\s+ia|el\s+analista)|please\s+(?:analyze|review|check|verify)|act\s+as\s+a)\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }

  return false;
}

export function resolveReportIdentity(caseData: Record<string, any>) {
  const metadata = asRecord(caseData.matter_metadata);
  const identity = asRecord(metadata.case_identity);
  const configuration = asRecord(metadata.case_configuration);
  const jurisdictionProfile = asRecord(caseData.jurisdiction_profile);

  // Subject matter (materia): underlying materia when the vehicle is a
  // constitutional remedy, otherwise the verified case type.
  const rawMatterType = firstText(
    caseData.materia,
    caseData.underlying_materia,
    identity.underlying_materia,
    identity.effective_materia,
    configuration.active_underlying_materia,
    caseData.case_type,
    configuration.active_case_type,
    jurisdictionProfile.materia,
  );
  const matterType = rawMatterType ? cleanClientMatterName(rawMatterType) : undefined;

  // Safe extraction of the explicitly stored client
  const clientName = (caseData.client_name || caseData.account_client) as
    | string
    | undefined;

  // Do NOT fallback to finding "quejoso" or "actor" in parties list if client is missing!
  const safeClient = clientName ? cleanClientMatterName(String(clientName).trim(), matterType) : undefined;

  const rawMatterName = firstText(caseData.name, identity.case_display_name);
  const safeMatterName = rawMatterName ? cleanClientMatterName(rawMatterName, matterType) : undefined;

  const caseNumber = String(
    firstText(
      caseData.case_number,
      caseData.expediente,
      identity.case_number_normalized,
      identity.case_number,
      metadata.courtCaseNumber,
    ) ?? "No proporcionado",
  );

  // Type of proceeding: the procedural vehicle the matter is actually running
  // through, falling back to the verified case type.
  const proceedingType = firstText(
    caseData.proceeding_type,
    caseData.tipo_juicio,
    caseData.procedural_vehicle,
    identity.procedural_vehicle,
    configuration.active_procedural_vehicle,
    configuration.detected_procedural_vehicle,
    identity.case_number_type,
    caseData.case_type,
    configuration.active_case_type,
  );

  // Short factual description if supplied or reliably detected
  const rawDesc = firstText(
    caseData.description,
    metadata.description,
    identity.case_description,
    identity.description,
  );
  const factualDescription = rawDesc && !isUserInstructionOrPrompt(rawDesc)
    ? rawDesc.trim().replace(/\s+/g, " ")
    : undefined;

  // Jurisdictional body (órgano jurisdiccional).
  // When the SCJN issues a remand ruling, both the SCJN and the receiving
  // court may appear in the metadata. Prioritize the explicit identity
  // court_name over the tribunal_level to avoid presenting the SCJN as
  // the deciding court when it only returned the file.
  const tribunalLevel = firstText(identity.tribunal_level);
  const identityCourt = firstText(identity.court_name);
  const remandOrdered = identity.remand_ordered === true ||
    identity.procedural_posture === "remand" ||
    /devuelvanse|devolver los autos/i.test(String(identity.disposition ?? ""));
  const court = remandOrdered && identityCourt
    ? identityCourt
    : firstText(
        caseData.court_name,
        identityCourt,
        metadata.courtName,
        metadata.competentAuthority,
        tribunalLevel,
        metadata.detected_authority,
        Array.isArray(jurisdictionProfile.courts) ? String(jurisdictionProfile.courts[0] ?? "") || undefined : undefined,
      );

  const jurisdiction = firstText(
    caseData.jurisdiction,
    identity.jurisdiction,
    configuration.active_jurisdiction,
    jurisdictionProfile.jurisdiction_level,
    jurisdictionProfile.fuero,
    metadata.jurisdiction,
  );

  // Generate safe filename
  const parts = [];
  const clientOrName = safeClient || safeMatterName;
  if (clientOrName) parts.push(clientOrName.replace(/[^a-zA-Z0-9]/g, "_"));
  parts.push(caseNumber.replace(/[^a-zA-Z0-9]/g, "_"));
  if (proceedingType) parts.push(proceedingType.replace(/[^a-zA-Z0-9]/g, "_"));

  const filename = `Reporte_${parts.join("_")}.pdf`;

  return {
    client: safeClient,
    matterName: safeMatterName,
    clientOrMatter: safeClient || safeMatterName || "Caso en identificación...",
    description: factualDescription,
    caseNumber,
    proceedingType,
    matterType,
    court,
    jurisdiction,
    filename,
  };
}
