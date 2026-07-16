import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const root = process.env.PROJECT_ROOT ?? process.cwd();
const out = path.join(root, "outputs", "codex-feedback-20260712");
await fs.mkdir(out, { recursive: true });
const shots = ["15-56-28", "15-56-48", "15-56-52", "15-56-57", "15-57-02"].map(x => path.join(root, "效果", `Snipaste_2026-07-08_${x}.jpg`));

const common = [
  ["2026-07-10", "0.1.3 Windows", 0, 1],
  ["2026-07-10", "0.1.3 Windows", 0, 1],
  ["2026-07-10", "0.1.3 Windows", 0, 0],
  ["2026-07-10", "0.1.3 macOS", 0, 3],
  ["2026-07-10", "0.1.3 Windows/macOS", 0, 0],
];

const cn = {
  file: "用户反馈跟踪表-中文.xlsx", sheet: "用户反馈", guide: "填写说明", title: "Quota Float 用户反馈跟踪表",
  scope: "用途边界：本表仅用于工具修复、问题回归与新功能升级管理。版本测试、构建、上传和发布流程无需读取或扫描本表，以节省 token 与扫描开销。",
  headers: ["时间","问题版本","工作分类","问题类型","用户反馈","修复 / 新功能方案","当前版本是否解决","是否解决状态","图片备注","后续是否再出现","人工查验","验证备注"],
  cats: ["功能修复","新功能增加"], types: ["界面与视觉","窗口与交互","数据与功能","平台兼容"],
  feedback: ["展开卡片靠近桌面右侧时，右侧圆角可能显示不完整或被屏幕边缘裁切。","悬浮球拖到桌面右边后，默认向右展开会导致内容出屏；复测还出现小窗口裁切。","部分用户反馈悬浮球或展开卡片周围有白边。","macOS 圆角卡片/悬浮球四角外的透明区域显示成白色方角。","悬浮球或展开卡片周围仍可能出现轻微裁边。"],
  fixes: ["按当前显示器物理像素边界调整展开位置；空间不足时向左/上展开，并加入 4px 透明安全边距。","窗口尺寸和位置计算下沉到 Tauri Rust 后端，并增加短延迟，避免移动窗口时 mouseleave 打断展开。","降低白色描边对比度，增加 background-clip，禁用手动调整窗口尺寸，并加入透明安全边距。","启用 Tauri app.macOSPrivateApi，将窗口 backgroundColor 设为 #00000000，并加入透明安全边距。","更新后端几何计算，使安全边距可位于屏幕外，同时可视圆角 UI 保持贴边。"],
  current: ["代码已处理，待用户确认","代码已处理，待用户确认","代码已处理，待用户确认","代码已处理，待 macOS 确认","代码已处理，待用户确认"],
  resolution: ["待实机确认","待实机确认","待实机确认","待 macOS 实机确认","待实机确认"],
  notes: ["原反馈文件名：img_v3_0213f_78d21cf9-1b13-4bdc-ae57-443b4bcb4c1g.jpg","原反馈含 3 张 codex-clipboard 截图，当前工作区未找到原文件","用于对照浅色背景与透明边缘","原 WXWork 文件名：65cc2c04-c178-45b8-bddb-15a399fbb1bb.jpg、4b0e44ab-bf1d-4813-996d-35e4637d6dda.jpg（原文件未在工作区）","需要安全边距版本的重复截图"],
  verify: ["自动化测试与 Windows 打包已通过；待安装包实机复测","自动化测试与打包通过；待右侧和右下角拖拽验收","待浅色、深色壁纸实机验收","macOS CI Universal artifact 通过；必须在 Mac 实机确认","检查边缘、展开/收起及 100%、125%、150% 缩放"],
  statusList: ["待确认","处理中","已解决","未解决","不适用"], qaList: ["待人工查验","查验通过","查验不通过","不适用"], pending: "待观察", qa: "待人工查验", english: false,
};
const en = {
  file: "user-feedback-tracker-en.xlsx", sheet: "Feedback Tracker", guide: "Instructions", title: "Quota Float User Feedback Tracker",
  scope: "Scope: this workbook is only for tool fixes, regression tracking, and feature upgrades. Version testing, builds, uploads, and release workflows do not need to read or scan it, reducing token and scanning overhead.",
  headers: ["Time","Problem Version","Work Category","Problem Type","User Feedback","Fix / Feature Plan","Solved in Current Version","Resolution Status","Image Notes","Reappeared Later","Manual QA","Verification Notes"],
  cats: ["Bug Fix","New Feature"], types: ["UI & Visual","Window & Interaction","Data & Function","Platform Compatibility"],
  feedback: ["The expanded card can lose visible right-side corners near the desktop edge.","Dragging the orb to the right edge can render rightward expansion off-screen; a retest also showed clipping.","Some users report white edges around the floating orb or expanded card.","macOS renders white square corners in the transparent area outside the rounded card/orb.","A slight clipped edge may still appear around the floating card or expanded card."],
  fixes: ["Compute expansion against the current monitor; open left/up when needed and add a 4 px safe inset.","Move geometry calculations to the Tauri Rust backend and add a short collapse delay.","Reduce high-contrast strokes, add background clipping, disable manual resizing, and add a safe inset.","Enable app.macOSPrivateApi, set backgroundColor to #00000000, and add a safe inset.","Allow the inset to sit off-screen while the visible rounded UI remains docked."],
  current: ["Implemented; pending user confirmation","Implemented; pending user confirmation","Implemented; pending user confirmation","Implemented; pending macOS confirmation","Implemented; pending user confirmation"],
  resolution: ["Pending device confirmation","Pending device confirmation","Pending device confirmation","Pending macOS device confirmation","Pending device confirmation"],
  notes: ["Original: img_v3_0213f_78d21cf9-1b13-4bdc-ae57-443b4bcb4c1g.jpg","Three original codex-clipboard files are referenced but not present in the workspace.","Visual reference for light and transparent backgrounds.","Original WXWork files: 65cc2c04-c178-45b8-bddb-15a399fbb1bb.jpg and 4b0e44ab-bf1d-4813-996d-35e4637d6dda.jpg (not present).","Repeat screenshots are needed from the safe-inset build."],
  verify: ["Automated tests and Windows packaging passed; packaged-app retest pending","Right-edge and bottom-right drag verification pending","Light/dark wallpaper smoke test pending","macOS CI Universal artifact passed; Mac device confirmation required","Check edges, expanded/collapsed states, and 100%/125%/150% scaling"],
  statusList: ["Pending","In Progress","Resolved","Unresolved","N/A"], qaList: ["Pending manual QA","QA Passed","QA Failed","N/A"], pending: "Pending observation", qa: "Pending manual QA", english: true,
};

cn.file = "用户反馈跟踪表-中文-v2.xlsx";
en.file = "user-feedback-tracker-en-v2.xlsx";

cn.feedback.push(
  "中英文切换不再放在展开卡片右上角，统一放到系统托盘右键菜单中；切换后托盘菜单文案也应同步切换语言。",
  "右上角固定按钮启用后缺少明显的选中反馈。",
);
cn.fixes.push(
  "移除卡片内语言按钮；由系统托盘菜单切换语言，并在切换时即时更新显示、刷新、解锁、固定、开机启动和退出等菜单文案。",
  "固定启用时使用蓝色背景与填充图钉图标，并保留取消固定时的线框图标。",
);
cn.current.push("代码已实现，待用户确认", "代码已实现，待用户确认");
cn.resolution.push("待实机确认", "待实机确认");
cn.notes.push("", "");
cn.verify.push("检查中英文托盘菜单是否完整同步，展开卡片内不再出现语言按钮", "检查固定前后图标、蓝色填充态及置顶行为");

en.feedback.push(
  "Move language switching out of the expanded card and into the system tray context menu; the entire tray menu should follow the selected language.",
  "The top-right pin button needs a clearer active state after always-on-top is enabled.",
);
en.fixes.push(
  "Remove the in-card language button; switch language from the tray and immediately relabel Show, Refresh, Unlock, Pin, Start at login, and Quit items.",
  "Use a blue background and filled push-pin icon when enabled, keeping the outlined/slashed state when disabled.",
);
en.current.push("Implemented; pending user confirmation", "Implemented; pending user confirmation");
en.resolution.push("Pending device confirmation", "Pending device confirmation");
en.notes.push("", "");
en.verify.push("Confirm all tray labels switch together and no language button remains in the card", "Confirm the icon, blue active fill, and always-on-top behavior");

cn.feedback.push(
  "进度条下方的重置提示除倒计时外，同时显示具体重置日期和时间。",
  "曾计划读取并显示套餐到期时间；经验证后决定暂不接入，并移除套餐信息图标。",
  "左上角套餐文字附近拖动不灵敏，交互区域曾被套餐信息控件整体拦截。",
  "增加常态展开按钮；开启后鼠标移走不恢复悬浮球，关闭后恢复原自动收起行为。",
  "常态展开与置顶按钮的选中状态颜色需要完全一致，统一使用 #5891DB。",
);
cn.fixes.push(
  "在重置倒计时后追加本地化的月/日与小时:分钟。",
  "取消套餐到期读取和信息图标。Codex 额度接口不返回账单日期；自动读取只能访问浏览器 Cookie 或要求 ChatGPT 网页登录授权，会突破工具当前只读取 Codex 本地登录状态的隐私边界，因此暂不接入。",
  "移除套餐信息控件后，左上角套餐文字及周围区域恢复为完整拖动命中区。",
  "新增可持久化 stayExpanded 偏好；开启时禁止 mouseleave 收起，关闭后恢复鼠标移出折叠。",
  "常态展开选中态与置顶选中态共用 #5891DB 背景、边框和阴影参数。",
);
cn.current.push("代码已实现，待用户确认", "已移除，不接入", "代码已实现，待用户确认", "代码已实现，待用户确认", "代码已实现，待用户确认");
cn.resolution.push("待实机确认", "不适用", "待实机确认", "待实机确认", "待实机确认");
cn.notes.push("", "隐私边界：不读取浏览器 Cookie，不额外接管 ChatGPT 网页登录。", "", "", "");
cn.verify.push("检查倒计时与具体时间是否同时显示", "确认界面无套餐信息图标及到期时间读取", "检查左上角文字和空白区域拖动", "检查开启、关闭、重启后的常态展开行为", "对比常态展开和置顶按钮选中颜色");

en.feedback.push(
  "Show the exact reset date and time after the countdown below the progress bar.",
  "Plan-expiration reading was evaluated but is now deferred, and the plan information icon is removed.",
  "Dragging near the upper-left plan label was unreliable because the whole plan-info region intercepted dragging.",
  "Add a persistent-expansion button so the card remains expanded after mouseleave when enabled.",
  "Use exactly the same #5891DB selected-state color for persistent expansion and always-on-top.",
);
en.fixes.push(
  "Append a localized month/day and hour:minute value to the existing reset countdown.",
  "Remove plan-expiration reading and its icon. The Codex quota response has no billing date; automatic access would require browser cookies or separate ChatGPT web login authorization, exceeding the current privacy boundary of reading only local Codex login state.",
  "Remove the plan-info control so the plan label and surrounding upper-left area are fully draggable again.",
  "Persist stayExpanded; suppress mouseleave collapse while enabled and restore normal collapse when disabled.",
  "Share the #5891DB background, border, and shadow parameters between both active buttons.",
);
en.current.push("Implemented; pending user confirmation", "Removed; not integrated", "Implemented; pending user confirmation", "Implemented; pending user confirmation", "Implemented; pending user confirmation");
en.resolution.push("Pending device confirmation", "N/A", "Pending device confirmation", "Pending device confirmation", "Pending device confirmation");
en.notes.push("", "Privacy boundary: no browser-cookie access and no separate ChatGPT web-login takeover.", "", "", "");
en.verify.push("Confirm countdown and exact time appear together", "Confirm the plan information icon and expiration reader are absent", "Verify dragging on the upper-left label and surrounding area", "Verify enabled, disabled, and restart behavior", "Compare the two active button colors");

common.splice(0, common.length,
  ["2026-07-10", "Win", "", 0, 1],
  ["2026-07-10", "Win", "", 0, 1],
  ["2026-07-10", "Win", "", 0, 0],
  ["2026-07-10", "macOS", "", 0, 3],
  ["2026-07-10", "Win/macOS", "", 0, 0],
  ["2026-07-12", "Win/macOS", "", 1, 1],
  ["2026-07-12", "Win/macOS", "", 1, 0],
  ["2026-07-12", "Win/macOS", "", 1, 0],
  ["2026-07-12", "Win/macOS", "", 1, 2],
  ["2026-07-12", "Win/macOS", "", 0, 1],
  ["2026-07-12", "Win/macOS", "", 1, 1],
  ["2026-07-12", "Win/macOS", "", 0, 0],
);

function colorStatuses(range, english) {
  const rules = english ? [["Resolved","#DCFCE7","#166534"],["Passed","#DCFCE7","#166534"],["Unresolved","#FEE2E2","#991B1B"],["Failed","#FEE2E2","#991B1B"],["Pending","#FEF3C7","#92400E"],["In Progress","#DBEAFE","#1D4ED8"]] : [["已解决","#DCFCE7","#166534"],["通过","#DCFCE7","#166534"],["未解决","#FEE2E2","#991B1B"],["不通过","#FEE2E2","#991B1B"],["待","#FEF3C7","#92400E"],["处理中","#DBEAFE","#1D4ED8"]];
  for (const [text, fill, color] of rules) range.conditionalFormats.add("containsText", { text, format: { fill, font: { bold: true, color } } });
}

async function build(c) {
  const wb = Workbook.create(); const s = wb.worksheets.add(c.sheet); const g = wb.worksheets.add(c.guide);
  s.showGridLines = false; g.showGridLines = false;
  const headers = c.english
    ? ["Time","System Platform","System Version","Work Category","Problem Type","User Feedback","Fix / Feature Plan","Solved in Current Version","Resolution Status","Image Notes","Reappeared Later","Manual QA","Verification Notes"]
    : ["时间","系统平台","系统版本","工作分类","问题类型","用户反馈","修复 / 新功能方案","当前版本是否解决","是否解决状态","图片备注","后续是否再出现","人工查验","验证备注"];
  s.getRange("A1:M1").merge(); s.getRange("A1").values = [[c.title]];
  s.getRange("A1:M1").format = { fill: "#17324D", font: { bold: true, color: "#FFFFFF", size: 18 }, rowHeight: 34 };
  s.getRange("A2:M3").merge(); s.getRange("A2").values = [[c.scope]];
  s.getRange("A2:M3").format = { fill: "#FFF4D6", font: { bold: true, color: "#7C4A03" }, wrapText: true, rowHeight: 26 };
  s.getRange("A5:M5").values = [headers];
  const rows = common.map((x,i) => [x[0],x[1],x[2],c.cats[x[3]],c.types[x[4]],c.feedback[i],c.fixes[i],c.current[i],c.resolution[i],c.notes[i],c.pending,c.qa,c.verify[i]]);
  s.getRange("A6:M17").values = rows;
  s.getRange("A5:M5").format = { fill: "#24557A", font: { bold: true, color: "#FFFFFF" }, wrapText: true, rowHeight: 42 };
  s.getRange("A6:M17").format = { fill: "#F8FAFC", font: { color: "#243447", size: 10 }, wrapText: true, rowHeight: 132, borders: { insideHorizontal: { style: "thin", color: "#D8E2EA" } } };
  [13,15,16,16,23,48,60,27,22,50,21,21,48].forEach((w,i)=>s.getRangeByIndexes(0,i,17,1).format.columnWidth=w);
  s.freezePanes.freezeRows(5); s.tables.add("A5:M17", true, c.english ? "EnglishFeedback" : "ChineseFeedback");
  s.getRange("B6:B205").dataValidation = { rule: { type: "list", values: ["Win", "macOS", "Win/macOS"] } };
  s.getRange("D6:D205").dataValidation = { rule: { type: "list", values: c.cats } };
  s.getRange("E6:E205").dataValidation = { rule: { type: "list", values: c.types } };
  s.getRange("I6:I205").dataValidation = { rule: { type: "list", values: c.statusList } };
  s.getRange("L6:L205").dataValidation = { rule: { type: "list", values: c.qaList } };
  colorStatuses(s.getRange("H6:I205"), c.english); colorStatuses(s.getRange("L6:L205"), c.english);
  for (let i=0;i<shots.length;i++) { const b64=await fs.readFile(shots[i],"base64"); s.images.add({dataUrl:`data:image/jpeg;base64,${b64}`,anchor:{from:{row:5+i,col:9,rowOffsetPx:6,colOffsetPx:250},extent:{widthPx:145,heightPx:108}}}); }
  const guide = c.english ? [["Field","Rule"],["Work Category","Use only Bug Fix or New Feature."],["Problem Type","Use four concise types only."],["Status Display","Yellow=pending; blue=in progress; green=resolved/passed; red=unresolved/failed."],["Image Notes","Record filenames and context; thumbnails can be embedded."],["Scope Boundary",c.scope]] : [["字段","填写规则"],["工作分类","只分为“功能修复”和“新功能增加”。"],["问题类型","仅使用四个简明分类。"],["状态展示","黄色=待确认；蓝色=处理中；绿色=已解决/通过；红色=未解决/不通过。"],["图片备注","记录截图文件名和环境，可继续嵌入缩略图。"],["范围边界",c.scope]];
  g.getRange("A1:B6").values=guide; g.getRange("A1:B1").format={fill:"#24557A",font:{bold:true,color:"#FFFFFF"}}; g.getRange("A2:B6").format={fill:"#F8FAFC",wrapText:true}; g.getRange("A1:A6").format.columnWidth=24; g.getRange("B1:B6").format.columnWidth=90; g.getRange("A1:B6").format.rowHeight=38;
  const check=await wb.inspect({kind:"table",sheetId:c.sheet,range:"A1:M17",include:"values,formulas",tableMaxRows:17,tableMaxCols:13,maxChars:24000}); await fs.writeFile(path.join(out,c.english?"feedback-en.inspect.ndjson":"feedback-cn.inspect.ndjson"),check.ndjson,"utf8");
  const preview=await wb.render({sheetName:c.sheet,range:"A1:M17",scale:0.62,format:"png"}); await fs.writeFile(path.join(out,c.english?"feedback-tracker-en.png":"feedback-tracker-cn.png"),new Uint8Array(await preview.arrayBuffer()));
  const x=await SpreadsheetFile.exportXlsx(wb); await x.save(path.join(out,c.file));
}
await build(cn); await build(en);
