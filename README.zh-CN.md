<p align="center">
  <img src="assets/icon.svg" width="96" alt="Quota Float 应用图标">
</p>

<h1 align="center">Quota Float — AI 编程助手额度监控悬浮窗</h1>

<p align="center">
  在桌面上集中查看 Codex、Claude、Qoder、TRAE、WorkBuddy、火山方舟 Coding Plan 和 Google Antigravity 的剩余额度、重置时间与使用节奏。
</p>

<p align="center">
  <a href="https://github.com/silverlion2/quota-float/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/silverlion2/quota-float?display_name=tag&sort=semver"></a>
  <a href="https://github.com/silverlion2/quota-float/releases"><img alt="累计下载" src="https://img.shields.io/github/downloads/silverlion2/quota-float/total"></a>
  <a href="https://github.com/silverlion2/quota-float/actions/workflows/ci.yml"><img alt="构建状态" src="https://github.com/silverlion2/quota-float/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT 许可证" src="https://img.shields.io/github/license/silverlion2/quota-float"></a>
  <img alt="支持 Windows 和 macOS" src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-2878c7">
</p>

<p align="center">
  <strong><a href="https://github.com/silverlion2/quota-float/releases/latest">下载 Windows / macOS 版本</a></strong>
  · <a href="README.md">English</a>
  · <a href="https://github.com/silverlion2/quota-float/issues">反馈问题</a>
</p>

![Quota Float 展示健康、提醒和紧张三种 AI 编程助手额度状态](docs/images/quota-states.png)

Quota Float 是一款适用于 Windows 和 macOS 的轻量、置顶、**本地优先 AI 编程助手额度监控工具**。它只读复用本机已有应用或 CLI 的登录状态，显示真实额度窗口、剩余量、重置时间和每日使用节奏，不需要手动粘贴密钥。

## 为什么用 Quota Float？

- **多个平台，一处查看：** 同时监控 Codex、Claude、Qoder、TRAE、WorkBuddy、火山方舟 Coding Plan 和 Google Antigravity。
- **提前发现额度压力：** 提供健康/提醒/紧张状态、使用节奏建议、重置时间、通过新鲜度门槛的多源全局重置展望和可配置桌面提醒。
- **随用随看，不打扰工作：** 可使用悬浮球、圆环或磁吸 Bar；Bar 可贴合工作区顶部、左侧或右侧，悬停时向屏幕内展开，并在重启或显示器变化后保持相对位置。
- **异常时信息不丢失：** 自动重试临时故障，并保留且明确标记上次成功数据。
- **隐私边界清晰：** 无遥测、无分析、无第三方追踪，不读取提示词和聊天记录，不修改账号设置。
- **原生桌面体验：** 基于 Tauri、Rust、React 和 TypeScript，支持应用内更新及 Stable/Beta 通道。

## 支持的平台

| 平台 | 数据来源 | 使用条件 |
| --- | --- | --- |
| OpenAI Codex | 本机已有 Codex 登录状态 | Codex Desktop 或 Codex CLI 已登录 |
| Anthropic Claude | 本机已有 Claude Code OAuth 登录状态 | Claude Code 已登录 |
| Qoder | 本地账号缓存 | Qoder 已安装并登录 |
| TRAE | 本机已有 TRAE 登录状态 | TRAE 已安装并登录 |
| WorkBuddy | 本机已有 WorkBuddy 登录状态 | WorkBuddy 已安装并登录 |
| Google Antigravity | 本机受 CSRF 保护的语言服务器额度状态 | Antigravity 已安装、打开并登录 |
| 火山方舟 Coding Plan | 已认证的 `arkcli usage plan` 输出 | Ark CLI 已安装并登录 |

所有数据源都以只读方式使用。如果平台响应结构变化或登录过期，应用会显示“不可用”或“数据已过期”，不会猜测额度。

## 下载与安装

前往 **[GitHub Releases](https://github.com/silverlion2/quota-float/releases/latest)** 下载最新版：

- **Windows：** 下载每用户安装包 `x64-setup.exe`，无需管理员权限。
- **macOS：** 下载 Universal `.dmg`，同时支持 Apple 芯片和 Intel Mac。

应用更新包带有项目的 Tauri 更新签名。Windows Authenticode 与 macOS 公证需要独立证书，因此未完成平台签名的构建仍可能触发 SmartScreen 或 Gatekeeper 提示。

## 主要功能

- 显示额度窗口、精确剩余量、无限计划状态，以及服务可用时的重置次数与过期时间。
- 每日额度节奏建议、阈值提醒、免打扰时段和通知冷却时间。
- 按平台独立调度的自适应刷新、低干扰的“项目专注模式”，以及可暂停不需要平台的监控开关。
- 悬浮球、保持展开、窗口置顶、平台轮播、拖拽排序和本地化托盘菜单。
- 本地额度时间线，记录重置、低额度、平台异常、恢复和更新事件，并保留 90 天详细用量记忆与 365 天每日汇总。
- Vibe Usage 洞察页支持增量索引本地 Codex 用量、模型/项目/终端筛选、会话与活跃度指标、趋势图、分时热力图和分模型 API 等价费用预估。
- 可配置月度 API 等价预算与本地提醒，并可导出匿名化 CSV/JSON、SVG 分享卡片和带版本的价格目录。
- 自定义主题色、平台隐藏/精简显示、布局方案和开机自启。
- Float/Ring/Bar 三种紧凑布局与 Dashboard/Provider bar/Stacked 三种展开布局；颜色可选极光、石墨或纸面，并支持跟随系统/浅色/深色外观。
- 七个平台可通过完整 Logo 目录快速切换，支持横向/纵向布局和方向键、Home/End 键盘导航；平台管理集中在控制中心独立页签。
- 磁吸 Bar 顶部尺寸为 `400×38`，左右侧轨为 `64×320`；额度文字保持正向，向屏幕内展开，并保存归一化沿边位置。
- 更新前自动创建轮换恢复点；设置、布局和历史记录可单文件导入导出。
- 可复制的脱敏诊断报告，不包含令牌、账号 ID、本地认证路径或原始响应。
- 平台状态中心集中显示每个本地数据源、刷新时间、恢复状态和有限历史采样数。
- 自动更新、Stable/Beta 版本发现和便捷重启。

## 界面预览

| 悬浮球 | 重置次数过期时间 | 周额度降级视图 |
| --- | --- | --- |
| ![Quota Float 折叠悬浮球](docs/images/quota-orb.png) | ![额度重置次数过期时间弹窗](docs/images/quota-reset-expiration.png) | ![Codex 周额度降级视图](docs/images/quota-v0.1.4-weekly-fallback.png) |

## 隐私与安全

Quota Float 只会把各平台已有令牌发送到该平台自己的额度服务；Claude 凭据保持只读，火山方舟访问保持在 Ark CLI 内，Antigravity 通过本机回环额度服务读取。应用仅保存自身偏好、有限数量的额度采样、事件摘要、布局方案、恢复点，以及脱敏后的 Codex 增量用量索引。

可选的 Codex 全局重置展望会读取三个公开、无需认证的追踪端点，不发送平台凭据、账号信息、个人额度值或本地 Token 计数。应用拒绝过期数据，取新鲜预测的中位数，并公开来源数与置信度；只有新鲜定时公告或多源印证结果可以影响规划，个人平台重置时间始终优先。

应用**不会**保存平台令牌、账号 ID、提示词、聊天记录、原始额度响应或本地认证路径，也不会兑换重置次数或修改账号设置。完整边界请阅读[隐私说明](PRIVACY.md)和[安全说明](SECURITY.md)。

## 常见问题

### 如何查看 Codex 剩余额度？

在已经登录 Codex Desktop 或 Codex CLI 的同一台电脑上安装 Quota Float。应用会读取现有本地会话，并显示可用的 Codex 额度窗口和重置时间。

### 是否根据本地 Token 数推算额度？

不会。额度仍来自平台返回数据或受支持的本地账号缓存。洞察页会单独汇总 Codex 已写入本地的数值型 `token_count` 元数据，但不会用这些计数编造缺失额度。

### 预估费用就是我的 Codex 账单吗？

不是。它只是按内置的 OpenAI 官方标准 Token 价格快照计算出的 API 等价费用。Codex 订阅、API 实际账单、工具调用费、区域处理和特殊服务等级都可能不同。

### 是否需要填写 API Key 或复制 Token？

不需要。应用以只读方式复用受支持的本机登录状态。请勿在 Issue 或诊断信息中粘贴任何令牌。

### 能否同时监控多个 AI 编程助手？

可以。所有检测到的平台都会出现在同一个悬浮窗中，并支持排序、隐藏、精简显示或自动轮播。

### 浏览器预览会显示我的真实额度吗？

不会。`npm run dev` 使用合成数据；真实额度读取需要 Tauri 桌面应用和本机已有的受支持登录态。

## 本地开发

需要 Node.js 20+、Rust stable，以及当前平台的 [Tauri 2 系统依赖](https://v2.tauri.app/start/prerequisites/)。

```bash
npm install
npm run test
npm run build
npm run tauri dev
```

浏览器模式使用模拟数据；真实额度只能在 Tauri 桌面应用中读取。构建安装包请运行 `npm run tauri build`。

维护者可从最新的 [v0.3.2 发布记录](docs/RELEASE-0.3.2.md)、[项目简介](docs/PROJECT-SUMMARY.md)、[架构与目录职责](docs/ARCHITECTURE.md)、[路线图](docs/ROADMAP.md)和[桌面开发 SOP](docs/DESKTOP-DEVELOPMENT-SOP.md)开始。

## 参与贡献

欢迎提交 Bug、兼容性报告、功能建议和 Pull Request。开始前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，上传截图或日志前务必移除个人信息。

## 开源许可

Quota Float 使用 [MIT License](LICENSE)。
