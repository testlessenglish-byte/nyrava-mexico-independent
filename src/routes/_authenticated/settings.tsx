import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Gauge, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createCustomerPortalSession } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Preferences — Nyrava" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const portalFn = useServerFn(createCustomerPortalSession);

  const portal = useMutation({
    mutationFn: () => portalFn({ data: { origin: window.location.origin } }),
    onSuccess: (res: { url?: string | null }) => {
      if (res?.url) window.location.href = res.url;
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <h1 className="font-display text-3xl font-semibold text-foreground">
        Preferences
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your account preferences, usage, and personal AI provider keys.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          to="/ai-keys"
          className="rounded-xl border border-border bg-card p-5 transition hover:bg-muted/30"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound className="h-4 w-4 text-primary" />
            Intelligence Providers
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Add or manage your own OpenAI, Anthropic, Gemini, Groq, or OpenRouter keys.
          </p>
        </Link>

        <Link
          to="/usage"
          className="rounded-xl border border-border bg-card p-5 transition hover:bg-muted/30"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Gauge className="h-4 w-4 text-primary" />
            Usage Dashboard
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Review your current AI and Talk-to-Case allowance and usage.
          </p>
        </Link>
      </div>

      <div className="mt-16 border-t border-border/60 pt-5">
        <button
          type="button"
          onClick={() => portal.mutate()}
          disabled={portal.isPending}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
        >
          {portal.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ExternalLink className="h-3 w-3" />
          )}
          Manage subscription
        </button>
      </div>
    </div>
  );
}
