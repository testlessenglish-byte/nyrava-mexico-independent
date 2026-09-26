import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  Play,
  ArrowRight,
  Scale,
  Landmark,
  ShieldCheck,
  Lock,
  Sparkles,
  ClipboardList,
  Activity,
  HeartHandshake,
  Network,
} from "lucide-react";
import { NyravaLogo, NyravaHeaderBrand } from "@/components/NyravaLogo";
import { BrandPlans } from "@/components/BrandPlans";
import { HeroOSDashboard } from "@/components/HeroOSDashboard";
import { TrustStrip } from "@/components/TrustStrip";
import { SiteFooter } from "@/components/SiteFooter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { MobileNav } from "@/components/MobileNav";
import { useI18n } from "@/i18n";
import { listPublishedDemoCases } from "@/lib/demo-cases.functions";

const SITE_URL = "https://mexico.nyrava.com";
const LOGO_URL = `${SITE_URL}/brand/nyrava-logo-original.png`;
const SOCIAL_IMAGE_URL = `${SITE_URL}/__l5e/assets-v1/775b6578-f629-470f-8bb7-bb39be2faf3c/nyrava-mexico-social-2026.png`;
const SOCIAL_DESCRIPTION = "Inteligencia jurídica más allá del análisis humano.";

const ORGANIZATION_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Nyrava",
  url: SITE_URL,
  logo: LOGO_URL,
  description:
    "El sistema operativo de inteligencia jurídica más avanzado. Diseñado para abogados, investigadores y organizaciones que exigen precisión, rigor y resultados.",
});

const WEBSITE_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Nyrava México — Inteligencia Jurídica",
  url: SITE_URL,
  description: "Inteligencia jurídica más allá del análisis humano.",
  publisher: {
    "@type": "Organization",
    name: "Nyrava",
    url: SITE_URL,
    logo: LOGO_URL,
  },
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nyrava México — Inteligencia Jurídica" },
      { property: "og:url", content: `${SITE_URL}/` },
      { name: "twitter:url", content: `${SITE_URL}/` },
      {
        name: "description",
        content:
          "El sistema operativo de inteligencia jurídica más avanzado. Diseñado para abogados, investigadores y organizaciones que exigen precisión, rigor y resultados.",
      },
      { property: "og:title", content: "Nyrava México — Inteligencia Jurídica" },
      {
        property: "og:description",
        content: SOCIAL_DESCRIPTION,
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: SOCIAL_IMAGE_URL },
      { property: "og:image:secure_url", content: SOCIAL_IMAGE_URL },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "410" },
      { property: "og:image:height", content: "245" },
      { property: "og:image:alt", content: "Nyrava México — Inteligencia Jurídica Avanzada" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Nyrava México — Inteligencia Jurídica" },
      { name: "twitter:description", content: SOCIAL_DESCRIPTION },
      { name: "twitter:image", content: SOCIAL_IMAGE_URL },
      { name: "twitter:image:alt", content: "Nyrava México — Inteligencia Jurídica Avanzada" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
    scripts: [

      { type: "application/ld+json", children: ORGANIZATION_JSON_LD },
      { type: "application/ld+json", children: WEBSITE_JSON_LD },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/cases" });
  },
  component: Landing,
});

const NAV = [
  { key: "home.nav.product", href: "#product" },
  { key: "billing.title", href: "#plans" },
  { key: "home.nav.care", href: "/product/comprehensive-care" },
  { key: "home.nav.about", to: "/about" },
  { key: "home.nav.legalSources", to: "/modules" },
  { key: "home.nav.security", to: "/security" },
  { key: "home.nav.transparency", to: "/ai-transparency" },
  { key: "home.nav.help", to: "/help" },
] as const;

function Landing() {
  const { t } = useI18n();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  const fetchDemoCases = useServerFn(listPublishedDemoCases);
  const { data: demoCases, isLoading: demosLoading } = useQuery({
    queryKey: ["published-demo-cases"],
    queryFn: () => fetchDemoCases(),
  });

  return (
    <div className="min-h-screen text-foreground">
      {/* Top Header — Dark forest green bar matching reference design exactly */}
      <header className="sticky top-0 z-40 bg-[#104033] text-white shadow-sm pt-[env(safe-area-inset-top,0px)]">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-3.5 sm:px-8">
          <Link to="/" className="flex min-w-0 items-center">
            <NyravaHeaderBrand subtitle={t("home.brand.subtitle")} />
          </Link>

          <div className="flex shrink-0 items-center justify-end gap-2.5 sm:gap-3">
            <div className="hidden lg:block">
              <LanguageSwitcher variant="header-pill" />
            </div>
            <span className="hidden h-5 w-px bg-white/20 lg:inline-block" />
            <Link
              to="/auth"
              className="hidden items-center rounded-full border border-white/25 bg-black/10 px-4 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-white transition hover:bg-white/10 hover:border-white/40 sm:inline-flex"
            >
              {t("nav.signIn")}
            </Link>
            <Link
              to="/auth"
              className="hidden items-center rounded-full bg-[#fbf5ed] px-4 py-1.5 text-[11px] font-bold tracking-[0.14em] text-[#104033] shadow-sm transition hover:bg-white hover:brightness-105 sm:inline-flex"
            >
              {t("nav.openPlatform")}
            </Link>
            <MobileNav
              items={NAV.map((n) =>
                "to" in n
                  ? { label: t(n.key).toUpperCase(), to: n.to }
                  : { label: t(n.key).toUpperCase(), href: n.href },
              )}
              triggerClassName="border-white/25 bg-white/5 text-white hover:bg-white/10 lg:hidden"
            >
              <LanguageSwitcher variant="sidebar" className="w-full justify-start" />
              <Link
                to="/auth"
                className="rounded-md border border-border px-3 py-2 text-center text-[11px] font-semibold tracking-[0.14em] text-foreground"
              >
                {t("nav.signIn")}
              </Link>
              <Link
                to="/auth"
                className="rounded-md bg-primary px-3 py-2 text-center text-[11px] font-bold tracking-[0.14em] text-primary-foreground"
              >
                {t("nav.openPlatform")}
              </Link>
            </MobileNav>
          </div>
        </div>

        {/* Subnav bar — warm cream strip with legal links & justice tagline */}
        <div className="border-b border-[#e5dacd] bg-[#f3ebe0] text-[#47554e]">
          <div className="mx-auto hidden max-w-[90rem] items-center justify-between px-4 py-2.5 sm:px-8 lg:flex">
            <nav aria-label="Main navigation" className="flex items-center gap-4 xl:gap-6 2xl:gap-8">
              {NAV.map((n) =>
                "to" in n ? (
                  <Link
                    key={n.key}
                    to={n.to}
                    className="whitespace-nowrap text-[11px] font-semibold tracking-[0.14em] text-[#47554e] transition hover:text-[#104033]"
                  >
                    {t(n.key).toUpperCase()}
                  </Link>
                ) : (
                  <a
                    key={n.key}
                    href={n.href}
                    className="whitespace-nowrap text-[11px] font-semibold tracking-[0.14em] text-[#47554e] transition hover:text-[#104033]"
                  >
                    {t(n.key).toUpperCase()}
                  </a>
                ),
              )}
            </nav>
            <div className="flex items-center gap-3">
              <span className="h-3.5 w-px bg-[#c49257]/60" />
              <span className="text-[11px] font-sans font-semibold tracking-[0.18em] text-[#b4834f] uppercase whitespace-nowrap">
                {t("nav.justiceTagline")}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Nyrava México editorial hero matching visual source of truth */}
        <section className="nyrava-hero relative overflow-hidden">
          <div className="relative mx-auto max-w-[90rem] px-4 pt-10 sm:px-8 sm:pt-14 lg:pt-16">
            <div className="grid gap-8 lg:grid-cols-[0.88fr_1.12fr] lg:items-center xl:gap-12">
              {/* Left: headline + CTAs + sub-bar */}
              <div className="nyrava-hero-copy min-w-0">
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-[2px] w-8 bg-[#c49257] shrink-0" />
                  <span className="text-[11px] sm:text-[11.5px] font-sans font-bold tracking-[0.2em] text-[#22392e] uppercase">
                    {t("home.hero.tagline")}
                  </span>
                </div>
                <h1 className="break-words font-display text-4xl sm:text-5xl md:text-[56px] lg:text-[62px] font-semibold not-italic leading-[1.05] tracking-tight text-[#103a2d]">
                  {t("home.hero.line1")}
                  <br />
                  <span>{t("home.hero.line2")}</span>
                </h1>
                <p className="mt-6 max-w-[530px] text-[16px] sm:text-[17.5px] leading-[1.65] text-[#3e4d46]">
                  {t("home.hero.subtitle")}
                </p>
                <div className="mt-8 flex flex-col min-[480px]:flex-row flex-wrap items-stretch min-[480px]:items-center gap-3 sm:gap-4">
                  <Link
                    to="/auth"
                    className="inline-flex min-h-[48px] w-full min-[480px]:w-auto items-center justify-center gap-2.5 rounded-xl bg-[#0c3629] px-6 py-3.5 text-[11.5px] font-sans font-bold tracking-[0.14em] text-white shadow-[0_8px_20px_rgba(12,54,41,0.28)] transition hover:bg-[#07261c] hover:-translate-y-0.5"
                  >
                    {t("home.cta.launchCommand")} <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a
                    href="#product"
                    className="inline-flex min-h-[48px] w-full min-[480px]:w-auto items-center justify-center gap-2.5 rounded-xl border border-[#cfc5b5] bg-[#fbf6ef]/85 backdrop-blur-sm px-6 py-3.5 text-[11.5px] font-sans font-bold tracking-[0.14em] text-[#1c2e26] transition hover:bg-[#fbf6ef] hover:border-[#103a2d]/40 hover:-translate-y-0.5"
                  >
                    {t("home.cta.watchDemo")} <Play className="h-3.5 w-3.5 stroke-[2] fill-transparent stroke-current" />
                  </a>
                </div>
                <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4 text-[10.5px] sm:text-[11px] font-sans font-semibold tracking-[0.22em] text-[#4d5b54] uppercase">
                  <span>{t("home.substrip.analysis")}</span>
                  <span className="text-[#c49257]/80">|</span>
                  <span>{t("home.substrip.evidence")}</span>
                  <span className="text-[#c49257]/80">|</span>
                  <span>{t("home.substrip.strategy")}</span>
                  <span className="text-[#c49257]/80">|</span>
                  <span>{t("home.substrip.impact")}</span>
                </div>
              </div>

              {/* Right: intelligence cards 3-column arrangement */}
              <div className="min-w-0">
                <HeroOSDashboard />
              </div>
            </div>
          </div>

          {/* Bottom quote banner spanning the bottom of the hero environment */}
          <div className="mt-10 sm:mt-14 border-t border-[#364d42] bg-[#1d332a]/95 backdrop-blur px-4 py-3.5 sm:px-8 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-[90rem] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-3">
                <span className="font-editorial text-[15px] sm:text-[17px] text-[#f2f7f4] tracking-wide">
                  {t("home.quote")}
                </span>
                <span className="hidden sm:inline-block h-[1.5px] w-14 bg-[#c49257]" />
              </div>
              <div className="flex items-center justify-center gap-3 text-[11px] font-sans font-semibold tracking-[0.24em] text-[#b9cdc3] uppercase">
                <span>{t("home.pillars.law")}</span>
                <span className="text-[#c49257]">●</span>
                <span>{t("home.pillars.technology")}</span>
                <span className="text-[#c49257]">●</span>
                <span>{t("home.pillars.people")}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Cream feature strip */}
        <section className="border-y border-border bg-cream text-cream-foreground">
          <div className="mx-auto grid min-w-0 max-w-[100rem] grid-cols-1 gap-6 px-4 py-8 min-[360px]:grid-cols-2 sm:px-6 md:grid-cols-4">
            {[
              {
                icon: ShieldCheck,
                titleKey: "home.features.sources.title",
                subKey: "home.features.sources.subtitle",
              },
              {
                icon: Landmark,
                titleKey: "home.features.laws.title",
                subKey: "home.features.laws.subtitle",
              },
              {
                icon: Lock,
                titleKey: "home.features.security.title",
                subKey: "home.features.security.subtitle",
              },
              {
                icon: Sparkles,
                titleKey: "home.features.forLawyers.title",
                subKey: "home.features.forLawyers.subtitle",
              },
            ].map((it) => (
              <div key={it.titleKey} className="flex min-w-0 items-start gap-3">
                <it.icon
                  className="mt-0.5 h-5 w-5 shrink-0 text-cream-foreground"
                  strokeWidth={1.5}
                />
                <div className="min-w-0 break-words">
                  <div className="text-[11px] font-bold leading-tight tracking-[0.02em]">
                    {t(it.titleKey)}
                  </div>
                  <div className="mt-1 text-[11px] text-cream-foreground/70">{t(it.subKey)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Legal & Data Protection Disclaimers */}
        <section className="border-b border-border bg-secondary/30 text-foreground">
          <div className="mx-auto flex max-w-[100rem] flex-col gap-2 px-6 py-4 text-[11px] text-muted-foreground md:flex-row md:items-center md:justify-between">
            <span className="flex items-center gap-2">
              <Scale className="h-3.5 w-3.5 text-primary" /> {t("home.disclaimer.criterion")}
            </span>
            <span className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-primary" /> {t("home.disclaimer.dataLaw")}
            </span>
          </div>
        </section>

        {/* Comprehensive Care — the platform's second operational core */}
        <section className="border-b border-border bg-card/30">
          <div className="mx-auto max-w-[100rem] px-6 py-14 lg:py-18">
            <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-center">
              <div>
                <div className="text-[11px] font-semibold tracking-[0.28em] text-primary">
                  {t("home.care.eyebrow")}
                </div>
                <h2 className="mt-3 font-display text-3xl font-semibold leading-tight md:text-4xl">
                  {t("home.care.title")}
                </h2>
                <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
                  {t("home.care.description")}
                </p>
                <Link
                  to="/product/$slug"
                  params={{ slug: "comprehensive-care" }}
                  className="mt-7 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-[11px] font-bold tracking-[0.14em] text-primary-foreground transition hover:brightness-110"
                >
                  {t("home.care.cta")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { icon: ClipboardList, title: "home.care.intake.title", description: "home.care.intake.description" },
                  { icon: Activity, title: "home.care.risk.title", description: "home.care.risk.description" },
                  { icon: HeartHandshake, title: "home.care.plans.title", description: "home.care.plans.description" },
                  { icon: Network, title: "home.care.referrals.title", description: "home.care.referrals.description" },
                ].map(({ icon: Icon, title, description }) => (
                  <div key={title} className="rounded-xl border border-border/60 bg-background/70 p-5">
                    <Icon className="h-5 w-5 text-primary" strokeWidth={1.6} />
                    <h3 className="mt-4 text-[14px] font-semibold text-foreground">{t(title)}</h3>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{t(description)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Experience Nyrava — live case demos */}
        <section id="product" className="mx-auto max-w-[100rem] px-6 py-12 lg:py-16">
          <div className="mb-3 text-[11px] font-semibold tracking-[0.28em] tag-bracket text-primary">
            {t("home.demos.tag")}
          </div>
          <h2 className="mb-8 max-w-2xl font-display text-2xl font-semibold leading-tight md:text-3xl">
            {t("home.demos.title")}
          </h2>

          {demosLoading && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="panel h-40 animate-pulse" />
              ))}
            </div>
          )}

          {!demosLoading && (!demoCases || demoCases.length === 0) && (
            <div className="panel p-8 text-sm text-muted-foreground">{t("home.demos.empty")}</div>
          )}

          {!demosLoading && demoCases && demoCases.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {demoCases.map((c) => (
                <Link
                  key={c.id}
                  to="/demo/$slug"
                  params={{ slug: c.slug }}
                  className="panel group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5"
                >
                  <div className="grid h-12 w-12 place-items-center rounded-md border border-border bg-card p-1">
                    <NyravaLogo size={32} />
                  </div>

                  <div>
                    <div className="text-[10.5px] font-semibold tracking-[0.2em] text-primary">
                      {c.case_type_label.toUpperCase()}
                    </div>
                    <h3 className="mt-1 font-display text-base font-semibold leading-tight">
                      {c.name}
                    </h3>
                    {c.summary && (
                      <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
                        {c.summary}
                      </p>
                    )}
                  </div>
                  <span className="mt-auto inline-flex items-center gap-1 text-[10.5px] font-semibold tracking-[0.22em] text-primary transition group-hover:gap-2">
                    {t("home.demos.run")} <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <TrustStrip />
      </main>
      <BrandPlans />
      <SiteFooter />
    </div>
  );
}
