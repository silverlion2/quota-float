# Quota Float 项目简介

## 一句话定位

Quota Float 是一款 Windows/macOS Tauri 桌面悬浮窗：它只读复用本机已有 AI 编程助手登录态，把多个平台的剩余额度、重置时间、状态与使用节奏集中显示在低干扰、可置顶的小组件中。

## 当前产品形态

- 支持 Codex、Claude、Qoder、TRAE、WorkBuddy、火山方舟 Coding Plan 和 Google Antigravity。
- 紧凑视图包括 Float、Ring、Bar 与 Bottleneck；Bar 和 Bottleneck 可磁吸顶部、左侧或右侧，顶部尺寸为 `400×38`，左右侧轨为 `64×320`。Bottleneck 为每个平台提取最低剩余额度周期并按风险排序，平台点击仍只改变当前选择。
- Bar 的边缘与沿边偏移会写入偏好、布局方案、导出文件和恢复备份；偏移采用 `0…1` 归一化值，可适配工作区与缩放变化。
- 展开视图包括信息层级各自独立的 Dashboard、Cockpit、Provider Bar 与 Stacked，并从 Bar/Bottleneck 所在边缘向屏幕内侧展开；内容高度变化不会丢失边缘锚点。Cockpit 聚合额度环、近期趋势、节奏计划与 90 天热力图，三个区块可原位聚焦放大，也可拆成独立的原生置顶窗口。
- 紧凑 Bar 的 Logo 区与 Bottleneck 的平台指标区保持纯平台切换，只有详情摘要区停留 650ms 才展开；Provider Bar 展开态保留右侧纵向平台列表并移除顶部横向快捷条，Cockpit 保留单一横向平台快切导航。
- 七个平台都可通过完整 Logo 切换器快速选择，支持方向键、Home/End 的 roving keyboard navigation；平台排序、隐藏、精简与暂停集中在控制中心独立的平台页签。
- 支持平台轮播/选择、风险优先、默认 24 小时且可切换全部记录的额度历史轨迹、额度节奏提示、桌面提醒、状态中心、托盘控制、开机启动和应用内更新；平台列表、Cockpit 与用量洞察的曲线均可悬停读取每个时间点的剩余百分比。
- Codex Token 洞察会增量索引本机仍保留的全部 session metadata，并显示最早覆盖日期；“全部”区间按月聚合。额度历史从 Quota Float 首次采样起永久保留，近 90 天保留完整采样，更早数据保留每日端点与极值。
- 各平台按健康状态独立安排刷新与失败冷却；“项目专注模式”会降低刷新频率、停止自动轮播与无限环境动画，也可单独暂停不需要的平台监控，手动刷新仍然可用。
- 网络或平台读取失败时保留最后一次成功数据并标记为过期；浏览器预览始终使用合成数据。
- Codex 全局重置展望并发读取三个固定公开来源，对 48 小时概率做新鲜度校验、中位数聚合和分歧置信度判断；个人重置时间仍以 Codex 返回值为准。

## 技术栈与职责

- React 19 + TypeScript + Vite：界面、交互、偏好归一化、历史/提醒逻辑和浏览器合成预览。
- Tauri 2 + Rust：只读平台适配器、按需并发 registry、有界重试、公开重置展望聚合、持久化、窗口几何、拖动磁吸、托盘、通知和更新桥接。
- Vitest + Testing Library：纯函数、组件、偏好迁移和桥接回归测试。
- Rust 单元测试、`fmt`、`check` 与 `clippy`：平台解析、registry、偏好迁移和物理像素窗口几何验证。
- WebdriverIO + Tauri WebDriver：编译后的真实桌面进程、原生桥接、展开、控制中心与更新对话框冒烟验证。

详细分层和目录职责见 [ARCHITECTURE.md](ARCHITECTURE.md)，维护提案见 [ROADMAP.md](ROADMAP.md)，长期协作与发布历史见 [PROJECT-MEMO.md](PROJECT-MEMO.md)，最新发布证据见 [RELEASE-0.3.5.md](RELEASE-0.3.5.md)。

## 关键文件

- `src/App.tsx`：前端状态协调、按平台刷新/退避、专注模式、展开收起、拖动结果持久化和提醒调度。
- `src/components/QuotaCard.tsx`：Float、Ring、Bar、Bottleneck 与展开仪表板；`src/components/FocusPanelApp.tsx`：只读的 Cockpit 独立窗壳层。
- `src/components/ProviderLogoSlider.tsx`：完整平台目录的横向/纵向快速切换、roving focus 和键盘导航。
- `src/components/ControlCenter.tsx`：显示、布局、独立平台管理、提醒、布局方案和恢复设置。
- `src/components/UsageInsightsPanel.tsx`：四列核心指标、筛选、趋势/热力图、费用与预算展望。
- `src/lib/preferences.ts`、`src/lib/refreshPolicy.ts`、`src/lib/backup.ts`、`src/lib/activity.ts`、`src/lib/importDiagnostics.ts`、`src/lib/quotaPace.ts`：偏好、按平台刷新策略、备份 envelope 校验、布局方案、隐私安全的迁移/修正诊断、旧数据迁移、额度节奏与重置展望规划保护。
- `src/lib/bridge.ts`：浏览器 mock 与 Tauri command 的类型化桥接。
- `src-tauri/src/lib.rs`：应用命令、窗口/显示器几何、磁吸、持久化、托盘和生命周期。
- `src-tauri/src/models.rs`：Rust 侧偏好与平台快照模型及安全归一化。
- `src-tauri/src/provider_registry.rs`、`src-tauri/src/{codex,claude,qoder,trae,workbuddy,volcengine,antigravity}.rs`：有界并发、定向重试、统一输出契约和相互隔离的平台读取器。
- `src-tauri/src/reset_forecast.rs`、`src-tauri/capabilities/default.json`：三个固定公开预测源的并发读取、大小/时效/schema 校验、中位数共识与置信度，以及已知来源主页的 Tauri opener allowlist。
- `docs/DESKTOP-DEVELOPMENT-SOP.md`：实现与快速交付门槛。
- `.github/workflows/release.yml`、`scripts/release.mjs`：线上一键/本地回退发布、版本同步、草稿产物扫描与公开发布门槛。

## 数据与安全边界

- 平台凭据只在 `src-tauri` 内读取，且只用于对应平台或本机回环服务的只读额度查询。
- Claude OAuth 凭据保持只读且不会由本应用刷新；火山方舟访问保持在已认证 Ark CLI 内；Antigravity 通过本机受保护的语言服务器接口读取。
- 不保存平台 token、账号 ID、提示词、聊天记录、原始响应或本地认证路径；诊断信息必须脱敏。
- 不兑换重置次数、不修改账号、不写入平台配置；每个平台是独立失败域。
- 公开重置展望请求不携带平台凭据、账号、额度值或本地 Token 统计；过期、超大、重定向、超时或结构异常的单个来源会被独立丢弃。
- 应用只保存自身偏好、经过有界压缩的本地历史、事件摘要、布局方案和轮换恢复点。
- Cockpit 独立窗仅传递经过 allowlist 校验的区域和平台 ID；额度与历史由子窗经现有原生只读命令获取，不写入 URL 或跨窗前端存储。

## 窗口与 Bar 约束

- Bar/Bottleneck 只支持 Top/Left/Right，Bottom 明确不在本次范围。
- 拖到 24 逻辑像素磁吸区时采用最近边缘；角落等距时保留当前边缘。
- 计算使用当前显示器可用工作区和物理像素，覆盖负坐标显示器、任务栏、DPI 缩放和方向相关尺寸。
- Float/Ring 原有吸附与展开行为保持不变；拖动已展开面板不会修改已保存的 Bar/Bottleneck 位置。
- 4 逻辑像素透明安全边距用于避免圆角裁切和系统窗口边缘出现亮边。

## 运行与验证

```powershell
npm install
npm test
npm run build
npm run tauri dev
```

提交交付前必须执行 [桌面开发 SOP](DESKTOP-DEVELOPMENT-SOP.md) 的完整 fast handoff gate。浏览器模式不能验证真实额度或系统窗口行为；Windows 多屏/缩放和 macOS 透明窗口仍需真实桌面环境按 [TEST-MATRIX.md](TEST-MATRIX.md) 验收。

最近一次已验证公开版本为 `v0.3.7`。产物清单、提交、工作流和验证结果记录在 [RELEASE-0.3.7.md](RELEASE-0.3.7.md)；下一版本发布后应新增对应 release record，不覆盖历史证据。

## 当前维护重点

- 完成 Top/Left/Right Bar 在 Windows 100%、125%、150% 缩放和多显示器环境下的实机烟测。
- 使用真实 Mac artifact 验证透明背景、边缘展开、置顶、锁定和菜单栏行为；Windows 结果不能替代 macOS 运行验证。
- 平台应用或 CLI 更新后优先验证适配器解析与失败降级，不对缺失字段猜测额度。
- 提交、推送、打包、签名、标签和发布均是独立授权边界，不由路线图或测试结果自动触发。
- 日常发布优先通过 GitHub Actions `Release` 手动入口先运行 `publish=false` dry run，再通过受保护的 `release` Environment 批准 `publish=true`；本地脚本保留为回退路径。
