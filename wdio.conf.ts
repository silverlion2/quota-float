import type { Options } from "@wdio/types";

const executable = process.platform === "win32" ? "quota-float.exe" : "quota-float";
const appBinaryPath = `./src-tauri/target/release/${executable}`;

export const config: Options.Testrunner = {
  runner: "local",
  specs: ["./test/e2e/**/*.spec.ts"],
  maxInstances: 1,
  services: [["tauri", {
    appBinaryPath,
    driverProvider: "embedded",
    windowLabel: "widget",
    captureBackendLogs: true,
    captureFrontendLogs: true,
  }]],
  capabilities: [{
    browserName: "tauri",
    "tauri:options": { application: appBinaryPath },
    "wdio:tauriServiceOptions": { windowLabel: "widget" },
  }],
  framework: "mocha",
  reporters: ["spec"],
  logLevel: "warn",
  waitforTimeout: 15_000,
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 2,
  mochaOpts: { ui: "bdd", timeout: 60_000 },
};
