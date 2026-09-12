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
- **随用随看，不打扰工作：** 可使用悬浮球、圆环、磁吸 Bar 或风险排序的瓶颈栏；Bar 与瓶颈栏可贴合工作区顶部、左侧或右侧，悬停时向屏幕内展开，并在重启或显示器变化后保持相对位置。
- **异常时信息不丢失：** 自动重试临时故障，并保留且明确标记上次成功数据。
- **交互反馈完整：** 弹窗统一管理焦点和操作反馈；鼠标重新进入已展开面板时保持内容高度。
- **隐私边界清晰：** 无遥测、无分析、无第三方追踪，不读取提示词和聊天记录，不修改账号设置。
- **原生桌面体验：** 基于 Tauri、Rust、React 和 TypeScript，支持应用内更新及 Stable/Beta 通道。

## 支持的平台

| 平台 | Windows 源码支持 | macOS 源码支持 | 只读来源与使用条件 |
| --- | --- | --- | --- |
| OpenAI Codex | 支持 | 支持 | 本机已有 Codex 登录状态；Codex Desktop 或 CLI 已登录 |
| Anthropic Claude | 支持 | 支持 | Claude Code OAuth 文件或 macOS 钥匙串登录状态；Claude Code 已登录 |
| Qoder | 支持 | 未实现 | Windows DPAPI 保护的本地账号缓存；Qoder 已登录 |
| TRAE | 支持 | 未实现 | Windows 本地登录状态与 entitlement 服务；TRAE 已登录 |
| WorkBuddy | 支持 | 未实现 | Windows 本地登录状态与额度服务；WorkBuddy 已登录 |
| 火山方舟 Coding Plan | 支持 | 支持 | 已认证的 `arkcli usage plan` 输出；Ark CLI 已安装并登录 |
| Google Antigravity | 支持 | 支持 | 本机受 CSRF 保护的语言服务器额度状态；Antigravity 已打开并登录 |

此矩阵描述当前源码会编译的适配器，不代表每个平台都刚在两个系统上使用真实账号验证。所有数据源都以只读方式使用；如果响应结构变化或登录过期，应用会显示“不可用”或“数据已过期”，不会猜测额度。

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
- 本地额度时间线记录重置、低额度、平台异常、恢复和更新事件；近 90 天保留完整采样，更早记录按日保留端点与极值，总容量上限为 120,000 条额度采样和 100,000 条日汇总。
- Vibe Usage 洞察页会增量索引本机仍保留的全部 Codex 会话元数据，支持模型/项目/终端筛选、默认 24 小时或完整历史趋势、会话与活跃度指标、分时热力图和分模型 API 等价费用预估。
- 可配置 API 等价月度展望：按当前所选区间外推，并与本月截至目前的已保留费用分开显示；本地提醒只在打开 Codex 洞察时检查。支持按需生成应用当前筛选条件的本周/本月本地报告，区分已有记录和确认触发扫描上限的情况；同名项目按不透明身份分别统计，CSV/JSON 导出使用匿名别名并排除该身份。另可导出 SVG 分享卡片和带版本的价格目录。
- 自定义主题色、平台隐藏/精简显示、布局方案和开机自启。
- Float/Ring/Bar/Bottleneck 四种紧凑布局与 Dashboard/Cockpit/Provider bar/Stacked 四种展开布局；瓶颈栏按风险排列每个平台最紧张的额度周期。驾驶舱把额度环、近期趋势、节奏计划与 90 天热力图聚合到一屏，每个区块都可原位放大或拆成独立置顶窗口。
- 紧凑 Bar 的平台 Logo 区只负责切换 Agent，指标区停留后才向内展开；任一展开布局只保留一套平台导航。
- 驾驶舱独立窗只读原生快照缓存与有限本地历史，不通过 URL 传递额度负载，也不会接收凭据或提示词。
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

Quota Float 只会把各平台已有令牌发送到该平台自己的额度服务；Claude 凭据保持只读，火山方舟访问保持在 Ark CLI 内，Antigravity 通过本机回环额度服务读取。应用仅保存自身偏好、经过有界压缩的额度历史、事件摘要、布局方案、恢复点，以及脱敏后的 Codex 增量用量索引。

可选的 Codex 全局重置展望会读取三个公开、无需认证的追踪端点，不发送平台凭据、账号信息、个人额度值或本地 Token 计数。应用拒绝过期数据，将公开信号及其来源信息与个人重置时间分开显示。第三方信号不是经过校准的概率，也不代表已核验的官方公告；每日额度规划始终依据平台返回的个人重置时间。

应用**不会**保存平台令牌、账号 ID、提示词、聊天记录、原始额度响应或本地认证路径，也不会兑换重置次数或修改账号设置。完整边界请阅读[隐私说明](PRIVACY.md)和[安全说明](SECURITY.md)。

## 常见问题

### 如何查看 Codex 剩余额度？

在已经登录 Codex Desktop 或 Codex CLI 的同一台电脑上安装 Quota Float。应用会读取现有本地会话，并显示可用的 Codex 额度窗口和重置时间。

### 是否根据本地 Token 数推算额度？

不会。额度仍来自平台返回数据或受支持的本地账号缓存。洞察页会单独汇总 Codex 已写入本地的数值型 `token_count` 元数据，但不会用这些计数编造缺失额度。

### 预估费用就是我的 Codex 账单吗？

不是。它只是按内置的 OpenAI 官方 Standard Token 价格快照计算出的 API 等价费用。所有选中用量（包括保留的历史记录）都会按当前内置目录版本统一重估；Quota Float 不会推断过去请求发生时实际生效的价格。Codex 订阅、API 实际账单、工具调用费、区域处理和特殊服务等级都可能不同。

### 是否需要填写 API Key 或复制 Token？

不需要。应用以只读方式复用受支持的本机登录状态。请勿在 Issue 或诊断信息中粘贴任何令牌。

### 能否同时监控多个 AI 编程助手？

可以。所有检测到的平台都会出现在同一个悬浮窗中，并支持排序、隐藏、精简显示或自动轮播。

### 浏览器预览会显示我的真实额度吗？

不会。`npm run dev` 使用合成数据；真实额度读取需要 Tauri 桌面应用和本机已有的受支持登录态。

## 本地开发

需要 Node.js 24.14.0（仓库 `.node-version` 默认版本；也支持 22.x 中的 22.18 及以上版本、24.x）、npm 10 或 11、Rust stable，以及当前平台的 [Tauri 2 系统依赖](https://v2.tauri.app/start/prerequisites/)。原生 TypeScript 配置加载器依赖 Node 内置的类型剥离能力，详见[依赖与工具链策略](docs/DEPENDENCY-POLICY.md)。

```bash
npm install
npm run test
npm run build
npm run tauri dev
```

浏览器模式使用模拟数据；真实额度只能在 Tauri 桌面应用中读取。构建安装包请运行 `npm run tauri build`。

源码版本由 `package.json` 声明并与原生包元数据同步校验。当前审查、验证及发布状态见 [2026-09-12 交互与原生窗口修正记录](docs/SESSION-2026-09-12.md)。源码支持和自动化测试不等于所有平台都已完成实机验收。

维护者可从 [系统审查与任务归档](docs/REVIEW-2026-09-09.md)、[项目简介](docs/PROJECT-SUMMARY.md)、[架构与目录职责](docs/ARCHITECTURE.md)、[路线图](docs/ROADMAP.md)和[桌面开发 SOP](docs/DESKTOP-DEVELOPMENT-SOP.md)开始。

## 参与贡献

欢迎提交 Bug、兼容性报告、功能建议和 Pull Request。开始前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，上传截图或日志前务必移除个人信息。

## 开源许可

Quota Float 使用 [MIT License](LICENSE)。
