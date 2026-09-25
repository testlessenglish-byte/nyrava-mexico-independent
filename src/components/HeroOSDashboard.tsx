import { Scale, BookOpen, Gavel, GraduationCap, Landmark, FileText } from "lucide-react";
import { useI18n } from "@/i18n";

type SourceCard = {
  icon: React.ComponentType<{ className?: string }>;
  titleKey: string;
  subtitleKey: string;
  tagKey: string;
};

const LEFT: SourceCard[] = [
  { icon: Scale, titleKey: "home.grid.jurisprudencia.title", subtitleKey: "home.grid.jurisprudencia.subtitle", tagKey: "home.grid.jurisprudencia.tag" },
  { icon: BookOpen, titleKey: "home.grid.legislacion.title", subtitleKey: "home.grid.legislacion.subtitle", tagKey: "home.grid.legislacion.tag" },
  { icon: Gavel, titleKey: "home.grid.criterios.title", subtitleKey: "home.grid.criterios.subtitle", tagKey: "home.grid.criterios.tag" },
];

const RIGHT: SourceCard[] = [
  { icon: GraduationCap, titleKey: "home.grid.doctrina.title", subtitleKey: "home.grid.doctrina.subtitle", tagKey: "home.grid.doctrina.tag" },
  { icon: Landmark, titleKey: "home.grid.precedentes.title", subtitleKey: "home.grid.precedentes.subtitle", tagKey: "home.grid.precedentes.tag" },
  { icon: FileText, titleKey: "home.grid.reportes.title", subtitleKey: "home.grid.reportes.subtitle", tagKey: "home.grid.reportes.tag" },
];

function SourceCardTile({ card }: { card: SourceCard }) {
  const { t } = useI18n();
  const Icon = card.icon;
  return (
    <div
      className="flex min-h-[74px] items-center gap-3.5 rounded-2xl border border-[#ede3d5] bg-white/95 px-4 py-3.5 shadow-[0_8px_22px_rgba(0,0,0,0.06)] backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(0,0,0,0.09)] min-w-0"
    >
      <div className="grid h-8 w-8 shrink-0 place-items-center text-[#0d382b]">
        <Icon className="h-6 w-6 stroke-[1.6]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-sans font-bold tracking-[0.06em] text-[#0d281e] uppercase leading-tight truncate">
          {t(card.titleKey)}
        </div>
        <div className="mt-0.5 text-[11px] font-sans text-[#52635a] truncate leading-tight">
          {t(card.subtitleKey)}
        </div>
        <div className="mt-1.5 flex items-center">
          <span className="inline-flex items-center gap-1 rounded-full bg-[#d0ebe0] px-2 py-0.5 text-[8.5px] font-sans font-bold uppercase tracking-[0.1em] text-[#0f664a] leading-none">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0f664a]" />
            {t(card.tagKey)}
          </span>
        </div>
      </div>
    </div>
  );
}

function CenterBadge() {
  const { t } = useI18n();
  return (
    <div className="relative flex flex-col items-center justify-center text-center rounded-2xl border border-[#e5dacd] bg-[#f7f1ea]/95 px-3 py-6 shadow-[0_8px_24px_rgba(19,43,33,0.06)] backdrop-blur-sm w-[138px] shrink-0 self-stretch my-auto">
      <img
        src="/brand/nyrava_n_clean.png"
        alt="Nyrava México"
        className="h-[52px] w-[52px] object-contain shrink-0"
      />
      <div className="mt-2.5 font-display font-bold text-[14px] tracking-[0.2em] text-[#0d281e] leading-tight select-none">
        NYRAVA<br />MÉXICO
      </div>
      <div className="mt-3 text-[8.5px] font-sans font-bold uppercase tracking-[0.16em] text-[#3f5248] whitespace-nowrap">
        {t("home.badge.subtitle")}
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-1 text-[7.5px] font-sans font-bold uppercase tracking-[0.14em] text-[#54645b] whitespace-nowrap">
        <span className="h-px w-3 bg-[#c49257]" />
        {t("home.badge.origin")}
        <span className="h-px w-3 bg-[#c49257]" />
      </div>
    </div>
  );
}

export function HeroOSDashboard() {
  return (
    <div className="relative mx-auto w-full max-w-[840px] py-4">
      {/* Desktop / Laptop: symmetric 3-column grid matching the reference screenshot */}
      <div className="hidden md:grid md:grid-cols-[minmax(0,1fr)_138px_minmax(0,1fr)] md:items-center md:gap-3 xl:gap-3.5">
        <div className="flex flex-col gap-3">
          {LEFT.map((c) => (
            <SourceCardTile key={c.titleKey} card={c} />
          ))}
        </div>

        <CenterBadge />

        <div className="flex flex-col gap-3">
          {RIGHT.map((c) => (
            <SourceCardTile key={c.titleKey} card={c} />
          ))}
        </div>
      </div>

      {/* Tablet & Mobile: center badge prominent on top, then cards reflowed */}
      <div className="flex flex-col items-center gap-4 md:hidden">
        <CenterBadge />
        <div className="grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
          {LEFT.map((c) => (
            <SourceCardTile key={c.titleKey} card={c} />
          ))}
          {RIGHT.map((c) => (
            <SourceCardTile key={c.titleKey} card={c} />
          ))}
        </div>
      </div>
    </div>
  );
}

