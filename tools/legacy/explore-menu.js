#!/usr/bin/env node
/** 用 profile-2 探索「信息查询」等菜单，找班级课表/全校课表等可用课表入口 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = "https://gmu.jw.chaoxing.com";
const OUT = path.join(__dirname, "tools", "gmu", "out");
const PROFILE = path.join(OUT, "chrome-profile-2");
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

  const dump = async (url, label) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(4000);
    const links = await page.evaluate(() => {
      const seen = new Set(); const out = [];
      document.querySelectorAll("a").forEach((a) => {
        const t = (a.innerText || "").trim().replace(/\s+/g, " ").slice(0, 22);
        const h = a.getAttribute("href") || "";
        const oc = a.getAttribute("onclick") || "";
        const k = t + h + oc;
        if (k.length > 2 && !seen.has(k)) { seen.add(k); out.push(`"${t}" href=${h.slice(0, 90)} onclick=${oc.slice(0, 110)}`); }
      });
      return out.slice(0, 60);
    });
    P(`\n=== ${label} (${url}) ===`);
    P("url=" + page.url());
    links.forEach((l) => P("  " + l));
  };

  await dump(`${BASE}/admin/indexMain/M1402`, "信息查询");
  await dump(`${BASE}/admin/indexMain/M1408`, "空教室查询");
  await dump(`${BASE}/admin/indexMain/M1406`, "已选课程查询");

  fs.writeFileSync(path.join(__dirname, "menu-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
