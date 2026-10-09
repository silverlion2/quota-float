import { mkdir, writeFile } from "node:fs/promises";

describe("Desktop presentation variants", () => {
  it("keeps all expanded layouts inside the native window across six palettes", async function () {
    this.timeout(180_000);
    await mkdir("output/uiux-20261010/native", { recursive: true });
    const original = await browser.tauri.execute(async (tauri) => tauri.core.invoke("get_preferences")) as Record<string, unknown>;
    const measurements: unknown[] = [];
    try {
      for (const expandedLayout of ["dashboard", "cockpit", "provider-bar", "stacked"]) {
        for (const colorTheme of ["aurora", "graphite", "paper"]) {
          for (const appearanceMode of ["light", "dark"]) {
            const id = `${expandedLayout}-${colorTheme}-${appearanceMode}`;
            await browser.tauri.execute(async (tauri, preferences) => {
              await tauri.core.invoke("set_preferences", { preferences });
              (window as unknown as Record<string, unknown>).__variantReload = true;
              setTimeout(() => location.reload(), 50);
            }, { ...original, expandedLayout, colorTheme, appearanceMode, compactLayout: "float",
              stayExpanded: true, pinnedProvider: "codex", resourceMode: "focus", hiddenProviders: [],
              pausedProviders: [], language: "en", locked: false, automaticUpdates: false });
            await browser.waitUntil(async () => browser.tauri.execute(() =>
              !(window as unknown as Record<string, unknown>).__variantReload && !!document.querySelector(".quota-card"),
            ));
            await browser.waitUntil(async () => browser.tauri.execute(() => {
              const card = document.querySelector<HTMLElement>(".quota-card")!;
              return card.offsetHeight <= innerHeight + 2 && card.offsetWidth <= innerWidth + 2;
            }));
            const bounds = await browser.tauri.execute(() => ({
              viewport: [innerWidth, innerHeight],
              panels: Array.from(document.querySelectorAll<HTMLElement>(".quota-panel-header, .primary-pane, .provider-ledger, .cockpit-panel")).map(el => ({
                name: el.className, width: el.clientWidth, contentWidth: el.scrollWidth,
              })),
            }));
            measurements.push({ id, ...bounds });
            for (const panel of bounds.panels) expect(panel.contentWidth).toBeLessThanOrEqual(panel.width + 2);
            if ((expandedLayout === "dashboard" && colorTheme === "graphite" && appearanceMode === "dark")
              || (expandedLayout === "cockpit" && colorTheme === "aurora" && appearanceMode === "light")
              || (expandedLayout === "provider-bar" && colorTheme === "graphite" && appearanceMode === "light")
              || (expandedLayout === "stacked" && colorTheme === "paper" && appearanceMode === "light")) {
              await browser.saveScreenshot(`output/uiux-20261010/native/${id}.png`);
            }
          }
        }
      }
    } finally {
      await writeFile("output/uiux-20261010/native/expanded-matrix.json", JSON.stringify(measurements, null, 2));
      await browser.tauri.execute(async (tauri, preferences) => { await tauri.core.invoke("set_preferences", { preferences }); }, original);
    }
  });
});
