# GitHub 发布清单

## 推荐：一条命令在线发布

准备发布的代码通过桌面 fast handoff gate、提交并推送到 `main` 后运行：

```bash
npm run publish:release -- patch --yes
```

命令会检查干净且同步的 `main`、实际 GitHub API 访问、重复 tag 和并发 Release workflow；随后触发一次 `publish=true` 工作流，自动等待，并验证全部 job、Defender、公开状态、六类附件以及远端 refs。它不会暂存或提交业务代码。如已保护 `release` Environment，仍需在第一次远端写入前批准 deployment。

断线后运行 `npm run publish:release -- --resume`，或指定 `--resume RUN_ID --record PATH`，读取保存的仓库/提交/版本/模式记录并继续观察同一次运行。恢复不会创建新版本或重新触发发布；无法确认远端状态时报告未知并保留恢复记录。公开产物自动下载、核对哈希并验证更新签名，报告保存在 `output/release-runs/`。若 main 已前进，恢复会确认发布提交仍是 main 的祖先，并在报告中注明。

可选的只读远端预演为 `npm run publish:release -- patch --dry-run`。正式工作流本身先执行同一验证 gate，因此日常发布不需要先预演再重复正式运行。

没有本地 GitHub CLI 时，也可打开 **Actions → Release → Run workflow**，Branch 选择 `main`、填写版本并将 `publish` 设为 `true`。

`version` 支持 `patch`、`minor`、`major`、`beta`、`stable` 或明确的 `x.y.z[-beta.n]`。工作流会拒绝非 `main` 手动运行、旧版本、重复 tag、没有新增 commit、验证后发生变化的 `main`，以及缺少任一平台产物的发布。

在线流程使用 atomic push 同时提交 release commit/tag；Windows/macOS 并行构建并上传到同一个草稿，Windows Defender 扫描实际待发布文件。单独的 `assemble-updater` 等两平台成功后一次生成清单。Stable 升级测试在 Windows 完成扫描后即可开始，无需等待 macOS；它将上一公开稳定版升级到明确草稿 ID 中的确切 Windows installer，并记录 Release ID、asset ID 与 SHA-256。只有双平台、清单、升级全部通过且公开前再次确认仍为同一资产，才会公开 Release。GitHub API 只向具备 push access 的令牌返回草稿，因此 `upgrade-smoke` job 局部声明 `contents: write`，但脚本本身只执行读取与下载。公开后另有一个非阻断的分发可达性检查。创建 release ref 时不再重复安装 Rust/Linux 桌面依赖或执行第二次 Rust 编译检查。

## 本地发布回退

在干净、已同步远端的 `main` 分支运行：

```bash
npm run release -- patch
```

也可以把 `patch` 换成 `minor`、`major` 或明确版本号，例如 `0.2.0`。

脚本会自动完成：

- 确认当前分支为 `main`，工作区干净且没有落后于 `origin/main`。
- 检查 `package.json`、Cargo 和 Tauri 配置中的版本是否一致。
- 显示从上一个 tag 至今的提交，并在真正修改前要求确认。
- 运行前端测试、前端构建和 Rust 测试。
- 同步所有版本文件并更新 `CHANGELOG.md`。
- 创建 release commit 和带说明的 `v*` tag。
- 推送 `main` 和 tag，由 GitHub Actions 构建 Windows、macOS 和更新器文件。
- 自动生成 release notes，并直接发布 GitHub Release。

首次使用或想先确认流程时，运行只读预演：

```bash
npm run release -- patch --dry-run
```

如需只在本地生成 commit 和 tag、暂不上传：

```bash
npm run release -- patch --no-push
```

## 发布前只需确认

- Git、符合 `.node-version` / `package.json` 的 Node.js、Rust stable 和 npm 依赖可用。
- GitHub Actions 已启用。
- 仓库 Secrets 已配置 `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- 准备发布的代码已经合入并推送到 `main`。
- `release` Environment 已创建；建议配置 required reviewer，并确认 Actions bot 可按仓库保护策略写入 release commit/tag。

macOS Universal target 会由 GitHub Actions 自动安装，本地 Windows 不需要配置 macOS 工具链。

## 发布后检查

打开 GitHub Releases，确认本次版本包含：

- Windows `.exe` 或 `.msi` 安装包。
- macOS Universal `.dmg`。
- Windows 安装/更新器及 `.sig`。
- macOS updater archive 及 `.sig`。
- `latest.json`。
- 根据提交自动生成的版本说明。
- `verify`、共享草稿、`publish-windows`（含 Defender）、`publish-macos`、`assemble-updater`、Stable 草稿 `upgrade-smoke` 和 `finalize` job 均成功；可选的 `post-release-distribution` 结果也应人工复核。
- Release 不是 draft；Beta tag 应为 prerelease，Stable tag 不应为 prerelease。

每次发布应在项目内保存一份简短 evidence record，记录 release/tag/commit、工作流链接、产物清单、自动化结果以及仍待完成的手动平台验证。格式可参考 [RELEASE-0.2.24.md](RELEASE-0.2.24.md)。

应用内更新中心会静默检查新版本。Windows 会后台下载签名更新，用户可选择稍后重启安装；macOS 会打开对应的 GitHub Releases 下载页。

## 面向公开用户分发

Tauri 更新包已有项目更新密钥签名，但操作系统信任还需要额外证书：

- Windows 代码签名证书可减少 SmartScreen 提示。
- Apple Developer ID、Team ID、app-specific password 和 notarization 可减少 Gatekeeper 提示。

这些账号、证书和密码需要项目所有者申请或购买，并通过 GitHub Secrets 配置，不能由发布脚本生成。
