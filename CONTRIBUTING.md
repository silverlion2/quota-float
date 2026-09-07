# Contributing

Thanks for helping improve Quota Float.

## Before Opening Issues

Do not paste tokens, account IDs, raw backend responses, local auth paths, or screenshots containing personal data.

## Development

Use Node.js 24.14.0 LTS from `.node-version` with npm 11.9.0 when possible. Supported runtimes are Node 22.18+ on the 22.x line or Node 24.x, with npm 10-11; Node 23 is intentionally excluded. The Node 22 lower bound keeps Vite's `--configLoader native` path on a runtime where built-in TypeScript type stripping is enabled by default. See [the dependency and toolchain policy](docs/DEPENDENCY-POLICY.md) before changing build, test, Tauri, or overridden transitive dependencies.

```bash
npm install
npm run test
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
```

Use `npm run tauri dev` for desktop testing. Browser preview uses mock data and cannot verify real quota reads.

## Pull Requests

- Keep changes small and focused.
- Preserve the privacy boundary documented in `PRIVACY.md`.
- Do not add telemetry or raw response logging.
- Add or update tests when changing quota parsing, snapshot merging, or formatting.
