import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendTransactionalEmailMock } = vi.hoisted(() => ({
  sendTransactionalEmailMock: vi.fn(),
}));

vi.mock("@/lib/email/transactional.server", () => ({
  sendTransactionalEmail: sendTransactionalEmailMock,
}));

import { contactInquirySchema, submitContactInquiry } from "@/lib/contact-inquiry.server";

describe("sales contact form server handler", () => {
  beforeEach(() => sendTransactionalEmailMock.mockReset());

  it("sends inquiries only to the sales inbox and escapes submitted markup", async () => {
    sendTransactionalEmailMock.mockResolvedValue({ sent: true });

    await submitContactInquiry(contactInquirySchema.parse({
        name: "A <script>alert(1)</script>",
        email: "prospect@example.net",
        company: "Firm & Co.",
        message: "We need an enterprise plan.",
        website: "",
      }));

    expect(sendTransactionalEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "contact@mexico.nyrava.com",
        replyTo: "prospect@example.net",
        text: expect.stringContaining("We need an enterprise plan."),
        html: expect.stringContaining("&lt;script&gt;alert(1)&lt;/script&gt;"),
      }),
    );
  });

  it("does not send when the anti-spam honeypot is filled", async () => {
    await submitContactInquiry(contactInquirySchema.parse({
        name: "Bot",
        email: "bot@example.net",
        company: "",
        message: "Please send this spam message.",
        website: "https://spam.example",
      }));

    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
  });

  it("does not acknowledge an inquiry when email delivery fails", async () => {
    sendTransactionalEmailMock.mockResolvedValue({
      sent: false,
      reason: "provider_error",
      error: "SMTP unavailable",
    });

    await expect(
      submitContactInquiry(contactInquirySchema.parse({
        name: "Prospective customer",
        email: "prospect@example.net",
        company: "",
        message: "We are interested in Enterprise.",
        website: "",
      })),
    ).rejects.toThrow("We could not send your inquiry right now.");
  });
});
