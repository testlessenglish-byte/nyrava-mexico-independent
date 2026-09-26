/**
 * Safe presentation mapper for subscriber-facing report and download states.
 * Translates internal QA/pipeline/gate signals into clean, calm subscriber UI
 * without leaking raw engineering output, gate names, engine names, or debug strings.
 */

export interface ReportStatusInput {
  hasReport: boolean;
  isBlocked?: boolean;
  qualityBlockReasons?: string[] | null;
  releaseDecision?: string | null;
  releaseWarnings?: string[] | null;
  contractError?: string | null;
  errorMessage?: string | null;
  statusMessage?: string | null;
  caseStatus?: string | null;
}

export type SubscriberStatusType = "ready" | "in_review" | "retry_needed" | "empty";

export interface SubscriberStatusView {
  type: SubscriberStatusType;
  title: string;
  statusMessage?: string;
  description: string;
  canDownloadPdf: boolean;
  isRetryable: boolean;
}

const HARD_FAILURE_PATTERNS = [
  "timeout",
  "provider",
  "500",
  "502",
  "503",
  "504",
  "rate_limit",
  "rate limit",
  "internal error",
  "network",
  "failed to fetch",
  "econnreset",
  "etimedout",
  "gateway",
  "abort",
];

export function mapInternalToSubscriberStatus(input: ReportStatusInput): SubscriberStatusView {
  const {
    hasReport,
    isBlocked = false,
    qualityBlockReasons = [],
    releaseDecision,
    contractError,
    errorMessage,
    statusMessage,
    caseStatus,
  } = input;

  const rawSignals = [
    ...(qualityBlockReasons || []),
    contractError || "",
    errorMessage || "",
    statusMessage || "",
  ].join(" ").toLowerCase();

  const isHardFailure =
    caseStatus === "failed" ||
    HARD_FAILURE_PATTERNS.some((pat) => rawSignals.includes(pat));

  const isBlockCondition =
    isBlocked ||
    releaseDecision === "BLOCK" ||
    (Array.isArray(qualityBlockReasons) && qualityBlockReasons.length > 0) ||
    Boolean(contractError);

  // 1. Empty / Not yet generated
  if (!hasReport && !isBlockCondition && !isHardFailure && caseStatus !== "failed") {
    return {
      type: "empty",
      title: "DESCARGAS",
      statusMessage: undefined,
      description: "Genere o complete el análisis para consultar el informe.",
      canDownloadPdf: false,
      isRetryable: false,
    };
  }

  // 2. Hard failure (provider error, timeout, crash)
  if (isHardFailure && (!hasReport || isBlockCondition)) {
    return {
      type: "retry_needed",
      title: "DESCARGAS",
      statusMessage: "No pudimos completar el análisis",
      description: "Intente reanalizar el expediente o contacte a soporte si el problema persiste.",
      canDownloadPdf: false,
      isRetryable: true,
    };
  }

  // 3. Blocked / In Review (quality gate, verification failed, citations unresolved, document purpose)
  if (isBlockCondition) {
    return {
      type: "in_review",
      title: "DESCARGAS",
      statusMessage: "Informe en revisión",
      description: "Nyrava está verificando la información del expediente antes de liberar la versión final.",
      canDownloadPdf: false,
      isRetryable: true,
    };
  }

  // 4. Approved for release
  return {
    type: "ready",
    title: "DESCARGAS",
    statusMessage: undefined,
    description: "",
    canDownloadPdf: true,
    isRetryable: false,
  };
}
