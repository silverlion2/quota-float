# Credits 追踪与到期信息

## 数据含义

Codex 的套餐额度、重置 credits 和额外用量 credits 是三个独立概念。套餐百分比仍作为主额度显示；重置次数与额外余额在独立 Credits 面板展示，不能相加或互相换算。不限量额外 credits 不会覆盖套餐额度、额度历史或任务栏百分比。

- Codex 额外余额读取既有只读 `/wham/usage` 的 `credits.balance`，兼容数字和字符串，保留真实零值；`unlimited` 单独表达。只有 `has_credits` 标记而没有金额时不猜余额。
- Codex 重置 credits 的数量与到期时间取自同一个成功来源。零数量具有优先级；只列出有效的可用批次，排除已兑换或已过期条目。
- 额外 credits 的官方接口当前不提供逐笔购买到期日。界面明确标注未提供，不能从套餐重置日或通用有效期政策反推个人到期日。
- TRAE 展示每个有效积分包的剩余量与 `expire_time` / `entitlement_base_info.end_time`，兼容秒和毫秒时间戳。未知时间保留未知；积分包各自计算余额，不相互扣减。
- Qoder 和 WorkBuddy 的当前来源只提供余额，未证实的到期字段不使用。周期重置时间不等于 credits 到期时间。

## 界面与本地历史

所有展开布局均显示 Credits 摘要；已知到期时间无需展开，包含时区、临期和到期标记。部分批次的日期缺失时明确提示。展开明细可查看批次与近 30 天最近 8 条本地变化，区域高度受限且可键盘滚动。失败与陈旧状态保留明确提示，不在客户端猜测扣减过期余额。

额度历史追加可选 `credits` 计数，变化时立即采样，不等待 30 分钟间隔。旧历史无需迁移，不补造历史。跨失败、未知值、套餐变更和超过 6 小时的观测间隔不计算差值。余额下降可能来自消耗或到期，增加可能来自补充或调整，均不是账单证明。现有备份导出/导入会保留新计数；同套餐账号切换仍缺乏可比较的账号标识。

## 外部依据

2026-10-25 核验：

- [OpenAI Codex 官方 CreditsSnapshot](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs)：额外 credits 的余额、可用标记和不限量状态；不包含购买批次到期日。
- [OpenAI credits 使用说明](https://help.openai.com/en/articles/12642688)：个人购买 credits 的政策说明不能替代账号级到期数据。
- [CodexBar Codex OAuth 读取实现](https://github.com/steipete/CodexBar/blob/main/Sources/CodexBarCore/Providers/Codex/CodexOAuth/CodexOAuthUsageFetcher.swift)：独立的重置 credits 查询与可用批次字段。

凭证读取、请求与响应解析仍在 Rust 内，未新增购买、重置兑换或账号修改操作。浏览器与原生自动化使用合成数据，不代表全部真实平台账号验收。

## 验证

本地证据目录为 `output/credits-update-20261025/`。包含前端/原生测试、构建、视觉检查与缓存迁移回执；发布证据仍以 `output/release-runs/` 和公开 Release 为准。

发布前 fast gate：57 个文件的 540 项前端测试通过（本机采用单线程 worker；子进程模式曾发生启动超时），139 项 Windows Rust 测试通过，1 项真实登录 Profile 探针保持 opt-in 忽略。生产构建、版本一致性、Rust fmt/check/严格 Clippy 通过。16 个浏览器视觉场景检查中英文、三套主题明暗和四种展开布局，未发现横向溢出；生产 JS gzip 总量 185,893 B、CSS 总量 153,048 B。

本机缓存已逐文件验证 26,196 个 SHA-256 后迁至 E 盘，通过目录链接保留原构建路径；迁移回执与原有本地配置的恢复核对单独留在本地证据目录，不影响其他设备的默认构建位置。

Credits 面板没有新增运行依赖。移除被替代的旧重置弹层样式与文案后，压缩 JavaScript 总预算从 180 KiB 调整至 182 KiB，专门容纳本轮历史与到期展示；入口、未压缩总量和 CSS 预算保持原门槛，实际体积记录于构建报告。
