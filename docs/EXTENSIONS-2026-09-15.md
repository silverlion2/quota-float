# Codex 扩展与伴侣中心

## 本轮成果

Quota Float 控制中心新增「扩展」页：按 MCP、Skills、Plugins 分类，只读显示名称、来源和显式启用配置，支持名称筛选及手动重新扫描。读取失败时保留本次打开面板内的已有清单；缺失来源、部分来源和达到扫描上限分别说明，不把发现或配置启用等同于运行正常。

内置 CC Switch、CodexBar、ccusage、OpenAI Plugins、CodexMonitor、AiMaMi 六个 GitHub 入口。星数为 2026-09-15 快照，完整能力/许可证/边界见 [研究归档](research/codex-companions-2026-09-15.md)。AiMaMi 与用户截图中的仓库一致；AITracker 尚无法准确识别。没有复制或安装任何第三方实现。

## 数据与行为边界

- 原生 Rust 按需扫描用户级 Codex 配置及支持的技能目录；前端只收到经过限界、净化的名称、类别、来源枚举和显式 enabled 值。
- 不读取 SKILL.md 正文，不执行 MCP、脚本或插件，不改变 Codex 配置、账号和 provider 凭据。没有扩展网络请求。
- 清单是配置/目录发现，不包含项目级覆盖、插件缓存内技能或插件运行状态。没有承诺安装/停用/升级插件的执行能力。
- 原生命令限定主 widget 窗口。浏览器和 Windows E2E 都使用固定合成数据，避免测试触碰真实用户配置。
- GitHub opener 权限仅新增六个精确仓库 URL；不接受来自本地配置的动态网址。
- 清单不写入持久化状态、备份或日志；关闭面板即销毁。回退旧版无需迁移应用状态。

配置结构依据 [Codex 官方 config schema](https://github.com/openai/codex/blob/main/codex-rs/core/config.schema.json)：`plugins` 是按插件名索引的用户级配置表，`mcp_servers` 是 MCP 配置表。仅投影显式布尔 `enabled`，缺省时显示「已发现」，不推断是否实际加载。配置文件上限 256 KiB，每类配置上限 128 项，扫描目录每层上限 512 项，最终清单上限 256 项，名称上限 96 字符。拒绝已检测到的源目录/文件链接与 Windows reparse points；扫描是按需文件观察，不是文件系统原子快照。

## 性能与验证

保留现有包体积门槛；开发设计预览只进入 Vite 开发模式，生产包不再包含 DesignPlayground 合成展示代码。新增功能测试覆盖筛选、部分来源、失败保留、重试、异步卸载和链接失败；Rust 使用独立临时目录的合成配置验证隐私和扫描界限。新增 Windows 原生 E2E 覆盖桥接、扩展页、筛选和窗口宽度。

本地 fast gate：40 个文件中的 318 项前端测试通过；102 项 Windows Rust 测试通过，最后的迭代器静态检查修正后，7 项扩展专项测试再次通过。生产构建、fmt、cargo check、全部 targets 的严格 Clippy、版本与 diff 检查通过。生产 JS 共 569,684 B，gzip JS 177,772 B，CSS 151,559 B，原有体积门槛保持不变。

原生与正式发布证据归档在本次任务的 `output/review-2026-09-15/`，公开产物和流程结果见 [Release](https://github.com/silverlion2/quota-float/releases) 与 [Actions](https://github.com/silverlion2/quota-float/actions/workflows/release.yml)。Windows 多屏/DPI 与真实 Mac 视觉验收仍需对应设备，CI Universal 构建不替代这些检查。
