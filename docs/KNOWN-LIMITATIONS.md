# 已知限制

- Bar 本轮只支持 Top、Left、Right；Bottom 有意不支持，不能通过导入非法值启用。
- 三边 Bar 的几何、迁移和组件行为已有自动化覆盖，但 Windows 100%/125%/150% 多显示器原生拖动、锁定、置顶和透明边缘仍需实机烟测。
- macOS 透明窗口、菜单栏、拖动和三边 Bar 尚未由本轮真实 Mac artifact 验证；Windows 运行结果和 macOS CI 构建不能替代该验证。
- 平台额度来源依赖本机应用、CLI 或非公开/兼容性有限的只读接口；字段、认证或本地存储格式变化时，平台可能暂时显示 stale、signed out 或 unavailable。
- 应用不会根据提示词或本地 token 数估算缺失额度，也不会兑换重置次数或修改平台账号。
- 火山方舟需要可用且已登录的 Ark CLI；Antigravity 需要本机应用/语言服务器正在运行；其他平台也依赖对应本地登录态。
- 当前公开构建可能缺少 Windows Authenticode、macOS Developer ID 签名或 notarization，因而触发 SmartScreen/Gatekeeper；Tauri updater 签名是另一条独立校验链。
- Windows WebView2/macOS WebKit 对透明窗口和毛玻璃的桌面合成不同，Aurora 效果不会在所有壁纸或系统版本上完全一致。
- 浏览器 `npm run dev` 只使用合成数据，不能验证真实 provider、原生窗口、托盘、通知、置顶或鼠标穿透。
- 显示器在应用运行时被移除、任务栏位置动态变化等生命周期场景仍以平台实机测试为最终证据。

当前验证状态和手动步骤见 [TEST-MATRIX.md](TEST-MATRIX.md) 与 [USER-FEEDBACK-TRACKER.md](USER-FEEDBACK-TRACKER.md)。
