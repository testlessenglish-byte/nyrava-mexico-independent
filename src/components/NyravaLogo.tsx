interface NyravaLogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
  glow?: boolean;
  edition?: string;
  variant?: "default" | "header" | "header-wordmark";
}

/** Header brand component matching the reference design: N replaces the first letter of NYRAVA MÉXICO */
export function NyravaHeaderBrand({
  className = "",
  subtitle,
}: {
  className?: string;
  subtitle?: string;
}) {
  return (
    <div className={`flex min-w-0 flex-col select-none ${className}`}>
      <div className="flex items-center gap-[2px] leading-none">
        <img
          src="/brand/nyrava_n_clean_white.png"
          alt="N"
          className="h-[15px] sm:h-[17.5px] w-auto shrink-0 object-contain"
          style={{ transform: "translateY(-0.5px)" }}
        />
        <span className="font-display text-[19px] sm:text-[22px] font-medium tracking-[0.16em] text-white uppercase whitespace-nowrap leading-none">
          YRAVA MÉXICO
        </span>
      </div>
      <span className="mt-[3px] text-[8px] sm:text-[9.5px] font-sans font-medium tracking-[0.25em] text-[#d6e3dc] uppercase whitespace-nowrap leading-none">
        {subtitle ?? "ADVANCED LEGAL INTELLIGENCE"}
      </span>
    </div>
  );
}

/** Approved Nyrava México N artwork with a responsive live wordmark. */
export function NyravaLogo({
  size = 40,
  withWordmark = false,
  className = "",
  glow = true,
  edition = "MÉXICO",
  variant = "default",
}: NyravaLogoProps) {
  if (variant === "header" || variant === "header-wordmark") {
    return <NyravaHeaderBrand className={className} />;
  }

  return (
    <div className={`flex min-w-0 items-center gap-2 sm:gap-3 ${className}`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {glow && (
          <div
            aria-hidden
            className="absolute inset-0 -z-0 rounded-full blur-xl"
            style={{ background: "radial-gradient(circle, rgba(19,43,33,0.38), transparent 70%)" }}
          />
        )}
        <img className="relative z-10 h-full w-full rounded-sm object-contain" src="/brand/nyrava_n_clean.png" width={size} height={size} alt={withWordmark ? "" : "Nyrava México"} />
      </div>
      {withWordmark && (
        <div className="min-w-0 overflow-hidden leading-none">
          <span
            className="block truncate nyrava-wordmark text-[15px] text-foreground"
            style={size >= 60 ? { fontSize: 22 } : undefined}
          >
            NYRAVA
          </span>
          <span
            className="mt-1 hidden truncate text-[8.5px] font-semibold tracking-[0.28em] text-muted-foreground sm:block"
            style={size >= 60 ? { fontSize: 11, marginTop: 4 } : undefined}
          >
            {edition}
          </span>
        </div>
      )}
    </div>
  );
}

