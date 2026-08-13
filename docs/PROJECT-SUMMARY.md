# Quota Float 项目简介

## 一句话定位

Quota Float 是一款 Windows/macOS Tauri 桌面悬浮窗：它只读复用本机已有 AI 编程助手登录态，把多个平台的剩余额度、重置时间、状态与使用节奏集中显示在低干扰、可置顶的小组件中。

## 当前产品形态

- 支持 Codex、Qoder、TRAE、WorkBuddy、火山方舟 Coding Plan 和 Google Antigravity。
- 紧凑视图包括 Float、Ring 与 Bar；Bar 可磁吸顶部、左侧或右侧，顶部尺寸为 `400×38`，左右侧轨为 `64×320`。
- Bar 的边缘与沿边偏移会写入偏好、布局方案、导出文件和恢复备份；偏移采用 `0…1` 归一化值，可适配工作区与缩放变化。
- 展开视图包括 Dashboard、Provider bar 与 Stacked，并从 Bar 所在边缘向屏幕内侧展开；内容高度变化不会丢失 Bar 锚点。
- 支持平台轮播/选择、排序、隐藏、精简、风险优先、历史轨迹、额度节奏提示、桌面提醒、状态中心、托盘控制、开机启动和应用内更新。
- 网络或平台读取失败时保留最后一次成功数据并标记为过期；浏览器预览始终使用合成数据。

## 技术栈与职责

- React 19 + TypeScript + Vite：界面、交互、偏好归一化、历史/提醒逻辑和浏览器合成预览。
- Tauri 2 + Rust：只读平台适配器、持久化、窗口几何、拖动磁吸、托盘、通知和更新桥接。
- Vitest + Testing Library：纯函数、组件、偏好迁移和桥接回归测试。
- Rust 单元测试、`fmt`、`check` 与 `clippy`：平台解析、偏好迁移和物理像素窗口几何验证。

详细分层和数据流见 [ARCHITECTURE.md](ARCHITECTURE.md)，维护提案见 [ROADMAP.md](ROADMAP.md)。

## 关键文件

- `src/App.tsx`：前端状态协调、刷新/退避、展开收起、拖动结果持久化和提醒调度。
- `src/components/QuotaCard.tsx`：Float、Ring、Bar 与展开仪表板。
- `src/components/ControlCenter.tsx`：显示、Bar 边缘、平台、提醒、布局方案和恢复设置。
- `src/lib/preferences.ts`、`src/lib/activity.ts`：偏好、布局方案、导入和旧数据迁移。
- `src/lib/bridge.ts`：浏览器 mock 与 Tauri command 的类型化桥接。
- `src-tauri/src/lib.rs`：应用命令、窗口/显示器几何、磁吸、持久化、托盘和生命周期。
- `src-tauri/src/models.rs`：Rust 侧偏好与平台快照模型及安全归一化。
- `src-tauri/src/{codex,qoder,trae,workbuddy,volcengine,antigravity}.rs`：相互隔离的平台读取器。
- `docs/DESKTOP-DEVELOPMENT-SOP.md`：实现与快速交付门槛。

## 数据与安全边界

- 平台凭据只在 `src-tauri` 内读取，且只用于对应平台或本机回环服务的只读额度查询。
- 火山方舟访问保持在已认证 Ark CLI 内；Antigravity 通过本机受保护的语言服务器接口读取。
- 不保存平台 token、账号 ID、提示词、聊天记录、原始响应或本地认证路径；诊断信息必须脱敏。
- 不兑换重置次数、不修改账号、不写入平台配置；每个平台是独立失败域。
- 应用只保存自身偏好、有限历史、事件摘要、布局方案和轮换恢复点。

## 窗口与 Bar 约束

- Bar 只支持 Top/Left/Right，Bottom 明确不在本次范围。
- 拖到 24 逻辑像素磁吸区时采用最近边缘；角落等距时保留当前边缘。
- 计算使用当前显示器可用工作区和物理像素，覆盖负坐标显示器、任务栏、DPI 缩放和方向相关尺寸。
- Float/Ring 原有吸附与展开行为保持不变；拖动已展开面板不会修改已保存的 Bar 位置。
- 4 逻辑像素透明安全边距用于避免圆角裁切和系统窗口边缘出现亮边。

## 运行与验证

```powershell
npm install
npm test
npm run build
npm run tauri dev
```

提交交付前必须执行 [桌面开发 SOP](DESKTOP-DEVELOPMENT-SOP.md) 的完整 fast handoff gate。浏览器模式不能验证真实额度或系统窗口行为；Windows 多屏/缩放和 macOS 透明窗口仍需真实桌面环境按 [TEST-MATRIX.md](TEST-MATRIX.md) 验收。

## 当前维护重点

- 完成 Top/Left/Right Bar 在 Windows 100%、125%、150% 缩放和多显示器环境下的实机烟测。
- 使用真实 Mac artifact 验证透明背景、边缘展开、置顶、锁定和菜单栏行为；Windows 结果不能替代 macOS 运行验证。
- 平台应用或 CLI 更新后优先验证适配器解析与失败降级，不对缺失字段猜测额度。
- 提交、推送、打包、签名、标签和发布均是独立授权边界，不由路线图或测试结果自动触发。
