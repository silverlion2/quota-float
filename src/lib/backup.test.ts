import { describe, expect, it } from "vitest";
import { parseBackupBundle } from "./backup";

describe("backup envelope validation", () => {
  it("accepts the current schema and schema-less legacy backups", () => {
    const current = parseBackupBundle({ schemaVersion: 1, preferences: {}, runtimeState: {} });
    const legacy = parseBackupBundle({ preferences: {}, runtimeState: {} });

    expect(current.schemaVersion).toBe(1);
    expect(legacy.schemaVersion).toBe(1);
  });

  it("rejects arrays and incomplete backup sections before applying state", () => {
    for (const value of [
      [],
      { schemaVersion: 1, preferences: [], runtimeState: {} },
      { schemaVersion: 1, preferences: {}, runtimeState: [] },
      { schemaVersion: 1, preferences: {} },
    ]) {
      expect(() => parseBackupBundle(value)).toThrow();
    }
  });

  it("rejects malformed and future schema versions", () => {
    expect(() => parseBackupBundle({ schemaVersion: "1", preferences: {}, runtimeState: {} })).toThrow("schema version is invalid");
    expect(() => parseBackupBundle({ schemaVersion: 2, preferences: {}, runtimeState: {} })).toThrow("newer version of Quota Float");
  });
});
