interface NyravaLogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
  glow?: boolean;
  edition?: string;
}

/** Approved Nyrava México N artwork with a responsive live wordmark. */
export function NyravaLogo({
  size = 40,
  withWordmark = false,
  className = "",
  glow = true,
  edition = "MÉXICO",
}: NyravaLogoProps) {
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
        <img className="relative z-10 h-full w-full rounded-sm object-contain" src="/brand/nyrava_n_192.png" width={size} height={size} alt={withWordmark ? "" : "Nyrava México"} />
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
