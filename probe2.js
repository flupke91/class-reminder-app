#!/usr/bin/env node
/** 最后一遍：换路径 / 换方法 / 换参数 试探课表接口；顺便确认登录态与其它接口是否正常 */
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
  const P = (s) => { L.push(s); console.log(s); fs.writeFileSync(path.join(__dirname, "probe2-out.txt"), L.join("\n"), "utf8"); };

  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000);
  P("url=" + page.url() + "  标题=" + (await page.title()));

  const tryReq = (method, url, body) => page.evaluate(async (a) => {
    const opt = { method: a.method, credentials: "include", headers: { "X-Requested-With": "XMLHttpRequest" } };
    if (a.method === "POST") {
      opt.headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
      opt.body = a.body || "";
    }
    const r = await fetch(a.url, opt);
    const t = await r.text();
    return { status: r.status, text: t.slice(0, 160) };
  }, { method, url, body });

  // 对照组：确认登录态和其它接口正常
  P("\n=== 对照组（应 200）===");
  for (const u of ["/admin/api/getXlzc", "/admin/api/getZclistByXnxq?xnxq=2026-2027-1&role=&userId=&xqid=01"]) {
    const r = await tryReq("GET", u);
    P(`  GET ${u.slice(0, 50)} -> ${r.status} ${r.text.slice(0, 80)}`);
  }

  P("\n=== 课表接口变体 ===");
  const variants = [
    ["GET", "/admin/getXsdSykb?zc=3", ""],
    ["GET", "/admin/getXsdSykb?zc=3&xnxq=2026-2027-1", ""],
    ["POST", "/admin/getXsdSykb", "zc=3"],
    ["POST", "/admin/getXsdSykb", "zc=3&xnxq=2026-2027-1"],
    ["POST", "/admin/xsd/getXsdSykb", "zc=3"],
    ["POST", "/admin/pkgl/xskb/getXsdSykb", "zc=3"],
    ["POST", "/admin/getXsdSykb", "zc=3&type=1&xnxq=2026-2027-1&xqdm=01"],
    ["POST", "/admin/getGrkb", "type=1&zc=3"],
  ];
  for (const [m, u, b] of variants) {
    const r = await tryReq(m, u, b);
    P(`  ${m} ${u}  body="${b}" -> ${r.status} ${r.text.slice(0, 90)}`);
    await sleep(1200);
  }

  // 看看首页课表组件有没有内容（说明服务端是否真的给数据）
  const kb = await page.evaluate(() => {
    const el = document.querySelector(".schoolCanlendar");
    return el ? el.innerText.replace(/\n+/g, " | ").slice(0, 600) : "NO";
  });
  P("\n=== 首页课表组件文本 ===");
  P(kb);

  fs.writeFileSync(path.join(__dirname, "probe2-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
