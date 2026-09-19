#!/usr/bin/env node
/** 让「学生课表」页面自己按周次渲染，逐周读取网格（页面自身渲染 = 权威） */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = "https://gmu.jw.chaoxing.com";
const OUT = path.join(__dirname, "tools", "gmu", "out");
const DIR = path.join(OUT, "render");
const PROFILE = path.join(OUT, "chrome-profile");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAX_WEEK = Number(process.argv[2] || 19);

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
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

  const net = [];
  page.on("response", async (r) => {
    const u = r.url();
    if (/sdpkkbList|getXsdSykb/.test(u)) {
      let b = "";
      try { b = (await r.text()).slice(0, 200); } catch (e) {}
      net.push({ url: u.replace(BASE, ""), status: r.status(), body: b });
    }
  });

  await page.goto(`${BASE}/admin/pkgl/xskb/queryKbForXsd?xnxq=2026-2027-1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000);

  const hasJq = await page.evaluate(() => typeof window.jQuery !== "undefined" || typeof window.$ !== "undefined");
  P("jQuery 可用: " + hasJq);

  const readGrid = () => page.evaluate(() => {
    const t = document.querySelector("table");
    if (!t) return null;
    return [...t.querySelectorAll("tr")].map((tr) =>
      [...tr.querySelectorAll("th,td")].map((td) => (td.innerText || "").trim().replace(/\s+/g, " ")));
  });

  let ok = 0;
  for (let zc = 1; zc <= MAX_WEEK; zc++) {
    const before = net.length;
    // 用 jQuery 设置周次并触发 change
    await page.evaluate((z) => {
      const $ = window.jQuery || window.$;
      const el = document.getElementById("zxzc");
      if (!el) return;
      el.value = String(z);
      if ($) { $(el).val(String(z)).trigger("change"); }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, zc);
    await sleep(2500);
    const g = await readGrid();
    const filled = g ? g.reduce((a, r) => a + r.filter((c) => c && !/^(\d|上午|下午|晚上|节次|备注)$/.test(c)).length, 0) : 0;
    const newReq = net.slice(before).map((n) => `${n.status} ${n.url.slice(0, 120)}`);
    if (g) fs.writeFileSync(path.join(DIR, `week-${zc}.json`), JSON.stringify(g, null, 2), "utf8");
    const nonEmpty = g ? g.some((r) => r.slice(2).some((c) => c && c.length > 3)) : false;
    if (nonEmpty) ok++;
    P(`周${zc}: 单元格非空=${nonEmpty} 填充数=${filled} 新请求=[${newReq.join(" | ")}]`);
  }

  P(`\n有内容的周数: ${ok}/${MAX_WEEK}`);
  P("\n=== 相关请求汇总 ===");
  net.slice(0, 10).forEach((n) => P(`${n.status} ${n.url}\n   ${n.body}`));

  fs.writeFileSync(path.join(__dirname, "render-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
