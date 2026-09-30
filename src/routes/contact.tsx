import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, type FormEvent } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Loader2, Mail, MapPin, Send } from "lucide-react";
import { useI18n } from "@/i18n";
import { sendContactInquiry } from "@/lib/contact.functions";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contacto · Nyrava Intelligence México" },
      { name: "description", content: "Contacta al equipo de Nyrava Intelligence México — programa cerrado para despachos e instituciones legales." },
      { property: "og:title", content: "Contacto · Nyrava México" },
      { property: "og:description", content: "Programa cerrado para despachos e instituciones legales en México." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "https://mexico.nyrava.com/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { t, locale } = useI18n();
  const es = locale === "es";
  const sendInquiry = useServerFn(sendContactInquiry);
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inquiry = useMutation({
    mutationFn: (values: { name: string; email: string; company: string; message: string; website: string }) =>
      sendInquiry({ data: values }),
    onSuccess: () => {
      setSubmitted(true);
      formRef.current?.reset();
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(false);
    const values = new FormData(event.currentTarget);
    inquiry.mutate({
      name: String(values.get("name") ?? ""),
      email: String(values.get("email") ?? ""),
      company: String(values.get("company") ?? ""),
      message: String(values.get("message") ?? ""),
      website: String(values.get("website") ?? ""),
    });
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 py-20">
        <span className="tag-bracket font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {t("contact.tag")}
        </span>
        <h1 className="mt-3 font-display text-4xl font-bold leading-tight md:text-5xl">
          {t("contact.title.line1")} <span className="font-editorial text-primary">{t("contact.title.line2")}</span>
        </h1>
        <p className="mt-6 max-w-2xl text-muted-foreground">{t("contact.body")}</p>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="panel flex flex-col p-6">
            <Mail className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-display text-base font-semibold">{t("contact.email")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">contact@mexico.nyrava.com</p>
            <a
              href={`mailto:contact@mexico.nyrava.com?subject=${encodeURIComponent(
                es ? "Contacto — Nyrava México" : "Contact — Nyrava México",
              )}`}
              className="mt-4 inline-flex w-fit items-center gap-2 rounded-md bg-primary px-4 py-2 text-[11px] font-bold tracking-[0.14em] text-primary-foreground transition hover:brightness-105"
              style={{ boxShadow: "var(--shadow-glow-cyan)" }}
            >
              <Mail className="h-3.5 w-3.5" />
              {es ? "Enviar correo" : "Send email"}
            </a>
          </div>
          <div className="panel p-6">
            <MapPin className="h-5 w-5 text-primary" />
            <h3 className="mt-3 font-display text-base font-semibold">{t("contact.location")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t("contact.location.value")}</p>
          </div>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="panel mt-6 space-y-4 p-6" aria-label={es ? "Formulario de contacto de ventas" : "Sales contact form"}>
          <div>
            <h2 className="font-display text-xl font-semibold">{es ? "Cuéntenos sobre su organización" : "Tell us about your organization"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {es ? "Nuestro equipo de ventas responderá a su consulta." : "Our sales team will follow up on your inquiry."}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>{es ? "Nombre" : "Name"}</span>
              <input name="name" autoComplete="name" required maxLength={120} className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">
              <span>{es ? "Correo electrónico" : "Email"}</span>
              <input name="email" type="email" autoComplete="email" required maxLength={254} className="w-full rounded-md border border-border bg-background px-3 py-2" />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span>{es ? "Despacho u organización (opcional)" : "Firm or organization (optional)"}</span>
            <input name="company" autoComplete="organization" maxLength={160} className="w-full rounded-md border border-border bg-background px-3 py-2" />
          </label>
          <label className="block space-y-1 text-sm">
            <span>{es ? "¿Cómo podemos ayudarle?" : "How can we help?"}</span>
            <textarea name="message" required minLength={10} maxLength={5000} rows={5} className="w-full resize-y rounded-md border border-border bg-background px-3 py-2" />
          </label>
          <label aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
            Website <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
          {submitted && (
            <p role="status" className="text-sm text-primary">
              {es ? "Gracias. Su consulta fue enviada al equipo de ventas." : "Thank you. Your inquiry has been sent to our sales team."}
            </p>
          )}
          {inquiry.isError && (
            <p role="alert" className="text-sm text-destructive">
              {es ? "No pudimos enviar su consulta. Inténtelo de nuevo." : "We could not send your inquiry. Please try again."}
            </p>
          )}
          <button type="submit" disabled={inquiry.isPending} className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {inquiry.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {es ? "Enviar consulta" : "Send inquiry"}
          </button>
        </form>
      </section>
      <SiteFooter />
    </div>
  );
}
