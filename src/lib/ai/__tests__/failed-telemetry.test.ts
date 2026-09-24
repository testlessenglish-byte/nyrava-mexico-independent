import { expect, it } from "vitest";
import { failedProviderCalls, pushTelemetryCall, withTelemetryScope } from "../telemetry.server";

it("preserves provider attempts after failure without exposing key material", async () => {
  const error = new Error("quota");
  await expect(withTelemetryScope({ runId: "test" }, async () => {
    pushTelemetryCall({ ts: 1, provider: "openrouter", providerId: "p", model: "m", ok: false, latencyMs: 1, keyIndex: 0, keyLabel: "private-key-fragment" });
    throw error;
  })).rejects.toBe(error);
  expect(failedProviderCalls(error)).toEqual([{ provider: "openrouter", model: "m", ok: false, input_tokens: 0, output_tokens: 0, key_label: "key #1" }]);
  expect(failedProviderCalls(new Error("other"))).toEqual([]);
});
