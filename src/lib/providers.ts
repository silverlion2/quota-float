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
