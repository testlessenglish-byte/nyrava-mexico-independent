/** A requested failed stage must be retried, even if later work never ran. */
export function resumeIndex(requested: number, firstUnattempted: number, requestedDone: boolean) {
  if (firstUnattempted < 0) return requested;
  return requestedDone ? firstUnattempted : Math.min(requested, firstUnattempted);
}
