import { expect, it } from "vitest";
import { effectiveMxProfile, isStageRelevantForCaseType } from "../mx-pipeline";

it.each(["familiar", "penal", "migratorio"])("uses structured amparo over %s without rewriting substance", (subject) => {
  expect(effectiveMxProfile(subject, null, null, "amparo_directo", subject)).toBe("amparo");
  expect(isStageRelevantForCaseType(subject, "constitutional", null, "amparo_directo", subject)).toBe(true);
  expect(isStageRelevantForCaseType(subject, "witness", null, "amparo_directo", subject)).toBe(false);
  expect(effectiveMxProfile(subject, null, null, "amparo_indirecto", subject)).toBe("amparo");
  expect(isStageRelevantForCaseType(subject, "witness", null, "amparo_indirecto", subject)).toBe(true);
  expect(effectiveMxProfile(subject)).toBe(subject);
});
it("restores the strategy center only for real estate litigation", () => {
  expect(isStageRelevantForCaseType("inmobiliario", "litigation_strategy_center", null, "inmobiliario_litigio")).toBe(true);
  expect(isStageRelevantForCaseType("inmobiliario", "litigation_strategy_center", null, "inmobiliario_transaccional")).toBe(false);
});
