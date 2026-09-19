#!/usr/bin/env node
/** 打开「我的课表」真实页面 /admin/pkgl/xskb/queryKbForXsd，抓取渲染出的网格 + 监听其 XHR */
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

  const net = [];
  page.on("response", async (resp) => {
    const u = resp.url();
    if (!/gmu\.jw\.chaoxing\.com/.test(u)) return;
    if (/\.(js|css|png|jpg|gif|woff|svg|ico)/.test(u)) return;
    let body = "";
    try { body = (await resp.text()).slice(0, 300); } catch (e) {}
    net.push({ method: resp.request().method(), url: u.replace(BASE, ""), status: resp.status(), body });
  });

  // 先回首页，找到 getZxkb 的实现
  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000);
  const fn = await page.evaluate(() => {
    const f = window.getZxkb;
    return f ? f.toString().slice(0, 800) : "NOT FOUND";
  });
  P("=== getZxkb 实现 ===");
  P(fn);

  // 打开我的课表页面
  P("\n=== 打开 /admin/pkgl/xskb/queryKbForXsd ===");
  await page.goto(`${BASE}/admin/pkgl/xskb/queryKbForXsd`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(6000);
  P("url=" + page.url());
  P("title=" + (await page.title()));

  const info = await page.evaluate(() => ({
    tables: document.querySelectorAll("table").length,
    text: document.body.innerText.slice(0, 3000).replace(/\n{2,}/g, "\n"),
  }));
  P("table 数=" + info.tables);
  P("--- 页面文本 ---");
  P(info.text);

  // 抓表格
  const grid = await page.evaluate(() => {
    const t = document.querySelector("table");
    if (!t) return null;
    return [...t.querySelectorAll("tr")].map((tr) =>
      [...tr.querySelectorAll("th,td")].map((td) => (td.innerText || "").trim().replace(/\s+/g, " ")));
  });
  if (grid) {
    fs.writeFileSync(path.join(OUT, "kb-grid-week-current.json"), JSON.stringify(grid, null, 2), "utf8");
    P("\n--- 表格（前 15 行）---");
    grid.slice(0, 15).forEach((r) => P(r.join(" | ")));
    P(`(共 ${grid.length} 行，已存 kb-grid-week-current.json)`);
  }

  P("\n=== 网络请求（含 kb/课表相关）===");
  net.filter((n) => /kb|Kb|KB|课表/.test(n.url)).forEach((n) =>
    P(`${n.method} ${n.status} ${n.url}\n     ${n.body.replace(/\s+/g, " ").slice(0, 200)}`));

  fs.writeFileSync(path.join(OUT, "kb-net.json"), JSON.stringify(net, null, 2), "utf8");
  fs.writeFileSync(path.join(__dirname, "openkb2-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
