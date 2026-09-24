import { createFileRoute, Link } from "@tanstack/react-router";
import { DocsLayout, DocsSection, FAQ, breadcrumbJsonLd, CANONICAL_BASE } from "@/components/DocsLayout";
import { Rocket, BookOpen, ShieldCheck, User, LifeBuoy, KeyRound } from "lucide-react";

import { useI18n } from "@/i18n";

const HELP_KEYS: Record<string, string> = {
  "Support": "helpCenter.text1",
  "Nyrava Help Center": "helpCenter.text2",
  "Help Center": "helpCenter.text3",
  "Browse by category": "helpCenter.text4",
  "Browse by category, or press ⌘K to search across every article, policy, and product page.": "helpCenter.text5",
  "Getting Started": "helpCenter.text6",
  "Learning Center — full setup & training guide": "helpCenter.text7",
  "Running your first case": "helpCenter.text8",
  "Uploading documents & supported file types": "helpCenter.text9",
  "API keys & bring-your-own providers": "helpCenter.text10",
  "Understanding reports & the 17 sections": "helpCenter.text11",
  "Case Intelligence": "helpCenter.text12",
  "Evidence Intelligence": "helpCenter.text13",
  "Timeline Intelligence": "helpCenter.text14",
  "Witness Intelligence": "helpCenter.text15",
  "Constitutional Intelligence": "helpCenter.text16",
  "Motion Intelligence": "helpCenter.text17",
  "Report Intelligence": "helpCenter.text18",
  "Attorney Work Product": "helpCenter.text19",
  "Generated motions": "helpCenter.text20",
  "Draft reports": "helpCenter.text21",
  "Source citations & verification": "helpCenter.text22",
  "Attorney verification requirements": "helpCenter.text23",
  "Security & Privacy": "helpCenter.text24",
  "Trust Center": "helpCenter.text25",
  "Security practices": "helpCenter.text26",
  "Data isolation & control": "helpCenter.text27",
  "Privacy policy": "helpCenter.text28",
  "AI transparency": "helpCenter.text29",
  "Responsible AI": "helpCenter.text30",
  "Account & Billing": "helpCenter.text31",
  "API providers": "helpCenter.text32",
  "Beta program terms": "helpCenter.text33",
  "Workspace settings & data export": "helpCenter.text34",
  "Getting support": "helpCenter.text35",
  "Company & Resources": "helpCenter.text36",
  "Release notes": "helpCenter.text37",
  "Product roadmap": "helpCenter.text38",
  "Sample reports & practice-area library": "helpCenter.text39",
  "About Nyrava": "helpCenter.text40",
  "Frequently asked questions": "helpCenter.text41",
  "Still need help?": "helpCenter.text42",
  "Contact": "helpCenter.text43",
  "What is Nyrava Intelligence OS?": "helpCenter.text44",
  "Nyrava Intelligence OS is a Legal Intelligence Operating System that helps attorneys and investigators analyze evidence, build timelines, assess witnesses, and draft motions.": "helpCenter.text45",
  "How do I run my first case?": "helpCenter.text46",
  "Sign in, create a new case, upload your documents, and launch the analysis pipeline. The Learning Center walks through each step.": "helpCenter.text47",
  "Can I use my own AI provider keys?": "helpCenter.text48",
  "Yes. Go to Settings → API Keys and add keys for OpenAI, Anthropic, Gemini, Groq, or OpenRouter. Provider costs are billed directly to your account with that provider.": "helpCenter.text49",
  "Is my data secure?": "helpCenter.text50",
  "Nyrava is built on a SOC 2 Type II compliant architecture with AES-256-GCM encryption, workspace isolation, and attorney-work-product protections.": "helpCenter.text51",
  "If you can't find what you're looking for, reach out through the": "helpCenter.text52",
  "page. For security issues, see the disclosure guidance in the": "helpCenter.text53"
};

const FAQ_ITEMS = [
  {
    q: "What is Nyrava Intelligence OS?",
    a: "Nyrava Intelligence OS is a Legal Intelligence Operating System that helps attorneys and investigators analyze evidence, build timelines, assess witnesses, and draft motions.",
  },
  {
    q: "How do I run my first case?",
    a: "Sign in, create a new case, upload your documents, and launch the analysis pipeline. The Learning Center walks through each step.",
  },
  {
    q: "Can I use my own AI provider keys?",
    a: "Yes. Go to Settings → API Keys and add keys for OpenAI, Anthropic, Gemini, Groq, or OpenRouter. Provider costs are billed directly to your account with that provider.",
  },
  {
    q: "Is my data secure?",
    a: "Nyrava is built on a SOC 2 Type II compliant architecture with AES-256-GCM encryption, workspace isolation, and attorney-work-product protections.",
  },
];

function faqJsonLd(base: string, items: { q: string; a: string }[]) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: it.a,
      },
    })),
  });
}

export const Route = createFileRoute("/help/")({
  head: () => {
    const url = `${CANONICAL_BASE}/help`;
    const desc = "Nyrava Help Center — getting started, case intelligence, attorney work product, security, and account management.";
    return {
      meta: [
        { title: "Help Center — Nyrava Intelligence OS" },
        { name: "description", content: desc },
        { property: "og:title", content: "Help Center — Nyrava" },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: breadcrumbJsonLd(CANONICAL_BASE, [{ label: "Help Center", to: "/help" }]),
        },
        {
          type: "application/ld+json",
          children: faqJsonLd(CANONICAL_BASE, FAQ_ITEMS),
        },
      ],
    };
  },
  component: HelpCenter,
});

const CATEGORIES = [
  {
    icon: Rocket,
    heading: "Getting Started",
    articles: [
      { to: "/learning-center", label: "Learning Center — full setup & training guide" },
      { to: "/help/first-case", label: "Running your first case" },
      { to: "/help/uploading", label: "Uploading documents & supported file types" },
      { to: "/help/api-keys", label: "API keys & bring-your-own providers" },
      { to: "/help/reports", label: "Understanding reports & the 17 sections" },
    ],
  },
  {
    icon: BookOpen,
    heading: "Case Intelligence",
    articles: [
      { to: "/product/evidence-intelligence", label: "Evidence Intelligence" },
      { to: "/product/timeline-intelligence", label: "Timeline Intelligence" },
      { to: "/product/witness-intelligence", label: "Witness Intelligence" },
      { to: "/product/constitutional-intelligence", label: "Constitutional Intelligence" },
      { to: "/product/motion-intelligence", label: "Motion Intelligence" },
      { to: "/product/report-intelligence", label: "Report Intelligence" },
    ],
  },
  {
    icon: KeyRound,
    heading: "Attorney Work Product",
    articles: [
      { to: "/product/motion-intelligence", label: "Generated motions" },
      { to: "/product/report-intelligence", label: "Draft reports" },
      { to: "/ai-transparency", label: "Source citations & verification" },
      { to: "/responsible-ai", label: "Attorney verification requirements" },
    ],
  },
  {
    icon: ShieldCheck,
    heading: "Security & Privacy",
    articles: [
      { to: "/trust", label: "Trust Center" },
      { to: "/security", label: "Security practices" },
      { to: "/data-control", label: "Data isolation & control" },
      { to: "/privacy", label: "Privacy policy" },
      { to: "/ai-transparency", label: "AI transparency" },
      { to: "/responsible-ai", label: "Responsible AI" },
    ],
  },
  {
    icon: User,
    heading: "Account & Billing",
    articles: [
      { to: "/help/api-keys", label: "API providers" },
      { to: "/beta-terms", label: "Beta program terms" },
      { to: "/data-control", label: "Workspace settings & data export" },
      { to: "/contact", label: "Getting support" },
    ],
  },
  {
    icon: LifeBuoy,
    heading: "Company & Resources",
    articles: [
      { to: "/release-notes", label: "Release notes" },
      { to: "/roadmap", label: "Product roadmap" },
      { to: "/resources", label: "Sample reports & practice-area library" },
      { to: "/about", label: "About Nyrava" },
    ],
  },
];

function HelpCenter() {
  const { t } = useI18n();
  const tr = (text: string) => t(HELP_KEYS[text] ?? text);
  return (
    <DocsLayout
      eyebrow={tr("Support")}
      title={tr("Nyrava Help Center")}
      description={tr("Browse by category, or press ⌘K to search across every article, policy, and product page.")}
      crumbs={[{ label: tr("Help Center"), to: "/help" }]}
    >
      <DocsSection heading={tr("Browse by category")}>
        <div className="my-6 grid gap-4 sm:grid-cols-2">
          {CATEGORIES.map(({ icon: Icon, heading, articles }) => (
            <div key={heading} className="rounded-xl border border-border/60 bg-card/30 p-5">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-md border border-border bg-card/70 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="text-[14px] font-semibold text-foreground">{tr(heading)}</div>
              </div>
              <ul className="mt-4 space-y-1.5 text-[13px]">
                {articles.map((a) => (
                  <li key={a.to}>
                    <Link to={a.to} className="text-muted-foreground hover:text-foreground">
                      → {tr(a.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DocsSection>

      <DocsSection id="faq" heading={tr("Frequently asked questions")}>
        <FAQ items={FAQ_ITEMS.map(item => ({ q: tr(item.q), a: tr(item.a) }))} />
      </DocsSection>

      <DocsSection heading={tr("Still need help?")}>
        <p>
          {tr("If you can't find what you're looking for, reach out through the")}{" "}
          <Link to="/contact" className="text-primary hover:underline">{tr("Contact")}</Link>. {tr("page. For security issues, see the disclosure guidance in the")}{" "}
          <Link to="/trust" className="text-primary hover:underline">{tr("Trust Center")}</Link>.
        </p>
      </DocsSection>
    </DocsLayout>
  );
}
