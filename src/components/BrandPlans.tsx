import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight } from "lucide-react";
import { listBrandPlans } from "@/lib/brand-plans.functions";
import { useI18n } from "@/i18n";

/** Marketing prices use the same published catalog as subscription checkout. */
export function BrandPlans() {
  const { locale } = useI18n();
  const es = locale === "es";
  const getPlans = useServerFn(listBrandPlans);
  const { data, isPending, isError } = useQuery({ queryKey: ["marketing-billing-plans"], queryFn: () => getPlans() });
  const plans = data ?? [];
  return (
    <section id="plans" className="border-y border-border bg-cream px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-xs font-semibold uppercase tracking-[.24em] text-primary">Nyrava México</p>
        <h2 className="mt-4 text-center font-display text-5xl text-foreground">{es ? "Elige tu plan" : "Choose your plan"}</h2>
        <p className="mt-4 text-center text-muted-foreground">{es ? "Inteligencia legal hecha para México." : "Legal intelligence built for Mexico."}</p>
        {isPending ? <p className="mt-8 text-center text-muted-foreground">{es ? "Cargando planes…" : "Loading plans…"}</p> : (
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {plans.map(plan => {
              const custom = Number(plan.price_cents) <= 0;
              const amount = new Intl.NumberFormat(es ? "es-MX" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(plan.price_cents) / 100);
              return <article key={plan.key} className="nyrava-plan-card flex flex-col rounded-xl border border-border p-7">
                <h3 className="font-sans text-xl font-semibold uppercase tracking-[.15em] text-primary">{plan.label}</h3>
                <p className="mt-5 font-display text-5xl text-foreground">{custom ? (es ? "A tu medida" : "Custom") : `$${amount}`}</p>
                {!custom && <p className="mt-2 text-sm text-primary">{(plan.currency || "mxn").toUpperCase()} {plan.interval === "year" ? (es ? "/ año" : "/ year") : plan.interval === "one_time" ? "" : (es ? "/ mes" : "/ month")}</p>}
                {plan.tagline && <p className="mt-6 flex-1 text-sm leading-relaxed text-muted-foreground">{es ? plan.tagline : plan.key === "solo" ? "Organize and analyze your legal matters." : plan.key === "firm" ? "More room for your practice." : "For firms and organizations with custom requirements."}</p>}
                {custom ? (
                  <a href="mailto:contact@mexico.nyrava.com?subject=Enterprise%20%E2%80%94%20Nyrava%20M%C3%A9xico" className="mt-8 inline-flex items-center justify-center gap-2 rounded-md border border-primary px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/5">{es ? "Contáctanos" : "Contact us"}<ArrowRight className="h-4 w-4" /></a>
                ) : (
                  <Link to="/billing" className="mt-8 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">{es ? "Ver plan" : "View plan"}<ArrowRight className="h-4 w-4" /></Link>
                )}
              </article>;
            })}
          </div>
        )}
        {(isError || (!isPending && !plans.length)) && <Link to="/billing" className="mt-8 block text-center text-primary underline">{es ? "Consultar suscripciones" : "View subscriptions"}</Link>}
      </div>
    </section>
  );
}
