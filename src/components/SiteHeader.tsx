import { Link } from "@tanstack/react-router";
import { NyravaHeaderBrand } from "./NyravaLogo";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { MobileNav } from "./MobileNav";
import { PUBLIC_NAV_ITEMS } from "@/lib/public-navigation";

export function SiteHeader() {
  const { user } = useSession();
  const { t } = useI18n();

  const NAV = PUBLIC_NAV_ITEMS.map((item) => ({ label: t(item.labelKey), to: item.to }));

  return (
    <header className="sticky top-0 z-40 bg-[#104033] text-white shadow-sm pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex max-w-[100rem] items-center justify-between px-4 py-3 sm:px-6 sm:py-3.5">
        <Link to="/" className="flex min-w-0 items-center">
          <NyravaHeaderBrand subtitle={t("home.brand.subtitle")} />
        </Link>
        <nav className="hidden items-center gap-6 xl:flex 2xl:gap-8">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="text-[11px] font-semibold tracking-[0.16em] text-white/80 transition hover:text-white"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center justify-end gap-2.5 sm:gap-3">
          <div className="hidden xl:block">
            <LanguageSwitcher variant="header-pill" />
          </div>
          <span className="hidden h-5 w-px bg-white/20 xl:inline-block" />
          {user ? (
            <Link
              to="/dashboard"
              className="hidden items-center gap-2 rounded-full bg-[#fbf5ed] px-4 py-1.5 text-[11px] font-bold tracking-[0.14em] text-[#104033] shadow-sm transition hover:bg-white hover:brightness-105 xl:inline-flex"
            >
              {t("nav.openWorkspace")}
            </Link>
          ) : (
            <>
              <Link
                to="/auth"
                className="hidden items-center rounded-full border border-white/25 bg-black/10 px-4 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-white transition hover:bg-white/10 hover:border-white/40 xl:inline-flex"
              >
                {t("nav.signIn")}
              </Link>
              <Link
                to="/auth"
                className="hidden items-center rounded-full bg-[#fbf5ed] px-4 py-1.5 text-[11px] font-bold tracking-[0.14em] text-[#104033] shadow-sm transition hover:bg-white hover:brightness-105 xl:inline-flex"
              >
                {t("nav.openPlatform")}
              </Link>
            </>
          )}
          <MobileNav items={NAV} triggerClassName="border-white/25 bg-white/5 text-white hover:bg-white/10 xl:hidden">
            <LanguageSwitcher variant="sidebar" className="w-full justify-start" />
            {user ? (
              <Link
                to="/dashboard"
                className="rounded-md bg-primary px-3 py-2 text-center text-[11px] font-bold tracking-[0.14em] text-primary-foreground"
              >
                {t("nav.openWorkspace")}
              </Link>
            ) : (
              <>
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
              </>
            )}
          </MobileNav>
        </div>

      </div>
    </header>
  );
}
