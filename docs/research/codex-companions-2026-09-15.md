# Codex companion / MCP / Skills 项目调研

调研日期：2026-09-15。星标与更新时间是该日读取 GitHub REST `GET /repos/{owner}/{repo}` 的 UTC 快照；星标会继续变化。未安装或运行第三方项目。

## 推荐纳入 Companion Catalog 的项目

| 仓库 | GitHub 快照 | 一句话能力 | MCP / Skills / 插件机制 | 支持限制与风险 |
| --- | --- | --- | --- | --- |
| [farion1231/cc-switch](https://github.com/farion1231/cc-switch) | 132,817 stars；更新 2026-09-14；MIT | 跨平台 Tauri 桌面 All-in-One 管理 Claude Code、Codex、OpenCode、OpenClaw、Grok Build、Hermes | 统一管理 MCP 与 Skills，支持 GitHub/ZIP 安装、symlink/copy、跨客户端同步；托盘快速切换；带用量看板 | 功能含 provider 配置、账号/密钥导入、代理和云同步，写入边界比 Quota Float 大；README 含大量 relay 赞助商内容，网络和服务条款风险需单独审计；适合只读 catalog 元数据参考 |
| [openai/skills](https://github.com/openai/skills) | 27,165 stars；更新 2026-09-14；GitHub license 字段为空 | OpenAI 的 Codex skills catalog，提供 `.system`、`.curated`、`.experimental` 技能目录和 `$skill-installer` 使用路径 | 技能是包含指令、脚本、资源的文件夹；单个 skill 的许可证放在其目录 `LICENSE.txt`；README 明确该仓库已 deprecated，当前插件示例转移到 OpenAI Plugins | 不能把仓库根目录当成统一许可证；安装 skill 后需重启 Codex；Quota Float 应只解析目录/manifest、许可证与来源，不自动安装或执行 |
| [ccusage/ccusage](https://github.com/ccusage/ccusage) | 18,548 stars；更新 2026-09-14；GitHub license 字段 `NOASSERTION` | TypeScript/Node CLI，从本地 agent 数据生成 daily/weekly/monthly/session token 与成本报告，覆盖 Codex、Claude、OpenCode、Copilot、Gemini 等 | 仓库含 `.agents/skills`；命令按来源分组，如 `ccusage codex daily`，也有全来源汇总、blocks、statusline | GitHub 未声明可确认的仓库许可证，不能在 Quota Float 中复用代码；主要是本地日志分析，不能替代 provider live quota；日志可能含敏感上下文，须限定路径、脱敏和保留期 |
| [Dimillian/CodexMonitor](https://github.com/Dimillian/CodexMonitor) | 4,301 stars；更新 2026-09-14；MIT | Tauri + React 的 Codex command center：多 workspace、threads、reviews、worktrees、审批、历史与 dashboard | 通过 Codex app-server stdio；有 workspace/thread 控制、`skills_list`、`apps_list`、`list_mcp_server_status` 等 surface；支持 macOS、Windows、Linux | 不只是监控器：可启动线程、发送消息、终端、文件/Git 写操作，还可连接远端 daemon；Quota Float 可借鉴 workspace/health 只读视图，不能默认暴露 action surface |
| [borawong/AiMaMi](https://github.com/borawong/AiMaMi) | 1,505 stars；更新 2026-09-14；Apache-2.0 | Tauri 2 + React + Rust Codex 桌面伴侣，集中管理账号、quota、sessions、router/relay、插件与系统维护 | UI 管理 MCP/Skills 生命周期并支持备份恢复；插件开关；维护 `~/.codex/AGENTS.md` 受控区块；托盘和 macOS notch quota | 会读写 `~/.codex`，支持自动切换、Codex 重启和本地 relay；第三方 relay 可能看到请求；只吸收其备份预览、配置漂移诊断和只读健康检查思想 |
| [steipete/CodexBar](https://github.com/steipete/CodexBar) | 21,375 stars；更新 2026-09-14；MIT | 高星 macOS 菜单栏配额监控；多 provider reset、status、cost/history、CLI、Widget 和 Stream Deck | 内置 `codexbar serve` 为 SketchyBar/tmux/Zellij/Stream Deck 提供本地 gauge；含 `.agents/skills`；复用已有 OAuth/本地状态 | 主要面向 macOS 14+；provider 与浏览器 cookie/内部接口会变；可借鉴“数据核心 + 多个只读输出”，不复制其可选 cookie/网络路径 |

## 设计建议

最终应用目录采用 CC Switch、CodexBar、ccusage、OpenAI Plugins、CodexMonitor、AiMaMi 六项。复核 [OpenAI Plugins](https://github.com/openai/plugins) 官方 README 与 GitHub API：2026-09-15 为 **6,680 stars**，根仓库未声明统一许可证；每个插件使用 `.codex-plugin/plugin.json`，可包含 Skills、MCP 和应用连接。应用因此链接这个当前目录，保留上表 deprecated 的 `openai/skills` 仅作历史研究。星数不是安全评级，应用不下载或运行目录中的代码。

1. **只读 Companion Catalog。** 扫描本机已存在的 Codex plugin/skill/MCP 目录，展示名称、版本、来源、scope、最近修改、许可证和风险标签；不安装、不启用、不执行脚本。
2. **摘要优先、按需详情。** 参考 OpenAI skills 与 ccusage 的目录结构：先列名称/描述，用户显式展开才读取有限的 `SKILL.md`、`LICENSE.txt` 或 manifest；MCP 描述只能作为元数据，不能当作指令。
3. **稳定只读 JSON。** 参考 CodexBar 的 `serve` 和 ccusage 的报表，提供 `provider/window/remaining/reset_at/freshness/source_kind`；不得接收凭据或执行 provider action。
4. **区分事实与本地估计。** CodexMonitor/CodexBar 的实时 provider 状态属于事实；ccusage 的 token/成本、burn-rate 和趋势属于本地观察或估计，不能覆盖 provider reset。
5. **保持 Quota Float 边界。** provider credential 访问继续仅在 `src-tauri`、只读、按 provider 隔离；前端只收到脱敏快照。不要引入 cc-switch/AiMaMi 的自动切换、relay、云同步，或 CodexMonitor 的默认写操作。

## AITracker 名称核对

此前提到的 [j0nl1/aitracker](https://github.com/j0nl1/aitracker) 确实是一个 7-star Rust 终端工具，但其 README 描述的是 CLI usage/rate-limit/token-cost 扫描，并不能证明它就是用户截图中的“AITracker”。截图显示的 macOS/Windows 中文桌面 UI、安全扫描、内存热力图产品目前无法从公开资料精确识别；不要据此把任一仓库宣称为截图来源。无关的 [AIRLegend/aitrack](https://github.com/AIRLegend/aitrack) 是 6DoF 头部跟踪软件。

## 许可证与来源备注

- `cc-switch`、`Dimillian/CodexMonitor`、`borawong/AiMaMi`、`steipete/CodexBar` 的许可证由 GitHub API/仓库 LICENSE 元数据确认。
- `ccusage/ccusage` 的 GitHub API license 为 `NOASSERTION`，本报告不推断其许可证。
- `openai/skills` 根仓库 license 字段为空，README 要求到各 skill 目录检查 `LICENSE.txt`；不要把 Apache/MIT 等许可证泛化到整个仓库。
- 功能描述来自各仓库 README：[CC Switch](https://github.com/farion1231/cc-switch#readme)、[OpenAI Skills](https://github.com/openai/skills#readme)、[ccusage](https://github.com/ccusage/ccusage#readme)、[CodexMonitor](https://github.com/Dimillian/CodexMonitor#readme)、[AiMaMi](https://github.com/borawong/AiMaMi#readme)、[CodexBar](https://github.com/steipete/CodexBar#readme)。
