import { describe, expect, it } from "vitest";
import { OPENAI_PRICING_CATALOG, pricingForModel, ratesForModel } from "./openaiPricing";

describe("OpenAI pricing catalog", () => {
  it("tracks the verified Standard catalog without claiming a historical effective date", () => {
    expect(OPENAI_PRICING_CATALOG).toMatchObject({
      schemaVersion: 2,
      version: "2026-09-07.1",
      verifiedAt: "2026-09-07",
      pricingTier: "standard",
      source: "https://developers.openai.com/api/docs/pricing",
    });
    expect(OPENAI_PRICING_CATALOG).not.toHaveProperty("effectiveAt");
  });

  it("uses verified Astra and Sol short- and long-context rates", () => {
    expect(ratesForModel("gpt-6-astra", "short")).toEqual({ input: 10, cachedInput: 1, cacheWrite: 12.5, output: 50 });
    expect(ratesForModel("gpt-6-astra", "long")).toEqual({ input: 20, cachedInput: 2, cacheWrite: 25, output: 75 });
    expect(ratesForModel("gpt-5.6-sol", "short")).toEqual({ input: 4, cachedInput: .4, cacheWrite: 5, output: 20 });
    expect(ratesForModel("gpt-5.6-sol", "long")).toEqual({ input: 8, cachedInput: .8, cacheWrite: 10, output: 30 });
    expect(pricingForModel("gpt-6-astra")?.longContextThreshold).toBe(272_000);
    expect(pricingForModel("gpt-5.6-sol")?.longContextThreshold).toBe(272_000);
  });

  it("resolves only documented aliases and dated snapshots while leaving unknown models unpriced", () => {
    expect(pricingForModel("gpt-5.6")?.model).toBe("gpt-5.6-sol");
    expect(pricingForModel("gpt-5.6-2026-09-01")?.model).toBe("gpt-5.6-sol");
    expect(pricingForModel("gpt-6-astra-2026-09-01")?.model).toBe("gpt-6-astra");
    expect(pricingForModel("gpt-6")).toBeNull();
    expect(pricingForModel("gpt-6-astra-preview")).toBeNull();
  });
});
