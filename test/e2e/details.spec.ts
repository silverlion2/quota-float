import { mkdir, writeFile } from "node:fs/promises";

describe("Edge details window stability", () => {
  it("expands details without oversizing or returning to the bar on all three edges", async () => {
    await mkdir("output/handoff", { recursive: true });
    const original = await browser.tauri.execute(async (tauri) => tauri.core.invoke("get_preferences")) as Record<string, unknown>;
    const traces: unknown[] = [];
    try {
      for (const edge of ["top", "left", "right"]) {
        await browser.tauri.execute(async (tauri, value) => {
          await tauri.core.invoke("set_preferences", { preferences: value });
          (window as unknown as Record<string, unknown>).__reloadPending = true;
          setTimeout(() => location.reload(), 50);
        }, { ...original, compactLayout: "bar", barEdge: edge, barOffset: 0.5,
          stayExpanded: false, locked: false, pinnedProvider: "codex", resourceMode: "focus",
          expandedLayout: "dashboard", hiddenProviders: [], pausedProviders: [], language: "en", automaticUpdates: false });
        await browser.waitUntil(async () => browser.tauri.execute(() =>
          !(window as unknown as Record<string, unknown>).__reloadPending && !!document.querySelector(".bar-details") && innerWidth < 450,
        ));
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const trace = await browser.tauri.execute(async () => {
            const samples: { width: number; height: number; cardHeight: number; compact: boolean }[] = [];
            const start = performance.now();
            document.querySelector<HTMLButtonElement>(".bar-details")!.click();
            while (performance.now() - start < 1500) {
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              const card = document.querySelector<HTMLElement>(".quota-card");
              samples.push({ width: innerWidth, height: innerHeight, cardHeight: card?.offsetHeight ?? 0, compact: !card });
            }
            return samples;
          });
          traces.push({ edge, attempt, trace });
          await writeFile("output/handoff/edge-details-traces.json", JSON.stringify(traces, null, 2));
          const expanded = trace.filter((sample) => sample.width >= 550 && !sample.compact);
          expect(expanded.length).toBeGreaterThan(0);
          const final = trace.at(-1)!;
          expect(final.compact).toBe(false);
          expect(final.height).toBeGreaterThanOrEqual(final.cardHeight);
          // A narrow-bar measurement used to inflate the native window before it
          // shrank to the final card. Read real WebView viewport changes per frame.
          expect(Math.max(...expanded.map((sample) => sample.height))).toBeLessThanOrEqual(final.height + 2);
          if (attempt === 0) await browser.saveScreenshot(`output/handoff/edge-details-${edge}.png`);
          if (edge === "top" && attempt === 0) {
            await browser.tauri.execute(() => {
              document.querySelectorAll<HTMLButtonElement>('.quota-panel-tabs [role="tab"]')[1]!.click();
            });
            await browser.$(".usage-insights-panel").waitForDisplayed();
            const heights = await browser.tauri.execute(async () => {
              const samples: number[] = [];
              const start = performance.now();
              while (performance.now() - start < 2000) {
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                if (performance.now() - start > 1000) samples.push(innerHeight);
              }
              const card = document.querySelector<HTMLElement>(".quota-card")!;
              const panel = document.querySelector<HTMLElement>(".usage-insights-panel")!;
              return { samples, card: card.offsetHeight, panel: panel.clientHeight };
            });
            expect(Math.max(...heights.samples) - Math.min(...heights.samples)).toBeLessThanOrEqual(2);
            expect(heights.samples.at(-1)!).toBeGreaterThanOrEqual(heights.card);
            expect(heights.panel).toBeLessThanOrEqual(480);
            await browser.saveScreenshot("output/handoff/insights-stable-native.png");
          }
          await browser.tauri.execute(() => {
            document.querySelector(".quota-card")?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: null }));
          });
          await browser.waitUntil(async () => browser.tauri.execute(() => !!document.querySelector(".bar-details") && innerWidth < 450));
          const retainedCompactWidth = await browser.tauri.execute(async (tauri) => {
            const width = innerWidth;
            await tauri.core.invoke("resize_expanded_widget", { contentHeight: 900, contentWidth: 552 });
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            return innerWidth === width;
          });
          expect(retainedCompactWidth).toBe(true);
        }
      }
    } finally {
      await browser.tauri.execute(async (tauri, preferences) => {
        await tauri.core.invoke("set_preferences", { preferences });
      }, original);
    }
  });
});
