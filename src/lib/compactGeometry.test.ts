import { describe, expect, it } from "vitest";
import { compactBarSize } from "./compactGeometry";

describe("content-sized compact window contract", () => {
  it("reclaims single-provider space in all three edges", () => {
    expect(compactBarSize("bar", "top", 1)).toMatchObject({ width: 224, height: 38 });
    for (const edge of ["left", "right"] as const) {
      expect(compactBarSize("bar", edge, 1)).toMatchObject({ width: 64, height: 156 });
      expect(compactBarSize("bottleneck", edge, 1)).toMatchObject({ width: 64, height: 100 });
    }
  });
  it("grows only for actual providers and bounds invalid counts", () => {
    expect(compactBarSize("bar", "right", 2).height).toBe(182);
    expect(compactBarSize("bar", "right", 7).height).toBe(312);
    expect(compactBarSize("bottleneck", "top", 7).width).toBe(400);
    for (const count of [0, -1, NaN, Infinity]) expect(compactBarSize("bar", "left", count).height).toBe(156);
    expect(compactBarSize("bar", "left", 99).height).toBe(312);
  });
});
