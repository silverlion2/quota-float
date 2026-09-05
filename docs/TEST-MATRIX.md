# 测试矩阵

## 自动化与代码级验证

| 范围 | 场景 | 预期 | 当前证据 |
| --- | --- | --- | --- |
| 偏好 | 旧版本缺少 Bar 字段 | 自动迁移为 `top` + `0.5` | TypeScript/Rust 归一化测试 |
| 偏好 | 非法边缘、NaN、越界 offset | 边缘回退 Top；有限数值限制到 `0…1`，无效值回退 `0.5` | TypeScript/Rust 归一化测试 |
| 布局方案 | 保存、恢复、导出/导入 Bar/Bottleneck 位置 | `barEdge` 与 `barOffset` 随现有 schema 保存，不包含凭据 | 组件测试、运行时归一化测试 |
| 布局导入诊断 | 旧字段、越界位置、无效/超量布局、未知字段 | 成功提示解释迁移、范围修正、修复、丢弃和忽略数量；不包含路径、布局名称/ID、provider 值或未知字段原值 | 运行时归一化、双语格式与隐私断言测试 |
| 备份 envelope | 当前/无 schema 旧备份、数组 section、缺字段、非法/未来 schema | 当前与旧备份可恢复；结构异常或未来版本在写入本地状态前拒绝 | 纯函数 envelope 校验测试 |
| Bar UI | Top 水平条 | `400×38`，平台横向排列，额度/重置/状态/新鲜度可读 | 组件、样式与 Rust 尺寸测试 |
| Bar UI | Left/Right 侧轨 | `64×320`，平台纵向排列，所有文本保持正向，贴边侧平直、内侧圆角 | 组件、主题、方向与无障碍测试 |
| Bar UI | 平台选择与悬停 | Logo 区点击/横纵拖动只切换平台；指标区停留 650ms 后展开，移出取消 | 组件回归测试 |
| Bottleneck UI | 最紧张窗口排序与切换 | 每个平台显示最低剩余额度周期；异常状态优先、百分比升序、余额型随后；点击平台只切换，摘要区停留 650ms 或点击才展开 | 组件回归测试、顶部/侧边浏览器截图 |
| Bar geometry | 三边与 offsets `0/0.5/1` | 使用可用工作区定位并包含透明安全边距 | Rust 几何测试 |
| Bar geometry | 24px 磁吸与角落 | 最近 Top/Left/Right；角落等距保留当前边缘；Bottom 不参与 | Rust 几何测试 |
| Bar geometry | 负坐标、任务栏、多 DPI | 负原点、非零工作区原点、100/125/150% 方向尺寸正确 | Rust 几何测试 |
| 窗口生命周期 fixture | 负坐标副屏、顶部任务栏迁移、副屏移除、不同 DPI 主屏接管 | 按保存的 edge/offset 重算 Bar；尺寸随 DPI 更新；折叠与展开矩形始终回收到新工作区 | Rust 连续状态 fixture；真实 Tauri 显示器事件仍需实机烟测 |
| 展开/收起 | 从边缘向内展开 | 保存的 edge/offset 决定展开锚点并限制在工作区 | Rust 几何测试、桥接参数测试 |
| 内容缩放 | 展开高度随内容变化 | 保留 Bar 锚点；手动拖动展开面板不改 Bar 偏好 | Rust 状态/几何逻辑、桥接测试 |
| Float/Ring | 原有吸附行为 | 不使用 Bar 磁吸结果，保持原窗口吸附路径 | Rust 几何回归、组件测试 |
| 数据 | TRAE credits | 各 entitlement pack 独立计算后汇总，不相互抵扣 | Rust 解析器回归测试 |
| 数据 | 正常/过期/登出/缺字段 | 不崩溃、不猜测额度、保留 last-known-good 并安全标记 | Provider/快照单元测试 |
| Codex 全局重置展望 | 三源正常、部分失败、过期、异常窗口、分歧、定时官宣 | 仅纳入 6 小时内的 48h 数据；中位数抗离群；展示来源数/置信度；低置信度或单源不改变规划；定时官宣优先于概率中点 | Rust `reset_forecast`、TypeScript `quotaPace` 与组件测试 |
| Provider registry | 并发、超时、临时失败与定向重试 | 固定顺序返回；慢平台被限制；只重试临时失败组；健康平台不重复请求 | Rust registry 单元测试、每周 Windows/macOS compatibility workflow |
| Provider 出口契约 | 错误身份/状态、NaN/越界额度、超长文本/列表、无额度 `ok`、含 token/路径/原始 JSON 的诊断 | registry 覆盖身份；状态 allowlist；数值有限且比例限制到 `0…100`；载荷限界；失败清空额度；敏感诊断替换为固定安全提示 | 所有 provider descriptor 的 Rust 共享 conformance 测试 |
| 自适应刷新 | 健康、临界、异常平台与 Balanced/Project Focus 模式 | 各平台使用独立时钟和分级间隔；只查询到期且未暂停的平台；Volcengine/Antigravity 不做同轮进程级重试 | TypeScript refresh policy、bridge/merge 与 Rust registry 单元测试 |
| 项目专注 | 开关专注模式、暂停/恢复平台、手动刷新 | 自动轮播和无限环境动画停止；自动刷新降频；至少保留一个监控平台；手动刷新保持可用 | 偏好归一化、控制中心组件和样式回归测试 |
| 展开布局与平台切换 | Dashboard、Cockpit、Provider Bar、Stacked、七平台快速切换、窄窗口 | 四种信息层级明确区分；Provider Bar 仅保留右侧纵向平台列表，Cockpit 仅保留顶部横向平台导航；方向键与 Home/End roving focus 可用；窄窗口无关键内容溢出 | QuotaCard、ProviderLogoSlider、ControlCenter 组件/无障碍测试与响应式样式审查 |
| Cockpit 局部聚焦 | 额度、节奏、90 天用量区块放大与恢复 | 选定区块成为唯一主体并触发窗口内容高度同步；恢复后回到三块一屏布局；切换平台或布局时清除聚焦 | QuotaCard 组件测试、浏览器合成预览与动态尺寸观察 |
| Cockpit 独立窗 | 拆出额度、节奏或 90 天用量 | 区域与平台 ID 通过 allowlist；子窗仅获事件/窗口最小权限并经原生只读命令读取缓存与本地历史；关闭子窗不隐藏主窗；三个固定尺寸无裁切 | Rust 目标校验、桥接/组件测试、Chrome 合成截图；Tauri 实机烟测待执行 |
| Claude | 正常、多窗口、登出、缺字段、超大响应 | 利用率转换为剩余比例；只读复用 Claude Code OAuth；未知结构不猜测 | Rust 合成 fixture 与凭据发现测试 |
| Token 洞察 | Codex session metadata / `turn_context` / `token_count` | 只保留项目 basename、规范化终端、模型名、哈希会话键与数值计数；忽略正文；覆盖本机仍保留的全部会话元数据 | Rust 元数据解析、安全维度与 90 天以前事件回归测试 |
| 增量索引 | 初次、未变化、追加、截断/重建 | 首次扫描全部本地历史；未变化零正文读取复用；追加从 cursor 续读；异常或手动操作安全重建；达到文件/字节安全上限时明确标记部分索引 | Rust 持久化索引测试与 UI 重建入口 |
| 洞察筛选/指标 | 模型、项目、终端、会话与活跃度 | 筛选同时作用于总览、对比、图表、热力图与模型账本；会话去重、连续天数和均值一致 | TypeScript 聚合与组件测试 |
| 24 小时额度曲线 | 平台列表、Cockpit、用量洞察的历史轨迹 | 默认采用最近 24 小时并按真实采样时间定位；鼠标悬停显示对应时间与剩余百分比；Cockpit/洞察支持方向键逐点读取；单样本仍可检查 | 几何纯函数与 QuotaHistoryCurve/QuotaCard 组件测试 |
| 完整历史 | 洞察“全部”区间、Token 月度曲线、额度记录 | Token 从最早本地 Codex metadata 起覆盖并显示起始日期；额度仅从 Quota Float 首次采样起计算；近 90 天完整采样，更早按日保留端点与极值；长曲线限制 SVG 绘制点但完整点集仍可交互读取 | Rust 旧事件索引、TypeScript 全区间聚合、历史压缩与曲线交互测试 |
| 费用预估 | 输入/缓存写入/缓存读取/输出、长上下文、未知模型 | 按官方标准 API 单价分别计算；未知模型不猜价并降低定价覆盖率 | TypeScript 定价与区间聚合测试 |
| 预算与提醒 | 关闭、正常、预警、超支 | 按选定区间外推当月；预算归一化；超支提醒本地限频且可关闭 | TypeScript 预算/偏好测试与组件路径 |
| 用量导出 | CSV、JSON、SVG、价格目录 | 项目匿名化、会话键与正文排除；价格版本可追溯；原生写入限制格式和大小 | TypeScript 导出测试、Rust 命令审查 |
| 隐私 | 浏览器与诊断 | 浏览器只用合成数据；诊断不含 token、账号、auth 路径或原始响应 | 桥接测试、静态审查 |
| 原生 E2E | 编译桌面进程、Tauri bridge、展开、控制中心、更新弹窗 | 真实 WebView 启动；原生命令可调用；主要 overlay 可访问且独立关闭 | `npm run test:e2e` WebdriverIO smoke |
| 性能预算 | 入口与懒加载 chunk | 入口 JS ≤ 430 KiB、总 JS ≤ 600 KiB、gzip JS ≤ 180 KiB、CSS ≤ 150 KiB | `npm run build` + `npm run check:bundle`、CI gate |
| 供应链 | npm/Rust advisories | 高风险 npm advisory 为零；RustSec vulnerability 为零 | `npm audit --audit-level=high`、`cargo audit`、Dependabot/security workflow |

交付时执行 `docs/DESKTOP-DEVELOPMENT-SOP.md` 的完整 fast handoff gate；本轮实际测试数量和命令结果记录在任务交付说明中，避免文档数字随测试增删而失真。

## v0.3.5 自动发布证据

- 自动发布门槛：云端 `verify` 通过 26 个文件中的 193 个前端测试、生产构建、57 个 Linux 可用 Rust 测试和非变更 dry run；本地 Windows 通过 69 个 Rust 测试、生产构建、bundle budget、`fmt`、`check`、严格 `clippy`、diff 与版本一致性检查。
- GitHub Actions：独立云端 dry run，以及正式 `verify`、release-ref 原子创建、Windows Defender 实际产物扫描、Windows NSIS 发布、macOS Universal 发布、`finalize` 和 Windows `upgrade-smoke` 全部成功。
- 公开 Release：`latest.json`、Windows 安装包及签名、macOS Universal DMG、macOS updater archive 及签名均已上传。
- 最新完整证据、链接、产物 SHA-256 与签名限制见 [RELEASE-0.3.5.md](RELEASE-0.3.5.md)。

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
