# 测试矩阵

## 自动化与代码级验证

| 范围 | 场景 | 预期 | 当前证据 |
| --- | --- | --- | --- |
| 偏好 | 旧版本缺少 Bar 字段 | 自动迁移为 `top` + `0.5` | TypeScript/Rust 归一化测试 |
| 偏好 | 非法边缘、NaN、越界 offset | 边缘回退 Top；有限数值限制到 `0…1`，无效值回退 `0.5` | TypeScript/Rust 归一化测试 |
| 布局方案 | 保存、恢复、导出/导入 Bar 位置 | `barEdge` 与 `barOffset` 随现有 schema 保存，不包含凭据 | 组件测试、运行时归一化测试 |
| Bar UI | Top 水平条 | `400×38`，平台横向排列，额度/重置/状态/新鲜度可读 | 组件、样式与 Rust 尺寸测试 |
| Bar UI | Left/Right 侧轨 | `64×320`，平台纵向排列，所有文本保持正向，贴边侧平直、内侧圆角 | 组件、主题、方向与无障碍测试 |
| Bar UI | 平台选择与悬停 | 点击/横纵拖动切换平台；650ms 后展开，移出取消 | 组件回归测试 |
| Bar geometry | 三边与 offsets `0/0.5/1` | 使用可用工作区定位并包含透明安全边距 | Rust 几何测试 |
| Bar geometry | 24px 磁吸与角落 | 最近 Top/Left/Right；角落等距保留当前边缘；Bottom 不参与 | Rust 几何测试 |
| Bar geometry | 负坐标、任务栏、多 DPI | 负原点、非零工作区原点、100/125/150% 方向尺寸正确 | Rust 几何测试 |
| 展开/收起 | 从边缘向内展开 | 保存的 edge/offset 决定展开锚点并限制在工作区 | Rust 几何测试、桥接参数测试 |
| 内容缩放 | 展开高度随内容变化 | 保留 Bar 锚点；手动拖动展开面板不改 Bar 偏好 | Rust 状态/几何逻辑、桥接测试 |
| Float/Ring | 原有吸附行为 | 不使用 Bar 磁吸结果，保持原窗口吸附路径 | Rust 几何回归、组件测试 |
| 数据 | TRAE credits | 各 entitlement pack 独立计算后汇总，不相互抵扣 | Rust 解析器回归测试 |
| 数据 | 正常/过期/登出/缺字段 | 不崩溃、不猜测额度、保留 last-known-good 并安全标记 | Provider/快照单元测试 |
| Token 洞察 | Codex session metadata / `turn_context` / `token_count` | 只保留项目 basename、规范化终端、模型名、哈希会话键与数值计数；忽略正文与过期事件 | Rust 元数据解析与安全维度测试 |
| 增量索引 | 初次、未变化、追加、截断/重建 | 首次全建；未变化零正文读取复用；追加从 cursor 续读；异常或手动操作安全重建 | Rust 持久化索引测试与 UI 重建入口 |
| 洞察筛选/指标 | 模型、项目、终端、会话与活跃度 | 筛选同时作用于总览、对比、图表、热力图与模型账本；会话去重、连续天数和均值一致 | TypeScript 聚合与组件测试 |
| 费用预估 | 输入/缓存写入/缓存读取/输出、长上下文、未知模型 | 按官方标准 API 单价分别计算；未知模型不猜价并降低定价覆盖率 | TypeScript 定价与区间聚合测试 |
| 预算与提醒 | 关闭、正常、预警、超支 | 按选定区间外推当月；预算归一化；超支提醒本地限频且可关闭 | TypeScript 预算/偏好测试与组件路径 |
| 用量导出 | CSV、JSON、SVG、价格目录 | 项目匿名化、会话键与正文排除；价格版本可追溯；原生写入限制格式和大小 | TypeScript 导出测试、Rust 命令审查 |
| 隐私 | 浏览器与诊断 | 浏览器只用合成数据；诊断不含 token、账号、auth 路径或原始响应 | 桥接测试、静态审查 |

交付时执行 `docs/DESKTOP-DEVELOPMENT-SOP.md` 的完整 fast handoff gate；本轮实际测试数量和命令结果记录在任务交付说明中，避免文档数字随测试增删而失真。

## v0.2.20 自动发布证据

- 本地发布门槛：132 个前端测试、45 个 Rust 测试、生产构建、`fmt`、`check`、严格 `clippy`、diff 与版本一致性检查全部通过。
- GitHub Actions：`verify`、Windows Defender 预检、Windows NSIS 发布、macOS Universal 发布和 Windows `upgrade-smoke` 全部成功。
- 公开 Release：`latest.json`、Windows 安装包及签名、macOS Universal DMG、macOS updater archive 及签名均已上传。
- 最新完整证据、链接和产物清单见 [RELEASE-0.2.26.md](RELEASE-0.2.26.md)。

这些结果证明构建、扫描、打包、更新签名和自动升级路径成功；它们不替代下列原生窗口视觉/交互矩阵。

## Windows 手动烟测

在 100%、125%、150% 缩放和至少一个多显示器/负坐标布局上执行：

- 在控制中心选择 Top、Left、Right，确认尺寸、平直贴边侧、内侧圆角和文字方向。
- 在同一边缘拖动到 offset 约 `0`、`0.5`、`1`；重启后相对位置保持。
- 跨 Top/Left/Right 磁吸区拖动；角落等距时保留当前边缘；拖到底部或远离其他目标时回到当前边缘。
- 从每个边缘悬停展开，确认面板向屏幕内、以保存 offset 为锚点并不超出任务栏工作区。
- 切换平台、横纵拖动 Logo、等待悬停延迟、改变内容高度并再次收起。
- 拖动已展开面板后收起，确认保存的 Bar 边缘与 offset 未改变。
- 检查锁定/鼠标穿透、托盘解锁、置顶、刷新、语言和开机启动。
- 在明暗壁纸和 Aurora/Graphite/Paper × Light/Dark 下检查白边、裁切、透明角和进度条。

状态：自动化覆盖完成；Windows 原生窗口完整矩阵待本次代码的安装包/开发窗口实机验收。

## macOS 手动烟测

- 使用真实 Mac 安装 Universal artifact，记录 `sw_vers`、CPU 架构和显示缩放。
- 重复三边 Bar、展开/收起、透明背景、置顶、锁定、拖动、菜单栏和更新检查。
- 在浅色/深色桌面分别截图，确认没有白色方角、边缘裁切或错误的向外展开。

状态：待真实 Mac artifact 验证；Windows 测试和 macOS CI 编译不能替代运行/视觉确认。

## 发布门槛

- Fast handoff gate 全部通过。
- Windows 和 macOS CI bundle artifact 成功生成。
- 对目标发布平台完成安装、启动、拖动、锁定、托盘/菜单栏、置顶、更新、回滚与卸载烟测。
- 严重和高风险问题清零；签名/公证状态明确记录。
- 提交、推送、打包、签名、标签和发布分别获得授权。
