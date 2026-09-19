#!/usr/bin/env node
/** 从首页渲染的「主修课表」DOM 直接读课表；顺带试 type=1&zc=3 */
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

  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(6000);

  // 1) 找课表容器
  const containers = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("div,table,ul").forEach((el) => {
      const c = el.className || "";
      if (typeof c === "string" && /schoolCanlendar|grkb|zxkb|kb/i.test(c)) {
        out.push({ tag: el.tagName, cls: c.slice(0, 60), len: (el.innerText || "").length, id: el.id });
      }
    });
    return out.slice(0, 40);
  });
  P("=== 课表相关容器 ===");
  containers.forEach((c) => P(`  ${c.tag}#${c.id} .${c.cls} textLen=${c.len}`));

  // 2) 首页可见的课表文本
  const kbText = await page.evaluate(() => {
    const el = document.querySelector(".schoolCanlendar") || document.querySelector("[class*=kb]");
    return el ? (el.innerText || "").slice(0, 2500) : "NO CONTAINER";
  });
  P("\n=== 首页课表区文本 ===");
  P(kbText);

  // 3) 首页 HTML 片段（结构）
  const kbHtml = await page.evaluate(() => {
    const el = document.querySelector(".schoolCanlendar");
    return el ? el.innerHTML.slice(0, 4000) : "NO CONTAINER";
  });
  fs.writeFileSync(path.join(OUT, "home-kb.html"), kbHtml, "utf8");
  P("\n(首页课表 HTML 已存 home-kb.html)");

  // 4) 试 type=1&zc=3
  P("\n=== getXsdSykb 参数矩阵 ===");
  for (const body of ["zc=3", "type=1&zc=3", "type=1&zc=3&xnxq=2026-2027-1", "zc=3&type=1"]) {
    const r = await page.evaluate(async (b) => {
      const resp = await fetch("/admin/getXsdSykb", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
        body: b,
      });
      return { status: resp.status, text: (await resp.text()).slice(0, 120) };
    }, body);
    P(`  ${body} -> ${r.status} ${r.text}`);
    await sleep(2000);
  }

  // 5) 点第 3 周标签看会不会渲染
  P("\n=== 点击「3 周」标签 ===");
  try {
    await page.evaluate(() => { if (typeof getZxkb === "function") getZxkb(3, document.querySelector("#zxkbWeeks>div:nth-child(3)")); });
    await sleep(5000);
    const after = await page.evaluate(() => {
      const el = document.querySelector(".schoolCanlendar");
      return el ? el.innerText.slice(0, 1500) : "NO";
    });
    P(after);
  } catch (e) { P("点击失败: " + String(e).slice(0, 120)); }

  fs.writeFileSync(path.join(__dirname, "homekb-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
