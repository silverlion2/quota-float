import { mkdir, writeFile } from "node:fs/promises";

describe("Desktop presentation variants", () => {
  it("keeps all expanded layouts inside the native window across six palettes", async function () {
    this.timeout(180_000);
    await mkdir("output/reset-prediction-20261014/native", { recursive: true });
    const original = await browser.tauri.execute(async (tauri) => tauri.core.invoke("get_preferences")) as Record<string, unknown>;
    const measurements: unknown[] = [];
    const sizeTraces: unknown[] = [];
    let completed = false;
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
            await browser.$(".reset-outlook > summary").click();
            await browser.$(".reset-outlook[open] .reset-prediction").waitForDisplayed();
            let lastSize = "";
            await browser.waitUntil(async () => {
              const size = await browser.tauri.execute(() => {
                const card = document.querySelector<HTMLElement>(".quota-card")!;
                const body = document.querySelector<HTMLElement>(".reset-outlook-body")!;
                const style = getComputedStyle(body);
                return {
                  viewport: [innerWidth, innerHeight], card: [card.offsetWidth, card.offsetHeight],
                  body: [body.clientWidth, body.clientHeight, body.scrollHeight],
                  cardScrollHeight: card.scrollHeight, pixelRatio: devicePixelRatio,
                  bodyMaxHeight: style.maxHeight, bodyMinHeight: style.minHeight,
                  bodyOverflow: style.overflowY, contentWidth: card.dataset.contentWidth,
                  ledger: Array.from(card.querySelectorAll<HTMLElement>(".provider-ledger")).map((ledger) => ({ height: ledger.offsetHeight, contentHeight: ledger.scrollHeight, overflow: getComputedStyle(ledger).overflowY })),
                };
              });
              const signature = JSON.stringify(size);
              if (signature !== lastSize) {
                sizeTraces.push({ id, ...size });
                lastSize = signature;
              }
              return size.card[1] <= size.viewport[1] + 2;
            });
            const bounds = await browser.tauri.execute(() => ({
              viewport: [innerWidth, innerHeight],
              panels: Array.from(document.querySelectorAll<HTMLElement>(".quota-panel-header, .primary-pane, .provider-ledger, .cockpit-panel, .reset-prediction, .reset-outlook-body")).map(el => ({
                name: el.className, width: el.clientWidth, contentWidth: el.scrollWidth,
              })),
            }));
            measurements.push({ id, ...bounds });
            for (const panel of bounds.panels) expect(panel.contentWidth).toBeLessThanOrEqual(panel.width + 2);
            await browser.saveScreenshot(`output/reset-prediction-20261014/native/${id}.png`);
          }
        }
      }
      completed = true;
    } finally {
      await writeFile("output/reset-prediction-20261014/native/variants-size-trace.json", JSON.stringify(sizeTraces, null, 2));
      if (!completed) await browser.saveScreenshot("output/reset-prediction-20261014/native/variants-size-failure.png");
      await writeFile("output/reset-prediction-20261014/native/expanded-matrix.json", JSON.stringify(measurements, null, 2));
      await browser.tauri.execute(async (tauri, preferences) => { await tauri.core.invoke("set_preferences", { preferences }); }, original);
    }
  });
});
