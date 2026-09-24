import { expect, it } from "vitest";
import { resumeIndex } from "../resume-index";
it("retries the requested failed analyzer before unattempted downstream stages", () => {
  expect(resumeIndex(1, 2, false)).toBe(1);
});
it("advances past completed work but never past unattempted earlier work", () => {
  expect(resumeIndex(1, 2, true)).toBe(2);
  expect(resumeIndex(7, 3, false)).toBe(3);
  expect(resumeIndex(1, -1, false)).toBe(1);
});

