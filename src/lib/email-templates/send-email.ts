import * as React from 'react'
import { render } from '@react-email/render'
import { TEMPLATES } from './registry'
import { sendTransactionalEmail } from '../email/transactional.server'

// Server-only: sends transactional emails using the independent provider-neutral email service.
// Never import from client components.

const SITE_NAME = "Nyrava México"
const FROM_DOMAIN = process.env.EMAIL_DOMAIN || "mexico.nyrava.com"
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO || "support@mexico.nyrava.com"

export type SendTemplateEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' | 'provider_not_configured' }

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>
  /** Dedupes retries of the same logical send; defaults to a random UUID (no dedupe). */
  idempotencyKey?: string
  replyTo?: string
}

/**
 * Renders a registered template and sends it through the independent transactional email service.
 * If no provider is configured, it fails gracefully without disrupting caller execution.
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {}
): Promise<SendTemplateEmailResult> {
  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`
    )
  }

  // Template-level `to` takes precedence — notification templates always
  // send to their fixed address.
  const recipient = template.to || to
  if (!recipient) {
    throw new Error('Recipient is required (the template defines no fixed recipient)')
  }

  const templateData = options.templateData ?? {}
  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  const result = await sendTransactionalEmail({
    to: recipient,
    from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
    replyTo: options.replyTo || DEFAULT_REPLY_TO,
    subject,
    html,
    text,
    label: templateName,
    idempotencyKey: options.idempotencyKey || crypto.randomUUID(),
  })

  if (!result.sent) {
    if (result.reason === 'recipient_suppressed') {
      return { sent: false, reason: 'recipient_suppressed' }
    }
    return { sent: false, reason: 'provider_not_configured' }
  }

  return { sent: true }
}
