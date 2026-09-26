/**
 * Provider-neutral application error reporting abstraction.
 * Replaces vendor-specific telemetry hooks with standard structured application logging.
 * Ready for standard monitoring backends (Sentry, OpenTelemetry, Datadog) via server/client hooks.
 */

export type ErrorSeverity = "error" | "warning" | "info";

export type ErrorReportingOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: ErrorSeverity;
};

export function reportError(
  error: unknown,
  context: Record<string, unknown> = {},
  options: ErrorReportingOptions = {},
): void {
  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);

  const stack = error instanceof Error ? error.stack : undefined;
  const severity = options.severity ?? "error";
  const payload = {
    message,
    severity,
    mechanism: options.mechanism,
    handled: options.handled,
    route: typeof window !== "undefined" ? window.location.pathname : undefined,
    stack,
    ...context,
  };

  if (severity === "warning") {
    console.warn("[AppError]", payload);
  } else if (severity === "info") {
    console.info("[AppError]", payload);
  } else {
    console.error("[AppError]", payload);
  }
}
