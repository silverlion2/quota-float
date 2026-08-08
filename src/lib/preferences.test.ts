import { describe, expect, it } from "vitest";
import { normalizeWidgetPreferences } from "./preferences";

describe("widget preference migration", () => {
  it("fills new quality-of-life settings for legacy preferences", () => {
    const value = normalizeWidgetPreferences({ language: "en", providerOrder: ["qoder", "codex"] as never });
    expect(value.providerOrder).toEqual(["qoder", "codex", "trae", "workbuddy", "volcengine", "antigravity"]);
    expect(value.layoutMode).toBe("standard");
    expect(value.compactLayout).toBe("float");
    expect(value.expandedLayout).toBe("dashboard");
    expect(value.colorTheme).toBe("aurora");
    expect(value.appearanceMode).toBe("system");
    expect(value.riskFirst).toBe(false);
    expect(value.showHistorySparklines).toBe(true);
    expect(value.notificationsEnabled).toBe(true);
  });

  it("normalizes independent compact layouts and color themes", () => {
    const graphiteBar = normalizeWidgetPreferences({ compactLayout: "bar", expandedLayout: "provider-bar", colorTheme: "graphite", riskFirst: true, showHistorySparklines: false });
    expect(graphiteBar.compactLayout).toBe("bar");
    expect(graphiteBar.expandedLayout).toBe("provider-bar");
    expect(graphiteBar.colorTheme).toBe("graphite");
    expect(normalizeWidgetPreferences({ compactLayout: "ring", expandedLayout: "stacked" })).toEqual(expect.objectContaining({ compactLayout: "ring", expandedLayout: "stacked" }));
    expect(normalizeWidgetPreferences({ appearanceMode: "dark" }).appearanceMode).toBe("dark");
    expect(normalizeWidgetPreferences({ appearanceMode: "sepia" as never }).appearanceMode).toBe("system");
    expect(normalizeWidgetPreferences({ compactLayout: "stack" as never }).compactLayout).toBe("float");
    expect(normalizeWidgetPreferences({ expandedLayout: "stack" as never }).expandedLayout).toBe("dashboard");
    expect(normalizeWidgetPreferences({ colorTheme: "neon" as never }).colorTheme).toBe("aurora");
  });

  it("migrates legacy visual styles without coupling layout and color", () => {
    expect(normalizeWidgetPreferences({ visualStyle: "island" }).compactLayout).toBe("bar");
    expect(normalizeWidgetPreferences({ visualStyle: "island" }).expandedLayout).toBe("provider-bar");
    expect(normalizeWidgetPreferences({ visualStyle: "island" }).colorTheme).toBe("aurora");
    expect(normalizeWidgetPreferences({ visualStyle: "graphite" }).compactLayout).toBe("float");
    expect(normalizeWidgetPreferences({ visualStyle: "graphite" }).colorTheme).toBe("graphite");
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
