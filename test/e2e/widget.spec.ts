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
  });

  beforeEach(async () => {
    await expandWidget();
  });

  afterEach(async () => {
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
    await management.waitForDisplayed();
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
});
