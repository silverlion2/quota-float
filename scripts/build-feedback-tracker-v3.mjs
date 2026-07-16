import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = process.env.FEEDBACK_TRACKER_DIR ?? path.join(process.cwd(), "outputs", "codex-feedback-20260712");
const outputName = process.env.FEEDBACK_TRACKER_NAME ?? "user-feedback-tracker-bilingual-v3.xlsx";
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();

const cnRows = [
  ["时间", "问题版本", "问题类型", "用户反馈", "修复方案", "当前版本是否解决", "是否解决状态", "备注 / 资料", "后续是否还有出现", "人工查验", "验证状态"],
  ["2026-07-10", "0.1.3 Windows", "窗口定位 / 边缘裁切", "Win 版本右侧有三个角没显示全，展开卡片靠近桌面右侧时会被屏幕边缘裁切。", "展开时根据当前显示器可见范围自动调整窗口位置；右侧空间不足时保留悬浮球右边缘并向左展开，底部空间不足时保留下边缘并向上展开。窗口增加 4px 透明安全边距，几何计算按可视卡片边界贴屏幕。", "代码已处理，待用户确认", "待实机确认", "资料：img_v3_0213f_78d21cf9-1b13-4bdc-ae57-443b4bcb4c1g.jpg；codex-clipboard-51852e0b-25b9-4c1e-b1d3-0636bc19c9d5.png；codex-clipboard-f4f394ff-69e9-4409-ae4d-d888146cc844.png；codex-clipboard-539fcc4a-3326-49f4-be7e-3e1f3a9e6809.png", "待观察", "待人工查验", "npm test、npm run build、cargo test、Windows Tauri 打包通过；待 Windows 桌面包实机验收"],
  ["2026-07-10", "0.1.3 Windows", "交互 / 展开方向", "软件默认向右展开；悬浮球拖到桌面右边后展开内容显示不出来，而且悬浮球不能视觉贴到最右边。后续复测出现小窗口裁切展开卡片的问题。", "窗口尺寸和位置计算下沉到 Tauri Rust 后端，使用物理像素计算当前显示器边界和当前窗口右/下边缘；hover 展开加受控流程和短延迟，避免窗口移动时 mouseleave 打断展开。", "代码已处理，待用户确认", "待实机确认", "资料：codex-clipboard-51852e0b-25b9-4c1e-b1d3-0636bc19c9d5.png；codex-clipboard-f4f394ff-69e9-4409-ae4d-d888146cc844.png；codex-clipboard-539fcc4a-3326-49f4-be7e-3e1f3a9e6809.png", "待观察", "待人工查验", "npm test、npm run build、cargo test、Windows Tauri 打包通过；待右侧和右下角拖拽验收"],
  ["2026-07-10", "0.1.3 Windows", "视觉 / 透明窗口白边", "多名用户反馈悬浮球或展开卡片周围有白边。", "降低白色边框对比度，改为低对比外描边和轻内描边，增加 background-clip，禁用用户手动调整窗口尺寸，并增加 4px 透明安全边距以减少透明窗口边缘伪影。", "代码已处理，待用户确认", "待实机确认", "资料：img_v3_0213f_78d21cf9-1b13-4bdc-ae57-443b4bcb4c1g.jpg", "待观察", "待人工查验", "npm test、npm run build、cargo test、Windows Tauri 打包通过；待浅色和深色壁纸下实机验收"],
  ["2026-07-10", "0.1.3 macOS", "macOS 透明窗口渲染", "macOS 显示白色方角；截图显示圆角卡片/悬浮球四角外的透明窗口区域被渲染成白色。", "启用 Tauri app.macOSPrivateApi，将 widget 窗口 backgroundColor 设为 #00000000，并增加 4px 透明安全边距。", "代码已处理，待 macOS 确认", "待 macOS 实机确认", "用户提供 WXWork 截图：65cc2c04-c178-45b8-bddb-15a399fbb1bb.jpg；4b0e44ab-bf1d-4813-996d-35e4637d6dda.jpg。macOS 版本仍需 QA 时记录。", "待观察", "待人工查验", "macOS CI universal artifact 构建通过；必须在 Mac 真机安装运行并截图确认"],
  ["2026-07-10", "0.1.3 Windows/macOS", "视觉 / 窗口边缘裁切", "悬浮球或展开卡片周围仍可能出现轻微裁边。", "加入透明安全边距，并更新后端几何，使安全边距可位于屏幕外侧，同时可视圆角 UI 仍保持贴边。", "代码已处理，待用户确认", "待实机确认", "需要安全边距版本的重复截图。", "待观察", "待人工查验", "检查右边缘、右下角、展开/收起，以及 100%、125%、150% 缩放场景"],
];

const enRows = [
  ["Time", "Problem Version", "Problem Type", "User Feedback", "Fix", "Solved In Current Version", "Resolution Status", "Notes / Evidence", "Reappeared Later", "Manual QA", "Verification Status"],
  ["2026-07-10", "0.1.3 Windows", "Window positioning / edge clipping", "On Windows, three right-side corners can be partially hidden when the expanded card is near the desktop edge.", "Adjust the window within the current monitor bounds on expansion. When right-side space is insufficient, keep the orb's right edge and open left; when bottom-side space is insufficient, keep the bottom edge and open upward. Add a 4px transparent safe inset and compute geometry from the visible card/orb bounds.", "Code implemented; pending user confirmation", "Pending device confirmation", "Evidence: img_v3_0213f_78d21cf9-1b13-4bdc-ae57-443b4bcb4c1g.jpg; codex-clipboard-51852e0b-25b9-4c1e-b1d3-0636bc19c9d5.png; codex-clipboard-f4f394ff-69e9-4409-ae4d-d888146cc844.png; codex-clipboard-539fcc4a-3326-49f4-be7e-3e1f3a9e6809.png", "Pending observation", "Pending manual QA", "npm test, npm run build, cargo test, and Windows Tauri package build passed; pending packaged Windows smoke test"],
  ["2026-07-10", "0.1.3 Windows", "Interaction / expansion direction", "The widget expands to the right by default. When the orb is dragged to the desktop right edge, the expanded card can render off-screen, and a later retest showed the expanded card clipped inside a small window.", "Move window sizing/positioning into the Tauri Rust backend and compute with physical pixels against the current monitor and current window right/bottom edges. Add a controlled hover flow and short collapse delay so mouseleave during window movement does not interrupt expansion.", "Code implemented; pending user confirmation", "Pending device confirmation", "Evidence: codex-clipboard-51852e0b-25b9-4c1e-b1d3-0636bc19c9d5.png; codex-clipboard-f4f394ff-69e9-4409-ae4d-d888146cc844.png; codex-clipboard-539fcc4a-3326-49f4-be7e-3e1f3a9e6809.png", "Pending observation", "Pending manual QA", "npm test, npm run build, cargo test, and Windows Tauri package build passed; pending right-edge and bottom-right drag verification"],
  ["2026-07-10", "0.1.3 Windows", "Visual polish / transparent-window white edge", "Several users report white edges around the floating orb or expanded card.", "Reduce high-contrast white borders, switch to subtle low-contrast strokes and inner strokes, add background clipping, disable manual window resizing, and add a 4px transparent safe inset to reduce transparent-window edge artifacts.", "Code implemented; pending user confirmation", "Pending device confirmation", "Evidence: img_v3_0213f_78d21cf9-1b13-4bdc-ae57-443b4bcb4c1g.jpg", "Pending observation", "Pending manual QA", "npm test, npm run build, cargo test, and Windows Tauri package build passed; pending smoke test on light and dark wallpapers"],
  ["2026-07-10", "0.1.3 macOS", "macOS transparent window rendering", "macOS shows white square corners outside the rounded card/orb; screenshots show the transparent window area rendered as white around all four corners.", "Enable Tauri app.macOSPrivateApi, set the widget window backgroundColor to #00000000, and add a 4px transparent safe inset around the rounded UI.", "Code implemented; pending macOS confirmation", "Pending macOS device confirmation", "User-provided WXWork screenshots: 65cc2c04-c178-45b8-bddb-15a399fbb1bb.jpg; 4b0e44ab-bf1d-4813-996d-35e4637d6dda.jpg. macOS version still needs to be captured during QA.", "Pending observation", "Pending manual QA", "macOS CI universal artifact build passed; must install and run on a Mac with screenshots to confirm"],
  ["2026-07-10", "0.1.3 Windows/macOS", "Visual polish / window edge clipping", "A slight clipped/cut edge can still appear around the floating card/orb.", "Add a transparent safe inset and update backend geometry so the inset can sit outside the monitor edge while the visible rounded card/orb remains visually docked.", "Code implemented; pending user confirmation", "Pending device confirmation", "Needs repeat screenshots from the safe-inset build.", "Pending observation", "Pending manual QA", "Check right-edge dock, expanded hover, collapsed hover, bottom-right corner, and 100%, 125%, 150% scale where available"],
];

function buildSheet(name, rows, widths) {
  const sheet = workbook.worksheets.add(name);
  sheet.showGridLines = false;
  sheet.getRangeByIndexes(0, 0, rows.length, rows[0].length).values = rows;
  sheet.getRangeByIndexes(0, 0, 1, rows[0].length).format = { fill: "#1F4E79", font: { bold: true, color: "#FFFFFF" }, wrapText: true };
  sheet.getRangeByIndexes(1, 0, rows.length - 1, rows[0].length).format = {
    fill: "#F7FAFC",
    font: { color: "#1F2937" },
    wrapText: true,
    borders: { insideHorizontal: { style: "thin", color: "#D9E2EC" }, top: { style: "thin", color: "#B9C7D6" }, bottom: { style: "thin", color: "#B9C7D6" } },
  };
  sheet.getRangeByIndexes(0, 0, rows.length, 1).format.numberFormat = "yyyy-mm-dd";
  for (let index = 0; index < widths.length; index += 1) sheet.getRangeByIndexes(0, index, rows.length, 1).format.columnWidth = widths[index];
  sheet.getRangeByIndexes(0, 0, rows.length, rows[0].length).format.rowHeight = 136;
  sheet.getRangeByIndexes(0, 0, 1, rows[0].length).format.rowHeight = 42;
  sheet.freezePanes.freezeRows(1);
  sheet.tables.add(`A1:K${rows.length}`, true, name.includes("中文") ? "ChineseFeedbackTable" : "EnglishFeedbackTable");
}

buildSheet("中文反馈跟踪", cnRows, [14, 18, 22, 48, 66, 24, 18, 64, 20, 18, 46]);
buildSheet("Feedback Tracker EN", enRows, [14, 20, 28, 62, 76, 28, 24, 70, 22, 18, 50]);

const cnInspect = await workbook.inspect({ kind: "table", sheetId: "中文反馈跟踪", range: "A1:K6", include: "values", tableMaxRows: 7, tableMaxCols: 11 });
console.log(cnInspect.ndjson);
const errorScan = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 50 }, summary: "final formula error scan" });
console.log(errorScan.ndjson);

const cnPreview = await workbook.render({ sheetName: "中文反馈跟踪", range: "A1:K6", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "feedback-tracker-cn-v3.png"), new Uint8Array(await cnPreview.arrayBuffer()));
const enPreview = await workbook.render({ sheetName: "Feedback Tracker EN", range: "A1:K6", scale: 1, format: "png" });
await fs.writeFile(path.join(outputDir, "feedback-tracker-en-v3.png"), new Uint8Array(await enPreview.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, outputName));
