/** Include the operative ruling, usually at the end, within the same input budget. */
export function decisionExcerpt(text: string, budget = 20_000): string {
  if (text.length <= budget) return text;
  const separator = "\n[Middle section omitted from this excerpt]\n";
  const head = Math.floor((budget - separator.length) / 2);
  const tail = budget - separator.length - head;
  return text.slice(0, head) + separator + text.slice(-tail);
}
