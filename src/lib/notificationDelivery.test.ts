import { describe, expect, it, vi } from "vitest";
import { deliverNotificationOnce } from "./notificationDelivery";

describe("notification delivery acknowledgement", () => {
  it("marks only successful deliveries", async () => {
    let delivered = false;
    const mark = vi.fn(() => { delivered = true; });
    await expect(deliverNotificationOnce("success", () => delivered, mark, async () => true)).resolves.toBe(true);
    await expect(deliverNotificationOnce("success", () => delivered, mark, async () => true)).resolves.toBe(false);
    expect(mark).toHaveBeenCalledOnce();

    const failedMark = vi.fn();
    await expect(deliverNotificationOnce("failure", () => false, failedMark, async () => false)).resolves.toBe(false);
    expect(failedMark).not.toHaveBeenCalled();
  });

  it("deduplicates concurrent attempts and allows retry after failure", async () => {
    let release!: (value: boolean) => void;
    const pending = new Promise<boolean>((resolve) => { release = resolve; });
    const send = vi.fn(() => pending);
    const first = deliverNotificationOnce("concurrent", () => false, vi.fn(), send);
    await expect(deliverNotificationOnce("concurrent", () => false, vi.fn(), send)).resolves.toBe(false);
    expect(send).toHaveBeenCalledOnce();
    release(false);
    await expect(first).resolves.toBe(false);
    await expect(deliverNotificationOnce("concurrent", () => false, vi.fn(), async () => true)).resolves.toBe(true);
  });
});
