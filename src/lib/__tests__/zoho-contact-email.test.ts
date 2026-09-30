import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createTransport } = vi.hoisted(() => ({ createTransport: vi.fn() }));

vi.mock("nodemailer", () => ({ createTransport }));

import { sendTransactionalEmail } from "@/lib/email/transactional.server";

describe("Zoho SMTP transactional email", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.RESEND_API_KEY;
    delete process.env.SENDGRID_API_KEY;
    delete process.env.EMAIL_WEBHOOK_URL;
    delete process.env.EMAIL_WEBHOOK_SECRET;
    delete process.env.ZOHO_SMTP_USER;
    delete process.env.ZOHO_SMTP_PASSWORD;
    delete process.env.ZOHO_SMTP_HOST;
    delete process.env.ZOHO_SMTP_PORT;
    delete process.env.ZOHO_SMTP_SECURE;
    createTransport.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("sends via Zoho SMTP with server credentials and default TLS settings", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "zoho-message-1" });
    createTransport.mockReturnValue({ sendMail });
    process.env.ZOHO_SMTP_USER = "contact@example.com";
    process.env.ZOHO_SMTP_PASSWORD = "server-only-test-password";

    const result = await sendTransactionalEmail({
      to: "sales@example.com",
      replyTo: "prospect@example.net",
      subject: "Sales inquiry",
      text: "Hello",
      idempotencyKey: "inquiry-1",
    });

    expect(result).toEqual({ sent: true, id: "zoho-message-1" });
    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.zoho.com",
      port: 465,
      secure: true,
      auth: { user: "contact@example.com", pass: "server-only-test-password" },
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sales@example.com",
        replyTo: "prospect@example.net",
        subject: "Sales inquiry",
        text: "Hello",
        headers: { "X-Idempotency-Key": "inquiry-1" },
      }),
    );
  });

  it("reports incomplete Zoho credentials instead of silently falling through", async () => {
    process.env.ZOHO_SMTP_USER = "contact@example.com";

    const result = await sendTransactionalEmail({
      to: "sales@example.com",
      subject: "Sales inquiry",
      text: "Hello",
    });

    expect(result).toMatchObject({ sent: false, reason: "provider_error" });
    expect(createTransport).not.toHaveBeenCalled();
  });
});
