import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { sendTransactionalEmail } from "@/lib/email/transactional.server";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { buildSecurityHeaders, shouldApplySecurityHeaders, withSecurityHeaders } from "@/lib/security/security-headers";
import { reportError } from "@/lib/error-reporting";
import { supabase } from "@/integrations/supabase/client";

describe("Lovable Independence Verification", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("Authentication Independence", () => {
    it("uses standard Supabase client directly with expected auth methods", () => {
      expect(supabase).toBeDefined();
      expect(typeof supabase.auth.signInWithPassword).toBe("function");
      expect(typeof supabase.auth.signUp).toBe("function");
      expect(typeof supabase.auth.signOut).toBe("function");
      expect(typeof supabase.auth.resetPasswordForEmail).toBe("function");
      expect(typeof supabase.auth.updateUser).toBe("function");
      expect(typeof supabase.auth.getSession).toBe("function");
      expect(typeof supabase.auth.onAuthStateChange).toBe("function");
      expect(typeof supabase.auth.signInWithOAuth).toBe("function");
    });
  });

  describe("Provider-Neutral Transactional Email", () => {
    it("fails gracefully and logs when no independent email provider is configured", async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.SENDGRID_API_KEY;
      delete process.env.EMAIL_WEBHOOK_URL;

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await sendTransactionalEmail({
        to: "test@example.com",
        subject: "Verification Test",
        text: "Testing provider-neutral email fallback",
      });

      expect(result.sent).toBe(false);
      if (!result.sent) {
        expect(result.reason).toBe("provider_not_configured");
      }
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("No independent email provider configured"),
      );
    });

    it("sends successfully via Resend API when RESEND_API_KEY is configured", async () => {
      process.env.RESEND_API_KEY = "re_test_123456";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "msg_resend_123" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendTransactionalEmail({
        to: "recipient@example.com",
        subject: "Resend Test",
        html: "<p>Hello</p>",
      });

      expect(result.sent).toBe(true);
      if (result.sent) {
        expect(result.id).toBe("msg_resend_123");
      }
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.resend.com/emails",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer re_test_123456",
          }),
        }),
      );
    });

    it("sends successfully via SendGrid API when SENDGRID_API_KEY is configured", async () => {
      delete process.env.RESEND_API_KEY;
      process.env.SENDGRID_API_KEY = "SG.test_123456";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "",
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await sendTransactionalEmail({
        to: "recipient@example.com",
        subject: "SendGrid Test",
        text: "Plain text email",
      });

      expect(result.sent).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.sendgrid.com/v3/mail/send",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer SG.test_123456",
          }),
        }),
      );
    });

    it("sendTemplateEmail executes through transactional service and handles graceful fallback", async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.SENDGRID_API_KEY;
      delete process.env.EMAIL_WEBHOOK_URL;

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = await sendTemplateEmail("team-invite", "invitee@example.com", {
        templateData: {
          inviterName: "Admin",
          organizationName: "Test Org",
          inviteUrl: "https://mexico.nyrava.com/invite/123",
          role: "member",
        },
      });

      expect(result.sent).toBe(false);
      expect(result.reason).toBe("provider_not_configured");
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe("Security Headers Verification", () => {
    it("emits frame-ancestors 'self' and no Lovable domains", () => {
      const headers = buildSecurityHeaders();
      const csp = headers["Content-Security-Policy-Report-Only"];

      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).not.toContain("lovable.app");
      expect(csp).not.toContain("lovable.dev");
      expect(csp).not.toContain("gptengineer");
    });

    it("applies security headers uniformly without lovable-specific route exclusions", () => {
      expect(shouldApplySecurityHeaders("/dashboard")).toBe(true);
      expect(shouldApplySecurityHeaders("/api/public/hooks/stripe-webhook")).toBe(true);

      const res = withSecurityHeaders(new Response("ok"), "/dashboard");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("Strict-Transport-Security")).toContain("max-age=31536000");
    });
  });

  describe("Provider-Neutral Error Reporting", () => {
    it("reports structured application errors via standard logging", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("Simulated test error");

      reportError(error, { section: "test" }, { severity: "error" });

      expect(errorSpy).toHaveBeenCalledWith(
        "[AppError]",
        expect.objectContaining({
          message: "Simulated test error",
          severity: "error",
          section: "test",
        }),
      );
    });
  });
});
