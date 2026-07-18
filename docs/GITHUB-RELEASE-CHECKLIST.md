# GitHub 发布清单

## 最省事的发布方式

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

macOS Universal target 会由 GitHub Actions 自动安装，本地 Windows 不需要配置 macOS 工具链。

## 发布后检查

打开 GitHub Releases，确认本次版本包含：

- Windows `.exe` 或 `.msi` 安装包。
- macOS Universal `.dmg`。
- Windows 更新器归档及签名。
- `latest.json`。
- 根据提交自动生成的版本说明。

应用内更新中心会静默检查新版本。Windows 会后台下载签名更新，用户可选择稍后重启安装；macOS 会打开对应的 GitHub Releases 下载页。

## 面向公开用户分发

Tauri 更新包已有项目更新密钥签名，但操作系统信任还需要额外证书：

- Windows 代码签名证书可减少 SmartScreen 提示。
- Apple Developer ID、Team ID、app-specific password 和 notarization 可减少 Gatekeeper 提示。

这些账号、证书和密码需要项目所有者申请或购买，并通过 GitHub Secrets 配置，不能由发布脚本生成。
