/**
 * Pure, isomorphic text-matching utilities extracted from evidence provenance.
 * Safe for both browser and server environments (zero Node.js dependencies).
 */

export function foldTypographicPunctuation(s: string): string {
  return s
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201c\u201d\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00a0/g, " ");
}

export function lightNormalize(s: string): string {
  return foldTypographicPunctuation(
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
  );
}

export type QuoteLocation = { start: number; end: number };

/**
 * Find the exact character range of `quote` inside `rawText`, case- and
 * accent-insensitively, preserving true offsets into `rawText` (not into
 * any normalized copy). Returns the FIRST occurrence.
 *
 * Handles whitespace collapsing, newlines, and soft line wraps.
 */
export function locateQuoteInText(quote: string, rawText: string): QuoteLocation | null {
  const q = quote.trim();
  if (q.length < 8 || !rawText) return null;
  const normText = lightNormalize(rawText);
  const normQuote = lightNormalize(q);
  const start = normText.indexOf(normQuote);
  if (start >= 0) return { start, end: start + normQuote.length };

  // PDF extraction inserts line breaks where quoted prose uses spaces. Keep
  // an index map so whitespace folding never fabricates raw source offsets.
  const chars: string[] = [], starts: number[] = [], ends: number[] = [];
  for (let i = 0; i < normText.length; i++) {
    const ch = /\s/.test(normText[i]) ? ' ' : normText[i];
    if (ch === ' ' && chars.at(-1) === ' ') { ends[ends.length - 1] = i + 1; continue; }
    chars.push(ch); starts.push(i); ends.push(i + 1);
  }
  const foldedQuote = normQuote.replace(/\s+/g, ' ').trim();
  const foldedStart = chars.join('').indexOf(foldedQuote);
  if (foldedStart < 0) return null;
  return { start: starts[foldedStart], end: ends[foldedStart + foldedQuote.length - 1] };
}
