import type { WidgetPreferences } from "../types";

export const BACKUP_SCHEMA_VERSION = 1;

export interface ParsedBackupBundle {
  schemaVersion: number;
  preferences: Partial<WidgetPreferences>;
  runtimeState: Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function parseBackupBundle(value: unknown): ParsedBackupBundle {
  const bundle = record(value);
  if (!bundle) throw new Error("Backup file is invalid.");

  const schemaVersion = bundle.schemaVersion ?? BACKUP_SCHEMA_VERSION;
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error("Backup schema version is invalid.");
  }
  if (schemaVersion > BACKUP_SCHEMA_VERSION) {
    throw new Error("Backup was created by a newer version of Quota Float.");
  }

  const preferences = record(bundle.preferences);
  const runtimeState = record(bundle.runtimeState);
  if (!preferences || !runtimeState) throw new Error("Backup file is missing settings or history.");

  return {
    schemaVersion,
    preferences: preferences as Partial<WidgetPreferences>,
    runtimeState,
  };
}
