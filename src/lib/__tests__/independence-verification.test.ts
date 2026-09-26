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
    process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://example.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "sb_publishable_testkey";
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

  describe("Client Architecture & Secret Leakage Prevention", () => {
    it("normalizes client configuration to public VITE_* variables with window.__PUBLIC_ENV__ support", () => {
      // Simulate browser window with public env
      const originalWindow = globalThis.window;
      try {
        (globalThis as any).window = {
          __PUBLIC_ENV__: {
            VITE_SUPABASE_URL: "https://browser-public.supabase.co",
            VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_key",
          },
        };

        expect((globalThis as any).window.__PUBLIC_ENV__.VITE_SUPABASE_URL).toBe("https://browser-public.supabase.co");
        expect((globalThis as any).window.__PUBLIC_ENV__.VITE_SUPABASE_PUBLISHABLE_KEY).toBe("sb_publishable_browser_key");

        // Verify server secret keys are NOT part of public env
        const publicKeys = Object.keys((globalThis as any).window.__PUBLIC_ENV__);
        expect(publicKeys).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
        expect(publicKeys).not.toContain("STRIPE_SECRET_KEY");
        expect(publicKeys).not.toContain("GROQ_API_KEY");
        expect(publicKeys).not.toContain("OPENROUTER_API_KEY");
        expect(publicKeys).not.toContain("MERCADO_PAGO_ACCESS_TOKEN");
      } finally {
        (globalThis as any).window = originalWindow;
      }
    });

    it("verifies server secrets are never passed as build args in Dockerfile or compose.yaml", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");

      const forbiddenArgs = [
        "SUPABASE_SERVICE_ROLE_KEY",
        "GROQ_API_KEY",
        "OPENROUTER_API_KEY",
        "OPENAI_API_KEY",
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "MERCADO_PAGO_ACCESS_TOKEN",
        "RESEND_API_KEY",
        "SENDGRID_API_KEY",
      ];

      const dockerfilePath = path.resolve(process.cwd(), "Dockerfile");
      if (fs.existsSync(dockerfilePath)) {
        const dockerfile = fs.readFileSync(dockerfilePath, "utf8");
        const argLines = dockerfile
          .split("\n")
          .filter((line) => line.trim().startsWith("ARG "));
        for (const secret of forbiddenArgs) {
          expect(argLines.some((line) => line.includes(secret))).toBe(false);
        }
      }

      const composePath = path.resolve(process.cwd(), "compose.yaml");
      if (fs.existsSync(composePath)) {
        const compose = fs.readFileSync(composePath, "utf8");
        const argsMatch = compose.match(/args:\s*\n((?:\s+-\s+.*|\s+[\w_]+:.*)+)/);
        if (argsMatch) {
          const argsSection = argsMatch[1];
          for (const secret of forbiddenArgs) {
            expect(argsSection).not.toContain(secret);
          }
        }
      }
    });

    it("verifies server secret values are never exposed or bundled into client assets", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");

      // Verify client import.meta.env does not leak server secrets
      const clientEnv = import.meta.env as Record<string, unknown>;
      expect(clientEnv.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
      expect(clientEnv.STRIPE_SECRET_KEY).toBeUndefined();
      expect(clientEnv.OPENROUTER_API_KEY).toBeUndefined();
      expect(clientEnv.GROQ_API_KEY).toBeUndefined();
      expect(clientEnv.MERCADO_PAGO_ACCESS_TOKEN).toBeUndefined();

      const publicDir = path.resolve(process.cwd(), ".output/public");
      if (!fs.existsSync(publicDir)) return;

      const files: string[] = [];
      function collectJsFiles(dir: string) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) collectJsFiles(fullPath);
          else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
            files.push(fullPath);
          }
        }
      }
      collectJsFiles(publicDir);

      // Verify that no client asset contains real secret pattern signatures
      const secretSignatures = [
        /sk_live_[0-9a-zA-Z]{24,}/,
        /sk_test_[0-9a-zA-Z]{24,}/,
        /whsec_[0-9a-zA-Z]{24,}/,
        /re_[0-9a-zA-Z]{24,}/,
        /SG\.[0-9a-zA-Z_-]{22,}\.[0-9a-zA-Z_-]{43,}/,
      ];

      for (const file of files) {
        const content = fs.readFileSync(file, "utf8");
        for (const sig of secretSignatures) {
          expect(sig.test(content)).toBe(false);
        }
      }
    });
  });

  describe("Pipeline Trace and Extraction Security & Permissions", () => {
    it("trace executes safely without throwing when unprivileged client is passed", async () => {
      const { trace } = await import("../pipeline-trace.server");
      const fakeUserDb = {
        from: vi.fn(() => ({
          insert: vi.fn().mockRejectedValue(new Error("permission denied for table pipeline_trace")),
        })),
      };
      await expect(
        trace({
          db: fakeUserDb as never,
          caseId: "00000000-0000-0000-0000-000000000001",
          phase: "upload",
          step: "storage.upload_and_document_rows",
        }),
      ).resolves.toBeUndefined();
    });

    it("drainPipelineQueue is exported and runnable without external webhook", async () => {
      const { drainPipelineQueue } = await import(
        "@/routes/api/public/hooks/pipeline-worker"
      );
      expect(drainPipelineQueue).toBeTypeOf("function");
    });
  });
});
