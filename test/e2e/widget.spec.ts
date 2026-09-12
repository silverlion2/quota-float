import { withExecuteOptions } from "@wdio/tauri-service";

async function expandWidget() {
  if (await browser.$(".quota-card").isDisplayed()) return;
  await browser.tauri.execute(() => {
    document.querySelector(".quota-orb, .quota-bar")?.dispatchEvent(
      new MouseEvent("mouseover", { bubbles: true }),
    );
  });
  await browser.$(".quota-card").waitForDisplayed({
    timeout: 15_000,
    timeoutMsg: "Quota Float did not expand from its compact widget",
  });
}

async function openControlCenter() {
  await browser.tauri.execute(() => {
    document.querySelector<HTMLButtonElement>(".control-action")?.click();
  });
  await browser.$('.control-center[role="dialog"]').waitForDisplayed();
}

describe("Quota Float desktop widget", () => {
  before(async () => {
    await browser.waitUntil(async () => (await browser.$("#root")).isExisting(), {
      timeout: 15_000,
      timeoutMsg: "Quota Float did not create its root view",
    });
    // Reset the separate E2E app's persisted presentation settings, then reload so
    // React observes them. Keep the widget expanded while the native pointer is elsewhere.
    await browser.tauri.execute(async (tauri) => {
      const preferences = await tauri.core.invoke("get_preferences") as Record<string, unknown>;
      await tauri.core.invoke("set_preferences", { preferences: {
        ...preferences, stayExpanded: true, pinnedProvider: "codex", resourceMode: "focus",
        expandedLayout: "dashboard", compactLayout: "float", language: "en",
        pausedProviders: [], hiddenProviders: [], automaticUpdates: false,
      } });
      (window as unknown as Record<string, unknown>).__e2eReloadPending = true;
      setTimeout(() => window.location.reload(), 50);
    });
    await browser.waitUntil(async () => browser.tauri.execute(() =>
      !(window as unknown as Record<string, unknown>).__e2eReloadPending
        && Boolean(document.querySelector(".quota-card")),
    ), { timeoutMsg: "The isolated E2E preferences were not loaded" });
  });

  beforeEach(async () => {
    await expandWidget();
  });

  afterEach(async function () {
    if (this.currentTest?.state === "failed") {
      console.log("Synthetic E2E failure state", await browser.tauri.execute(() => ({
        activeTab: document.querySelector(".control-tabs .is-active")?.textContent,
        hasManagement: Boolean(document.querySelector(".provider-settings--management")),
        provider: document.querySelector(".eyebrow")?.textContent,
        errors: Array.from(document.querySelectorAll('[role="alert"]')).map((node) => node.textContent),
      })));
      await browser.saveScreenshot("output/handoff/native-e2e-failure.png");
    }
    await browser.tauri.execute(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
  });

  it("loads inside Tauri with the test bridge available", async () => {
    const identity = await browser.tauri.execute(() => ({
      title: document.title,
      tauri: "__TAURI_INTERNALS__" in window,
      provider: document.querySelector(".eyebrow")?.textContent ?? "",
    }));
    expect(identity).toMatchObject({ title: "Quota Float", tauri: true });
    expect(identity.provider).toContain("CODEX");
    expect(identity.provider).toContain("PRO");
    await expect(browser.$("#root > *")).toBeExisting();
  });

  it("pauses and resumes provider monitoring through persisted native preferences", async () => {
    await browser.tauri.execute(async (tauri) => {
      const preferences = await tauri.core.invoke("get_preferences") as { pausedProviders?: string[] };
      await tauri.core.invoke("set_preferences", { preferences: { ...preferences, pausedProviders: [] } });
    });
    await openControlCenter();
    const selectProviderManagement = async () => browser.tauri.execute(() => {
      const tabs = document.querySelectorAll<HTMLButtonElement>(".control-tabs button");
      tabs[1]?.click();
      return tabs.length;
    });

    expect(await selectProviderManagement()).toBeGreaterThanOrEqual(2);
    const management = await browser.$(".provider-settings--management");
    await management.waitForDisplayed();
    const paused = await browser.tauri.execute(() => {
      const pauseButton = document.querySelectorAll<HTMLButtonElement>(".provider-settings--management > div")[0]?.querySelectorAll<HTMLButtonElement>("button")[2];
      pauseButton?.click();
      return Boolean(pauseButton);
    });
    expect(paused).toBe(true);
    await browser.waitUntil(async () => browser.tauri.execute(() => document.querySelectorAll(".provider-settings--management > div")[0]?.querySelectorAll("button")[2]?.classList.contains("is-active") === true));
    await browser.waitUntil(async () => browser.tauri.execute(async (tauri) => {
      const preferences = await tauri.core.invoke("get_preferences") as { pausedProviders?: string[] };
      return preferences.pausedProviders?.includes("codex") === true;
    }));

    await browser.keys(["Escape"]);
    await browser.$('.control-center[role="dialog"]').waitForDisplayed({ reverse: true });
    await openControlCenter();
    expect(await selectProviderManagement()).toBeGreaterThanOrEqual(2);
    await browser.$(".provider-settings--management").waitForDisplayed();
    expect(await browser.tauri.execute(() => document.querySelectorAll(".provider-settings--management > div")[0]?.querySelectorAll("button")[2]?.classList.contains("is-active") === true)).toBe(true);

    await browser.tauri.execute(() => {
      document.querySelectorAll<HTMLButtonElement>(".provider-settings--management > div")[0]?.querySelectorAll<HTMLButtonElement>("button")[2]?.click();
    });
    await browser.waitUntil(async () => browser.tauri.execute(() => document.querySelectorAll(".provider-settings--management > div")[0]?.querySelectorAll("button")[2]?.classList.contains("is-active") === false));
    await browser.waitUntil(async () => browser.tauri.execute(async (tauri) => {
      const preferences = await tauri.core.invoke("get_preferences") as { pausedProviders?: string[] };
      return preferences.pausedProviders?.includes("codex") === false;
    }));
  });

  it("opens and closes a detached cockpit window using synthetic cached data", async () => {
    await openControlCenter();
    await browser.tauri.execute(() => {
      document.querySelector<HTMLButtonElement>(".layout-option--cockpit")?.click();
    });
    await browser.waitUntil(async () => browser.tauri.execute(() => document.querySelector(".layout-option--cockpit")?.classList.contains("is-active") === true));
    await browser.keys(["Escape"]);
    const detach = await browser.$(".cockpit-detach-button");
    await detach.waitForDisplayed();
    await detach.click();

    const windowLabel = "focus-panel-overview-codex";
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes(windowLabel), {
      timeoutMsg: "Detached Codex overview window was not created",
    });
    await browser.waitUntil(async () => browser.tauri.execute(
      () => Boolean(document.querySelector(".focus-panel-header strong") && document.querySelector(".cockpit-overview-body")),
      withExecuteOptions({ windowLabel }),
    ), {
      timeoutMsg: "Detached Codex overview window did not finish rendering",
    });
    const panel = await browser.tauri.execute(
      () => ({
        heading: document.querySelector(".focus-panel-header strong")?.textContent ?? "",
        hasSnapshot: Boolean(document.querySelector(".cockpit-overview-body")),
      }),
      withExecuteOptions({ windowLabel }),
    );
    expect(panel.heading).toContain("CODEX");
    expect(panel.hasSnapshot).toBe(true);

    await browser.tauri.execute(
      () => document.querySelector<HTMLButtonElement>(".focus-panel-header > button")?.click(),
      withExecuteOptions({ windowLabel }),
    );
    await browser.waitUntil(async () => !(await browser.tauri.listWindows()).includes(windowLabel), {
      timeoutMsg: "Detached Codex overview window did not close",
    });

    await openControlCenter();
    await browser.tauri.execute(() => {
      document.querySelector<HTMLButtonElement>(".layout-option--dashboard")?.click();
    });
    await browser.waitUntil(async () => browser.tauri.execute(() => document.querySelector(".layout-option--dashboard")?.classList.contains("is-active") === true));
  });

  it("opens and closes the accessible control center", async () => {
    const opened = await browser.tauri.execute(() => {
      const button = document.querySelector<HTMLButtonElement>(".control-action");
      button?.click();
      return Boolean(button);
    });
    expect(opened).toBe(true);

    const dialog = await browser.$('.control-center[role="dialog"]');
    await dialog.waitForDisplayed();
    await expect(dialog).toHaveAttribute("aria-modal", "true");

    await browser.keys(["Escape"]);
    await dialog.waitForDisplayed({ reverse: true });
  });

  it("shows local weekly and monthly reports with explicit filter scope", async () => {
    await browser.tauri.execute(() => {
      document.querySelectorAll<HTMLButtonElement>(".quota-panel-tabs button")[1]?.click();
    });
    const report = await browser.$('[aria-label="Local period usage summary"]');
    await report.waitForExist();
    expect(await report.getText()).toContain("LOCAL PERIOD REPORT");
    await browser.tauri.execute(() => {
      document.querySelectorAll<HTMLButtonElement>('[aria-label="Local period usage summary"] .usage-range-tabs button')[1]?.click();
    });
    await browser.waitUntil(async () => browser.tauri.execute(() =>
      document.querySelectorAll('[aria-label="Local period usage summary"] .usage-range-tabs button')[1]?.getAttribute("aria-pressed") === "true",
    ));
    expect(await browser.tauri.execute(() => document.querySelectorAll(".usage-period-metrics > div").length)).toBe(4);
    const selectedProject = await browser.tauri.execute(() => {
      const select = document.querySelectorAll<HTMLSelectElement>(".usage-dimension-filters select")[1];
      select.value = select.options[1].value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return select.value;
    });
    expect(selectedProject).not.toBe("");
    await browser.waitUntil(async () => (await browser.$('[aria-label="Local period usage summary"]').getText()).includes("FILTERED"));
    await browser.tauri.execute(() => {
      const select = document.querySelectorAll<HTMLSelectElement>(".usage-dimension-filters select")[1];
      select.value = "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await browser.waitUntil(async () => !(await browser.$('[aria-label="Local period usage summary"]').getText()).includes("FILTERED"));
    await browser.tauri.execute(() => {
      document.querySelectorAll<HTMLButtonElement>(".quota-panel-tabs button")[0]?.click();
    });
  });

  it("opens the update dialog without navigating away", async () => {
    const opened = await browser.tauri.execute(() => {
      const button = document.querySelector<HTMLButtonElement>(".update-action");
      button?.click();
      return Boolean(button);
    });
    expect(opened).toBe(true);

    const dialog = await browser.$('.update-panel[role="dialog"]');
    await dialog.waitForDisplayed();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await browser.keys(["Escape"]);
    await dialog.waitForDisplayed({ reverse: true });
  });

  it("keeps repeated modal navigation responsive and restores keyboard focus", async () => {
    await openControlCenter();
    await browser.keys(["Escape"]);
    const measurements = await browser.tauri.execute(async () => {
      const painted = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const samples: number[] = [];
      let restoredFocus = true;
      let modalCount = 0;
      let backdropFilter = "";
      let clipPath = "";
      let duration = "";
      for (let index = 0; index < 8; index += 1) {
        const trigger = document.querySelector<HTMLButtonElement>(".control-action")!;
        trigger.focus();
        const start = performance.now();
        trigger.click();
        await painted();
        const dialog = document.querySelector<HTMLElement>('.control-center[role="dialog"]')!;
        samples.push(performance.now() - start);
        modalCount = Math.max(modalCount, document.querySelectorAll('[aria-modal="true"]').length);
        const style = getComputedStyle(dialog);
        backdropFilter = style.backdropFilter;
        duration = style.animationDuration;
        clipPath = getComputedStyle(document.querySelector(".quota-card")!).clipPath;
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await painted();
        restoredFocus &&= document.activeElement === trigger;
      }
      return { samples, restoredFocus, modalCount, backdropFilter, clipPath, duration };
    });
    console.log("Synthetic native modal timing (click to two animation frames, ms)", measurements);
    expect(measurements.restoredFocus).toBe(true);
    expect(measurements.modalCount).toBe(1);
    expect(measurements.backdropFilter).toBe("none");
    expect(measurements.clipPath).toBe("none");
    expect(parseFloat(measurements.duration)).toBeLessThanOrEqual(0.16);
    // A coarse stall guard, not an FPS claim: tight frame-rate numbers vary with CI load.
    expect(Math.max(...measurements.samples)).toBeLessThan(1000);
    await expect(browser.$('.control-center[role="dialog"]')).not.toBeExisting();
  });

  it("keeps control center content within the native window in both appearances", async () => {
    await openControlCenter();
    for (const appearance of ["light", "dark"] as const) {
      await browser.tauri.execute((_, selected) => {
        const buttons = document.querySelectorAll<HTMLButtonElement>('.appearance-options button');
        buttons[selected === "light" ? 1 : 2]?.click();
      }, appearance);
      await browser.waitUntil(async () => browser.tauri.execute((_, selected) =>
        Boolean(document.querySelector(`.quota-card--theme-${selected}`)), appearance,
      ));
      const bounds = await browser.tauri.execute(() => {
        const dialog = document.querySelector<HTMLElement>(".control-center")!;
        const body = document.querySelector<HTMLElement>(".control-body")!;
        body.scrollTop = 0;
        const rect = dialog.getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight, overflow: body.scrollWidth - body.clientWidth };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(bounds.width);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
      expect(bounds.overflow).toBeLessThanOrEqual(1);
      await browser.saveScreenshot(`output/handoff/control-center-${appearance}-2026-09-12.png`);
    }
    await browser.keys(["Escape"]);
  });
});
