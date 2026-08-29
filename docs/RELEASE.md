# 发布说明

## 当前发布目标

Quota Float 使用同一套 React/CSS/Tauri 代码构建 Windows 和 macOS 版本。视觉效果、悬浮球、展开卡片、透明度、圆角和动画参数都应保持在共享前端代码中，避免维护 Windows/macOS 两套 UI。

当前发布输出公开安装包和带 Tauri updater 签名的更新产物：

- Windows x64 NSIS `*-setup.exe` 及其 `.sig`。
- macOS Universal `.dmg`、`.app.tar.gz` 及其 `.sig`。
- Stable 更新清单 `latest.json`。

macOS 包使用 Universal 构建，同时支持 Apple Silicon 和 Intel Mac。Tauri updater 签名不等同于 Windows Authenticode 或 macOS Developer ID/notarization；未补齐操作系统信任证书时仍可能出现 SmartScreen 或 Gatekeeper 提示。

## 发布一个 GitHub 下载版本

### 在线一键发布（推荐）

在 GitHub 仓库打开 **Actions → Release → Run workflow**：

1. Branch 选择 `main`。
2. `version` 填写 `patch`、`minor`、`major`、`beta`、`stable` 或明确的 `x.y.z[-beta.n]`。
3. 保持 `publish=false` 时只在线执行只读 dry run、测试和构建，不创建 commit、tag 或 Release。
4. 确认验证结果后重新运行并设置 `publish=true`；如果 `release` Environment 配置了 required reviewer，工作流会在第一次远端写入前等待批准。

正式在线发布会在同一工作流中完成：

- 验证 `main`、版本、变更列表、前端测试/构建和 Rust 测试。
- 确认验证后 `main` 未变化，再创建 release commit 与 tag，并通过一次 atomic push 同时写入远端。
- Windows/macOS 并行构建草稿产物；Windows Defender 扫描实际待发布的 Windows executable 与 installer，不重复编译预检包。
- 检查 `latest.json`、Windows installer/签名、macOS DMG/updater archive/签名齐全后，才将草稿 Release 转为公开。
- Stable 版本公开后执行 Windows previous-to-current upgrade smoke。

同一时间只允许一个 Release workflow 运行。GitHub Actions 使用默认 `GITHUB_TOKEN` 创建的 commit/tag 不依赖第二条 tag workflow 被触发，后续构建和发布都在当前 workflow 内继续。

### 本地发布回退

需要从本地发布时，仍可在干净且已同步的 `main` 上使用发布脚本：

```bash
npm run release -- patch --dry-run
npm run release -- patch
```

脚本会校验版本、测试并构建，随后创建 release commit 与 `v*` tag，并在获得授权后推送 `main` 和 tag。外部推送的 tag 仍兼容 `.github/workflows/release.yml`；它会验证 tag/版本、构建 Windows/macOS 草稿产物、执行 Defender 扫描、检查附件完整性、公开 Release，并运行 Stable 升级烟测。

工作流完成后必须检查公开 Release、完整产物和所有 job 的最终结论。当前流程及授权边界见 [GITHUB-RELEASE-CHECKLIST.md](GITHUB-RELEASE-CHECKLIST.md)；最近一次完整证据见 [RELEASE-0.3.5.md](RELEASE-0.3.5.md)。

### GitHub 配置

- Repository Secrets：`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- Repository Settings → Environments：创建或打开 `release`，建议配置 required reviewer；该审批发生在在线流程创建 release commit/tag 之前。
- Actions 必须允许 workflow 使用 `contents: write`；工作流默认仅有只读权限，只有创建 release ref、上传/公开 Release 的 job 会提升权限。
- 如果 `main` 的 branch protection 禁止 GitHub Actions bot 直接推送，在线发布会安全失败且 atomic push 不会只留下 commit 或 tag；此时需要明确允许该 workflow，或继续使用本地发布回退。

## CI 与构建

`.github/workflows/ci.yml` 会在 push/PR 时执行：

- 前端测试、前端构建、npm audit。
- Windows 桌面测试和 Tauri build。
- macOS 桌面测试和 Tauri Universal build。

macOS CI/release 会显式安装：

- `aarch64-apple-darwin`
- `x86_64-apple-darwin`

并使用：

```bash
npm run tauri -- build --target universal-apple-darwin
```

## macOS 未公证包使用说明

因为当前 macOS 包未签名、未公证，首次打开时 Gatekeeper 可能会阻止启动。小范围测试用户可以使用以下方式打开：

1. 下载并打开 Universal `.dmg`。
2. 将应用移动到 Applications。
3. 如果首次启动被阻止，右键点击应用并选择 Open。
4. 在系统提示中再次选择 Open。

如果系统仍然阻止，可以在 System Settings -> Privacy & Security 中允许打开该应用。

## 签名与公证

## 自动更新签名密钥：必须备份

自动更新依赖 Tauri 更新签名密钥：私钥用于在发布时签名安装包与 `latest.json`，公钥内置在应用中用于验证更新未被篡改。

- 私钥文件 `.tauri-updater.key` 必须存放在安全的加密备份或密码管理器中，且绝不能提交到 Git、上传到 Release 附件、发送到聊天或公开粘贴。
- GitHub Actions 只通过仓库 Secret `TAURI_SIGNING_PRIVATE_KEY` 读取私钥；无需将私钥写入任何源码或配置文件。
- 丢失私钥不会泄露用户的 Codex 数据，但会使已经发布的应用无法信任由新密钥签名的自动更新；届时需要让用户手动安装一次新版。

带 Tauri updater 签名的包可以验证应用更新完整性，但公开分发仍建议补齐操作系统代码签名与公证：

- Windows：代码签名证书，避免 SmartScreen 或未知发布者提示。
- macOS：Apple Developer ID Application 证书、Team ID、app-specific password，并完成 notarization。
- CI：将证书、密码和 Team ID 放入 GitHub Secrets，再在 release workflow 中加入签名和公证步骤。

证书和账号凭据不能由代码仓库生成，需要由项目所有者购买、申请或配置。

## 跨平台维护原则

- 后续效果调整默认只改共享前端代码。
- 平台差异只放在桌面壳层，例如托盘、置顶、拖动、点击穿透、开机启动。
- 不默认启用原生窗口级 Acrylic/Vibrancy；它会作用于整个窗口矩形，不符合只让圆角悬浮球卡片产生毛玻璃效果的设计目标。
- Codex 登录态读取继续使用 `CODEX_HOME` 或用户目录 `.codex/auth.json`，Windows/macOS 共用同一逻辑。
