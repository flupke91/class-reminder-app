#!/usr/bin/env node
/** 探测课表数据接口：sdpkkbList / getXsdSykb / 节次时间 / 当前周次 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = "https://gmu.jw.chaoxing.com";
const OUT = path.join(__dirname, "tools", "gmu", "out");
const PROFILE = path.join(OUT, "chrome-profile");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    headless: true,
    args: ["--no-first-run", "--no-default-browser-check", "--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    locale: "zh-CN",
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const L = [];
  const P = (s) => { L.push(s); console.log(s); };

  await page.goto(`${BASE}/admin/pkgl/xskb/queryKbForXsd?xnxq=2026-2027-1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000);

  const get = (url, asJson = true) =>
    page.evaluate(async (u) => {
      const r = await fetch(u, { credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } });
      const t = await r.text();
      return { status: r.status, text: t };
    }, url);

  const post = (url, body) =>
    page.evaluate(async (a) => {
      const r = await fetch(a.url, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
        body: a.body,
      });
      const t = await r.text();
      return { status: r.status, text: t };
    }, { url, body });

  // 0) 基础信息
  const xlzc = await get("/admin/api/getXlzc");
  P("当前周次 xlzc: " + xlzc.text);
  fs.writeFileSync(path.join(OUT, "api-xlzc.json"), xlzc.text, "utf8");

  const zclist = await get("/admin/api/getZclistByXnxq?xnxq=2026-2027-1&role=&userId=&xqid=01");
  fs.writeFileSync(path.join(OUT, "api-zclist.json"), zclist.text, "utf8");
  P("节次时间 zclist: status=" + zclist.status + " len=" + zclist.text.length);
  try {
    const j = JSON.parse(zclist.text);
    (j.data.jcsjszList || []).forEach((x) => P(`  第${x.jc}节 ${x.sjd} ${x.kssj}-${x.jssj}`));
  } catch (e) {}

  // 1) sdpkkbList 各种周次组合
  const XHID = await page.evaluate(() => document.getElementById("xhid").value);
  P("\nxhid=" + XHID.slice(0, 20) + "…");
  P("\n=== sdpkkbList 组合探测 ===");
  const combos = [
    { zdzc: "3", zxzc: "3" }, { zdzc: "3", zxzc: "" }, { zdzc: "", zxzc: "3" },
    { zdzc: "1", zxzc: "1" }, { zdzc: "3", zxzc: "3", xskbxslx: "1" },
  ];
  for (const c of combos) {
    const q = new URLSearchParams({ xnxq: "2026-2027-1", xhid: XHID, xqdm: "01", zdzc: c.zdzc, zxzc: c.zxzc, xskbxslx: c.xskbxslx || "0" });
    const r = await get(`/admin/pkgl/xskb/sdpkkbList?${q}`);
    P(`  zdzc=${c.zdzc || "_"} zxzc=${c.zxzc || "_"} xskbxslx=${c.xskbxslx || 0} -> ${r.status} ${r.text.slice(0, 120)}`);
    if (r.status === 200 && r.text.length > 200) {
      fs.writeFileSync(path.join(OUT, "sdpkkb-probe.json"), r.text, "utf8");
      P("    ^^^ 已保存 sdpkkb-probe.json (" + r.text.length + " 字节)");
    }
    await sleep(1500);
  }

  // 2) getXsdSykb 再试几次
  P("\n=== getXsdSykb 重试 ===");
  for (let i = 1; i <= 5; i++) {
    const r = await post("/admin/getXsdSykb", "zc=3");
    let ok = false;
    try { ok = JSON.parse(r.text).ret === 0; } catch (e) {}
    P(`  第${i}次 zc=3 -> ${r.status} ok=${ok} ${r.text.slice(0, 90)}`);
    if (ok) {
      fs.writeFileSync(path.join(OUT, "grid-week3.json"), r.text, "utf8");
      P("    ^^^ 已保存 grid-week3.json");
      break;
    }
    await sleep(3000);
  }

  fs.writeFileSync(path.join(__dirname, "probe-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
