import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export const screens = [
  ["01-home", "开局首页", "玩家、经济与局长设置"],
  ["02-home-rules", "首页玩法说明", "开局前一分钟规则"],
  ["03-iphone-install", "iPhone 安装引导", "添加到主屏幕与投电视"],
  ["04-restore-session", "恢复旅程", "发现本机未完成存档"],
  ["05-game-ready", "对局主界面", "轮到玩家、双球轮盘与旅行动态"],
  ["06-first-player", "先手揭晓", "随机决定第一位玩家"],
  ["07-onboarding", "首次教学", "四步图文上手引导"],
  ["08-math-answer", "儿童数学答题", "双球相加后语音或点按回答"],
  ["09-voice-guide", "语音主持设置", "麦克风授权与测试"],
  ["10-cast-guide", "投屏引导", "iPhone、安卓与电脑投电视"],
  ["11-rules-handbook", "规则手册", "快速玩法、租金表与辅助设置"],
  ["12-city-purchase", "购买城市", "城市地契、收益与余额确认"],
  ["13-city-upgrade", "升级建筑", "当前等级与升级后租金"],
  ["14-card-reveal", "机会卡揭晓", "卡牌结果与安全上限"],
  ["15-asset-manager", "资产中心", "自由整理已有城市资产"],
  ["16-rescue-center", "资产自救", "现金不足时的推荐筹款方案"],
  ["17-financial-confirm", "资产操作确认", "高风险操作二次确认"],
  ["18-settlement-confirm", "结算确认", "解释公平结算公式"],
  ["19-final-ranking", "冠军排行", "最终资产排名与后续动作"],
];

const html = (device, screen, title) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex">
  <title>${title} · ${device === "mobile" ? "手机" : "大屏"}预览</title>
  <link rel="stylesheet" href="../preview.css">
  <link rel="stylesheet" href="../viewport.css?v=10">
</head>
<body class="device-${device}" data-screen="${screen}" data-device="${device}">
  <main id="preview-root"></main>
  <script src="../preview.js?v=11" defer></script>
</body>
</html>
`;

const catalog = (device) => {
  const cards = screens.map(([id, title, desc], index) => `
    <a class="catalog-card" href="${id}.html">
      <span>${String(index + 1).padStart(2, "0")}</span><div><b>${title}</b><small>${desc}</small></div><i>→</i>
    </a>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>环球大富翁 · ${device === "mobile" ? "手机" : "大屏"}界面目录</title><link rel="stylesheet" href="../preview.css"></head><body class="catalog-body"><main class="catalog"><header><span>🌍</span><div><small>DESIGN HANDOFF · ${device.toUpperCase()}</small><h1>${device === "mobile" ? "手机界面" : "客厅大屏界面"}</h1><p>共 ${screens.length} 个关键界面 · 点击逐页查看</p></div><a href="../index.html">切换设备</a></header><section>${cards}</section></main></body></html>`;
};

const index = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>环球大富翁 · 全界面设计交接</title><link rel="stylesheet" href="preview.css"></head><body class="catalog-body"><main class="device-index"><span class="device-globe">🌍</span><small>WORLD TOUR MONOPOLY · DESIGN HANDOFF</small><h1>环球大富翁<br>全界面 HTML 预览</h1><p>覆盖开局、对局、教学、投屏、城市经济、资产自救与最终结算。手机和大屏保持相同的信息结构，并针对观看距离重新排版。</p><div><a href="mobile/index.html"><i>📱</i><b>手机界面</b><span>390 × 844 · 19 个场景</span><em>打开目录 →</em></a><a href="large-screen/index.html"><i>📺</i><b>客厅大屏</b><span>1600 × 900 · 19 个场景</span><em>打开目录 →</em></a></div><footer>静态 HTML · 无需构建 · 双击即可查看</footer></main></body></html>`;

await Promise.all([mkdir(join(root, "mobile"), { recursive: true }), mkdir(join(root, "large-screen"), { recursive: true })]);
await Promise.all([
  writeFile(join(root, "index.html"), index),
  writeFile(join(root, "mobile", "index.html"), catalog("mobile")),
  writeFile(join(root, "large-screen", "index.html"), catalog("large-screen")),
  ...screens.flatMap(([id, title]) => [
    writeFile(join(root, "mobile", `${id}.html`), html("mobile", id, title)),
    writeFile(join(root, "large-screen", `${id}.html`), html("large-screen", id, title)),
  ]),
]);

console.log(`Generated ${screens.length * 2 + 3} HTML files in ${root}`);
