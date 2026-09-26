/**
 * Provider-neutral server-side transactional email service.
 * Supports configurable email backends (Resend, SendGrid, custom HTTP webhook, or graceful local fallback).
 * Configuration is managed exclusively via server environment variables.
 * Credentials and API keys are NEVER exposed to client-side code.
 */

export interface SendTransactionalEmailOptions {
  to: string;
  from?: string;
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  idempotencyKey?: string;
  label?: string;
}

export type SendTransactionalEmailResult =
  | { sent: true; id?: string }
  | { sent: false; reason: "recipient_suppressed" | "provider_not_configured" | "provider_error"; error?: string };

const DEFAULT_SENDER = "Nyrava México <noreply@mexico.nyrava.com>";
const DEFAULT_REPLY_TO = "support@mexico.nyrava.com";

/**
 * Sends a transactional email using the configured server provider.
 * If no provider is configured, it fails gracefully and logs instructions.
 */
export async function sendTransactionalEmail(
  options: SendTransactionalEmailOptions,
): Promise<SendTransactionalEmailResult> {
  const from = options.from || process.env.EMAIL_FROM || DEFAULT_SENDER;
  const replyTo = options.replyTo || process.env.EMAIL_REPLY_TO || DEFAULT_REPLY_TO;
  const to = options.to;
  const subject = options.subject;
  const html = options.html || "";
  const text = options.text || "";

  // 1. Resend provider
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from,
          to: [to],
          reply_to: replyTo,
          subject,
          html: html || undefined,
          text: text || undefined,
          tags: options.label ? [{ name: "label", value: options.label }] : undefined,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[Email:Resend] Delivery failed (${response.status}): ${errorBody}`);
        return { sent: false, reason: "provider_error", error: errorBody };
      }

      const data = (await response.json()) as { id?: string };
      return { sent: true, id: data.id };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Email:Resend] Transport error: ${errorMsg}`);
      return { sent: false, reason: "provider_error", error: errorMsg };
    }
  }

  // 2. SendGrid provider
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  if (sendgridApiKey) {
    try {
      const content = [];
      if (text) content.push({ type: "text/plain", value: text });
      if (html) content.push({ type: "text/html", value: html });
      if (content.length === 0) content.push({ type: "text/plain", value: "" });

      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from.includes("<") ? from.replace(/.*<([^>]+)>.*/, "$1") : from },
          reply_to: { email: replyTo },
          subject,
          content,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[Email:SendGrid] Delivery failed (${response.status}): ${errorBody}`);
        return { sent: false, reason: "provider_error", error: errorBody };
      }

      return { sent: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Email:SendGrid] Transport error: ${errorMsg}`);
      return { sent: false, reason: "provider_error", error: errorMsg };
    }
  }

  // 3. Generic HTTP Webhook provider
  const emailWebhookUrl = process.env.EMAIL_WEBHOOK_URL;
  if (emailWebhookUrl) {
    try {
      const response = await fetch(emailWebhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.EMAIL_WEBHOOK_SECRET
            ? { "X-Webhook-Secret": process.env.EMAIL_WEBHOOK_SECRET }
            : {}),
        },
        body: JSON.stringify({
          to,
          from,
          replyTo,
          subject,
          html,
          text,
          idempotencyKey: options.idempotencyKey,
          label: options.label,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[Email:Webhook] Delivery failed (${response.status}): ${errorBody}`);
        return { sent: false, reason: "provider_error", error: errorBody };
      }

      return { sent: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Email:Webhook] Transport error: ${errorMsg}`);
      return { sent: false, reason: "provider_error", error: errorMsg };
    }
  }

  // 4. No provider configured: fail gracefully and document requirement
  console.warn(
    `[Email] No independent email provider configured (e.g. RESEND_API_KEY, SENDGRID_API_KEY, or EMAIL_WEBHOOK_URL). ` +
      `Email to "${to}" ("${subject}") suppressed gracefully. To enable email delivery, set RESEND_API_KEY or SENDGRID_API_KEY in server environment.`,
  );

  return {
    sent: false,
    reason: "provider_not_configured",
    error: "No email provider configured in server environment variables.",
  };
}
