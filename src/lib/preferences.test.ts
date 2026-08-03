import { describe, expect, it } from "vitest";
import { normalizeWidgetPreferences } from "./preferences";

describe("widget preference migration", () => {
  it("fills new quality-of-life settings for legacy preferences", () => {
    const value = normalizeWidgetPreferences({ language: "en", providerOrder: ["qoder", "codex"] as never });
    expect(value.providerOrder).toEqual(["qoder", "codex", "trae", "workbuddy", "volcengine", "antigravity"]);
    expect(value.layoutMode).toBe("standard");
    expect(value.notificationsEnabled).toBe(true);
  });

  it("rejects unsafe colors and never hides every provider", () => {
    const value = normalizeWidgetPreferences({ accentColor: "red; background:url(x)", hiddenProviders: ["codex", "qoder", "trae", "workbuddy", "volcengine", "antigravity"] });
    expect(value.accentColor).toBe("#397ae0");
    expect(value.hiddenProviders).toEqual([]);
  });

  it("normalizes malformed values from a manually edited backup", () => {
    const value = normalizeWidgetPreferences({
      alertThreshold: "many" as never,
      autoRotateSeconds: Number.NaN,
      notificationsEnabled: "false" as never,
      quietHoursStart: -100,
      notificationCooldownMinutes: Number.POSITIVE_INFINITY,
    });
    expect(value.alertThreshold).toBe(15);
    expect(value.autoRotateSeconds).toBe(12);
    expect(value.notificationsEnabled).toBe(true);
    expect(value.quietHoursStart).toBe(0);
    expect(value.notificationCooldownMinutes).toBe(120);
  });
});
