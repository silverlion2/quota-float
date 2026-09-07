# Dependency and toolchain policy

Quota Float favors a stable, reproducible desktop toolchain over automatic major-version adoption. Dependency changes must preserve the local-first credential boundary and pass the desktop gates in `docs/DESKTOP-DEVELOPMENT-SOP.md`.

## Canonical JavaScript toolchain

- `.node-version` pins local development and CI to Node.js 24.14.0 LTS.
- `package.json#engines` accepts Node.js 22.18+ on the 22.x line or Node.js 24.x, plus npm 10 or 11. EOL Node 23 is excluded rather than accidentally admitting early 23.x releases. Node 22.18 is the 22.x lower bound because built-in TypeScript type stripping is enabled by default there, while Vite's `--configLoader native` delegates loading `vite.config.ts` to the runtime instead of transforming it.
- `package.json#packageManager` records npm 11.9.0, the npm version shipped with the canonical Node release. `npm ci` remains the reproducible install command.
- Every GitHub Actions workflow reads `.node-version`; do not duplicate a floating Node major in workflow YAML.

References: [Vite config loading](https://vite.dev/config/), [Vite 7 Node requirements](https://vite.dev/guide/migration), [Node.js TypeScript type stripping](https://nodejs.org/api/typescript.html), and [Node.js 24.14.0 release](https://nodejs.org/en/blog/release/v24.14.0).

## Reviewed major-version candidates

The lockfile currently resolves Vite 7.3.6, Vitest 3.2.7, TypeScript 5.9.3, jsdom 26.1.0, and Tauri JavaScript 2.11.x. Keep these compatible majors until the following migration work is scheduled and verified as one focused change:

| Package | Decision | Revisit when |
| --- | --- | --- |
| Vite 8 | Defer. Vite 8 replaces the Rollup/esbuild pipeline with Rolldown/Oxc, so it is a migration rather than a routine bump. | Rolldown plugin compatibility and production bundle output are validated together. |
| Vitest 4/5 | Defer. New majors include runner, mock, coverage, and default-behavior changes. | The full component suite is audited against the official migration guide. |
| TypeScript 6 | Defer. TypeScript 6 is a transition release with intentional breaking/deprecation cleanup. | The application and WDIO specs compile cleanly in a dedicated migration. |
| jsdom 30 | Defer. Its Node constraint excludes the canonical Node 24.14.0 (`^24.15.0` is required), and the major contains DOM/CSS behavior changes. | The canonical Node version moves to a supported patch and UI tests are reviewed for behavior changes. |
| Tauri 2.11 | Retain. The JavaScript lockfile and Rust ecosystem are already on the current stable Tauri 2.11 line. | A stable Tauri release provides a specific security, platform, or correctness benefit and native smoke tests pass. |

References: [Vite 8 announcement](https://vite.dev/blog/announcing-vite8), [Vitest migration guide](https://vitest.dev/guide/migration/), [TypeScript 5.9](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-9.html), [TypeScript 6.0](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html), [jsdom releases](https://github.com/jsdom/jsdom/releases), and [Tauri releases](https://tauri.app/release/).

## Dependabot ownership

Dependabot groups non-major updates by compatibility boundary:

- npm production runtime dependencies;
- npm build and test tooling, including WebdriverIO;
- Tauri JavaScript packages;
- Tauri Rust crates;
- other Rust runtime/build crates;
- GitHub Actions.

Major updates stay outside these groups so their migration and rollback surface is visible in a dedicated pull request. Review Tauri JavaScript and Rust updates together when either side changes a command, capability, window, or updater contract.

## npm override register

Overrides are temporary security/compatibility constraints, not permanent pins:

| Override | Current reason | Exit condition |
| --- | --- | --- |
| `@puppeteer/browsers` `^3.2.1` | Forces the WebdriverIO/Tauri E2E transitive path off older browser-management releases. | Remove when every `npm explain @puppeteer/browsers` path natively requests an equal or newer safe range. |
| `deepmerge-ts` `^8.0.2` | Forces WebdriverIO configuration merging onto the reviewed modern implementation. | Remove when every `npm explain deepmerge-ts` path natively requests an equal or newer safe range. |
| `serialize-javascript` `^7.1.0` | Forces the Mocha path used by WebdriverIO off older serialization releases. | Remove when every `npm explain serialize-javascript` path natively requests an equal or newer safe range. |

Remove only one override at a time. For each removal, inspect `npm explain`, run `npm audit --audit-level=high`, then run the full Vitest/build gate and the isolated native E2E suite. If an upstream range still conflicts or the E2E runner regresses, restore the override and record the blocking upstream version.

## Native E2E isolation

`npm run test:e2e:build` compiles with `VITE_WDIO=1`. In that build, provider snapshots, cached snapshots, Codex forecast/token usage, and Volcengine diagnostics/reconnect are synthetic at the frontend bridge. Native window and Quota Float preference commands remain active so the suite can cover real Tauri behavior without reading a developer or CI account's provider credentials. The E2E Tauri identifier is separate from production, and CI runs this suite only in the existing Windows desktop job before rebuilding the production binary.
