# GitHub 发布清单

## 推荐：GitHub Actions 在线发布

打开 **Actions → Release → Run workflow**，Branch 选择 `main`：

1. 先填写 `version` 并保持 `publish=false`，运行云端 dry run。
2. 检查变更列表、版本目标、前端/Rust 测试与生产构建。
3. 再次运行相同版本输入并设置 `publish=true`。
4. 如已保护 `release` Environment，在第一次远端写入前批准 deployment。

`version` 支持 `patch`、`minor`、`major`、`beta`、`stable` 或明确的 `x.y.z[-beta.n]`。工作流会拒绝非 `main` 手动运行、旧版本、重复 tag、没有新增 commit、验证后发生变化的 `main`，以及缺少任一平台产物的发布。

在线流程使用 atomic push 同时提交 release commit/tag；Windows/macOS 各构建一次，先上传为 draft，Windows Defender 扫描实际待发布文件，所有附件齐全后才公开 Release。Stable 版本随后运行升级烟测。

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

- Git、Node.js 20+、Rust stable 和 npm 依赖可用。
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
- `verify`、Defender 预检、全部平台 `publish` 和 `upgrade-smoke` job 均成功。
- Release 不是 draft；Beta tag 应为 prerelease，Stable tag 不应为 prerelease。

每次发布应在项目内保存一份简短 evidence record，记录 release/tag/commit、工作流链接、产物清单、自动化结果以及仍待完成的手动平台验证。格式可参考 [RELEASE-0.2.20.md](RELEASE-0.2.20.md)。

应用内更新中心会静默检查新版本。Windows 会后台下载签名更新，用户可选择稍后重启安装；macOS 会打开对应的 GitHub Releases 下载页。

## 面向公开用户分发

Tauri 更新包已有项目更新密钥签名，但操作系统信任还需要额外证书：

- Windows 代码签名证书可减少 SmartScreen 提示。
- Apple Developer ID、Team ID、app-specific password 和 notarization 可减少 Gatekeeper 提示。

这些账号、证书和密码需要项目所有者申请或购买，并通过 GitHub Secrets 配置，不能由发布脚本生成。
