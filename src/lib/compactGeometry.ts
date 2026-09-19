import type { BarEdge } from "../types";

// Content dimensions; native windows add the 4px transparent inset on each side.
// Keep this contract aligned with collapsed_physical_size in src-tauri/src/lib.rs.
export function compactBarSize(layout: "bar" | "bottleneck", edge: BarEdge, providerCount: number) {
  const count = Number.isFinite(providerCount) ? Math.max(1, Math.min(7, Math.floor(providerCount))) : 1;
  const width = layout === "bar" ? 224 + (count - 1) * 28 : 196 + (count - 1) * 34;
  const height = layout === "bar" ? 156 + (count - 1) * 26 : 100 + (count - 1) * 32;
  return edge === "top" ? { width, height: 38, count } : { width: 64, height, count };
}
