import type { ProviderId } from "../types";

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
}

export const PROVIDER_CATALOG: readonly ProviderDefinition[] = [
  { id: "codex", label: "CODEX" },
  { id: "qoder", label: "QODER" },
  { id: "trae", label: "TRAE" },
  { id: "workbuddy", label: "WORKBUDDY" },
  { id: "volcengine", label: "VOLCENGINE" },
];

export const DEFAULT_PROVIDER_ORDER: ProviderId[] = PROVIDER_CATALOG.map((provider) => provider.id);

export function normalizeProviderOrder(order?: readonly ProviderId[] | null): ProviderId[] {
  const valid = new Set(DEFAULT_PROVIDER_ORDER);
  const normalized: ProviderId[] = [];
  for (const provider of order ?? []) {
    if (valid.has(provider) && !normalized.includes(provider)) normalized.push(provider);
  }
  for (const provider of DEFAULT_PROVIDER_ORDER) {
    if (!normalized.includes(provider)) normalized.push(provider);
  }
  return normalized;
}
