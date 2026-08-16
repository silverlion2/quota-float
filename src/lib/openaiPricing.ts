import type { TokenContextTier } from "../types";

export interface TokenRates {
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
}

export interface ModelPricing {
  model: string;
  label: string;
  aliases: string[];
  short: TokenRates;
  long: TokenRates;
  longContextThreshold: number | null;
}

export interface OpenAiPricingCatalog {
  schemaVersion: 1;
  version: string;
  effectiveAt: string;
  source: string;
  unit: "USD per 1M tokens";
  models: ModelPricing[];
}

export const OPENAI_PRICING_CATALOG: OpenAiPricingCatalog = {
  schemaVersion: 1,
  version: "2026-08-16.1",
  effectiveAt: "2026-08-16",
  source: "https://developers.openai.com/api/docs/pricing",
  unit: "USD per 1M tokens",
  models: [
    { model: "gpt-5.6-sol", label: "GPT-5.6 Sol", aliases: ["gpt-5.6"], short: { input: 5, cachedInput: .5, cacheWrite: 6.25, output: 30 }, long: { input: 10, cachedInput: 1, cacheWrite: 12.5, output: 45 }, longContextThreshold: 272_000 },
    { model: "gpt-5.6-terra", label: "GPT-5.6 Terra", aliases: [], short: { input: 2, cachedInput: .2, cacheWrite: 2.5, output: 12 }, long: { input: 4, cachedInput: .4, cacheWrite: 5, output: 18 }, longContextThreshold: 272_000 },
    { model: "gpt-5.6-luna", label: "GPT-5.6 Luna", aliases: [], short: { input: .2, cachedInput: .02, cacheWrite: .25, output: 1.2 }, long: { input: .4, cachedInput: .04, cacheWrite: .5, output: 1.8 }, longContextThreshold: 272_000 },
    { model: "gpt-5.5", label: "GPT-5.5", aliases: [], short: { input: 5, cachedInput: .5, cacheWrite: 5, output: 30 }, long: { input: 10, cachedInput: 1, cacheWrite: 10, output: 45 }, longContextThreshold: 272_000 },
    { model: "gpt-5.4", label: "GPT-5.4", aliases: [], short: { input: 2.5, cachedInput: .25, cacheWrite: 2.5, output: 15 }, long: { input: 5, cachedInput: .5, cacheWrite: 5, output: 22.5 }, longContextThreshold: 272_000 },
    { model: "gpt-5.3-codex", label: "GPT-5.3 Codex", aliases: [], short: { input: 1.75, cachedInput: .175, cacheWrite: 1.75, output: 14 }, long: { input: 1.75, cachedInput: .175, cacheWrite: 1.75, output: 14 }, longContextThreshold: null },
  ],
};

export function pricingForModel(model: string): ModelPricing | null {
  const normalized = model.trim().toLowerCase();
  return OPENAI_PRICING_CATALOG.models.find((pricing) => {
    const candidates = [pricing.model, ...pricing.aliases];
    return candidates.some((candidate) => normalized === candidate || normalized.startsWith(`${candidate}-20`));
  }) ?? null;
}

export function ratesForModel(model: string, tier: TokenContextTier): TokenRates | null {
  const pricing = pricingForModel(model);
  return pricing ? pricing[tier] : null;
}
