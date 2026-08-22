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
    const title = await browser.tauri.execute(() => document.title);
    expect(title).toBe("Quota Float");
    await expect(browser.$("#root > *")).toBeExisting();
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
