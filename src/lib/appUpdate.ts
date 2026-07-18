import type { DownloadEvent, Update } from "@tauri-apps/plugin-updater";
import { isTauri } from "./bridge";

export const RELEASE_URL = "https://github.com/silverlion2/quota-float/releases/latest";

export type AppUpdatePlatform = "windows" | "macos";

export interface AppUpdateInfo {
  version: string;
  body: string | null;
  date: string | null;
  platform: AppUpdatePlatform;
}

export interface AppUpdateProgress {
  downloadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

let pendingUpdate: Update | null = null;
let checkPromise: Promise<AppUpdateInfo | null> | null = null;
let downloadPromise: Promise<void> | null = null;

function updatePlatform(): AppUpdatePlatform {
  return /Macintosh|Mac OS X/i.test(navigator.userAgent) ? "macos" : "windows";
}

function updateInfo(update: Update): AppUpdateInfo {
  return {
    version: update.version,
    body: update.body?.trim() || null,
    date: update.date ?? null,
    platform: updatePlatform(),
  };
}

export function getPendingAppUpdate(): AppUpdateInfo | null {
  return pendingUpdate ? updateInfo(pendingUpdate) : null;
}

export async function openReleasePage(): Promise<void> {
  if (!isTauri()) {
    window.open(RELEASE_URL, "_blank", "noopener,noreferrer");
    return;
  }
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(RELEASE_URL);
}

export async function checkForAppUpdate(): Promise<AppUpdateInfo | null> {
  if (pendingUpdate) return updateInfo(pendingUpdate);
  if (!isTauri()) return null;
  if (checkPromise) return checkPromise;

  checkPromise = (async () => {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check({ timeout: 15_000 });
    pendingUpdate = update;
    return update ? updateInfo(update) : null;
  })();
  try {
    return await checkPromise;
  } finally {
    checkPromise = null;
  }
}

function reportProgress(
  event: DownloadEvent,
  current: { downloadedBytes: number; totalBytes: number | null },
  onProgress: (progress: AppUpdateProgress) => void,
) {
  if (event.event === "Started") {
    current.totalBytes = event.data.contentLength ?? null;
    current.downloadedBytes = 0;
  } else if (event.event === "Progress") {
    current.downloadedBytes += event.data.chunkLength;
  } else {
    if (current.totalBytes !== null) current.downloadedBytes = current.totalBytes;
  }
  onProgress({
    ...current,
    percent: current.totalBytes && current.totalBytes > 0
      ? Math.min(100, Math.round((current.downloadedBytes / current.totalBytes) * 100))
      : event.event === "Finished" ? 100 : null,
  });
}

export async function downloadAppUpdate(onProgress: (progress: AppUpdateProgress) => void): Promise<void> {
  if (!pendingUpdate) throw new Error("No app update is ready to download.");
  if (updatePlatform() === "macos") throw new Error("macOS updates are downloaded from GitHub Releases.");
  if (downloadPromise) return downloadPromise;

  const current = { downloadedBytes: 0, totalBytes: null as number | null };
  downloadPromise = pendingUpdate.download((event) => reportProgress(event, current, onProgress), { timeout: 5 * 60_000 });
  try {
    await downloadPromise;
  } finally {
    downloadPromise = null;
  }
}

export async function installAppUpdate(): Promise<void> {
  if (!pendingUpdate) throw new Error("No downloaded app update is ready to install.");
  await pendingUpdate.install();
  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}

export async function discardAppUpdate(): Promise<void> {
  const update = pendingUpdate;
  pendingUpdate = null;
  checkPromise = null;
  downloadPromise = null;
  if (update) await Promise.resolve(update.close()).catch(() => undefined);
}
