# Codex Profile 账户累计对齐 — 2026-09-17

修正 Codex 桌面 Profile 的账户 Lifetime 与本机日志统计口径混用造成的差异，并复用 Profile 汇总字段。

## 对齐依据

只读核查本机安装版 Codex `26.908.4834.0` 的定向代码片段：`profile-c949341a7dc1.js` 中 Lifetime 读取 `summary.totalTextTokens`；其查询来自 `app-initial-d9bed9d614d8.js` 的 `uDs → mDs → DS.safeGet('/wham/profiles/me')`。生产 base URL 经 `main-D8abTQQE.js` 和 `window-all-closed-BxbCP6YG.js` 解析为 `https://chatgpt.com/backend-api`。

| 界面统计 | 同源字段 |
| --- | --- |
| 终生 Token | `stats.lifetime_tokens` |
| 单日峰值 | `stats.peak_daily_tokens` |
| 当前连续使用 | `stats.current_streak_days` |
| 最长连续使用 | `stats.longest_streak_days` |
| 最长单次任务 | `stats.longest_running_turn_sec` |
| 账户任务数 | `stats.total_threads` |

Profile 还有 `daily_usage_buckets` 与活动偏好字段；本次优先接入上表汇总，不将账号身份、头像或工具调用信息复制进小程序。该服务是当前安装版使用的内部接口，不宣称为稳定公共 API。接口变更时明确不可用，不猜字段。

本机只读 SQLite 聚合与 Profile 返回的账户累计不同，**不能作为 Profile 官方累计**。Profile 的账户值可能覆盖本机日志之外的历史，不能通过扩大目录或将缓存 Token 加一遍来追齐。输入 Token 已包含缓存输入。

## 实现

- Profile 通过独立 Tauri 命令读取官方同源 GET，复用 Rust 中已有只读登录态。10 秒请求上限、1 MiB 响应上限，只返回指定数值与读取时间，不返回账户 ID、凭据或原始响应。
- 汇总独立于日志扫描、时间区间及模型/项目/终端筛选；每十分钟在洞察打开期间刷新，也可手动刷新。
- 缺失字段显示未知而非零；`metadata.stats_error` 或 HTTP/网络失败显示固定安全提示。有成功结果时保留并标明可能过期，绝不用本机值冒充 Profile。
- Rust 内存中的登录态指纹用于识别账户切换及凭据轮换，不落盘或发送到前端，且仅在成功读取后更新。登录态缺失、401/403，或新登录态请求失败时清除前端旧账户结果；重叠失败不能提前认领旧缓存，同一登录态的暂时失败保留旧值并提示。
- 原“总 Token”改为“本机区间 Token”，索引截断提示放到数值旁。费用及导出继续依赖本机可用明细，不把账户总量强行分摊到本地项目。
- 本机扫描补充 `archived_sessions`，按 rollout 文件末尾的稳定 UUID 去重。重复副本优先完整的大文件；同 UUID 跨来源文件时重新读取，避免拼接不相同的前缀。来源路径仅保存哈希。
- 索引 schema 从 4 升到 5；增量读取失败保留上次明细并标记部分索引。首次迁移受既有 2 GiB/20,000 文件预算限制，可能需要后续刷新逐步补齐。官方账户累计不受此过程影响。

## 验证

回归覆盖账户总量原字段映射、缺失/零/错误、原始字段不外泄；独立加载、刷新失败保留及恢复；切换本地区间不改变账户累计；活动到归档移动、双副本、较短副本、重启及仅归档目录；合成浏览器/原生 E2E 桥接不访问真实 Profile。

真实账户只读验证已通过 Rust 的显式 ignored probe 执行一次，官方账户累计及单日峰值均成功返回；具体私人统计仅记在本地忽略的验收报告中。登录凭据没有带到脚本或前端。浏览器合成数据预览确认六项 Profile 汇总与重置入口可见，刷新按钮无文字挤压。
