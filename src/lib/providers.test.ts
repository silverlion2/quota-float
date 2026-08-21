import { describe, expect, it } from "vitest";
import { nextProviderIndex, normalizeProviderOrder } from "./providers";

describe("provider ordering", () => {
  it("preserves a custom order and appends missing providers", () => {
    expect(normalizeProviderOrder(["volcengine", "codex"])).toEqual([
      "volcengine",
      "codex",
      "qoder",
      "trae",
      "workbuddy",
      "antigravity",
    ]);
  });

  it("deduplicates provider ids", () => {
    expect(normalizeProviderOrder(["qoder", "qoder", "codex"])).toEqual([
      "qoder",
      "codex",
      "trae",
      "workbuddy",
      "volcengine",
      "antigravity",
    ]);
  });
});

describe("provider rotation", () => {
  it("cycles against the visible provider count", () => {
    expect(nextProviderIndex(0, 4)).toBe(1);
    expect(nextProviderIndex(3, 4)).toBe(0);
    expect(nextProviderIndex(5, 4)).toBe(2);
    expect(nextProviderIndex(2, 0)).toBe(0);
  });
});
