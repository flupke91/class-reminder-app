#!/usr/bin/env node
/** 定位课表页面入口：列出首页所有链接/菜单/iframe；同时多次重试网格接口并保存完整响应 */
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
  const P = (s) => { console.log(s); L.push(s); };

  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(6000);

  // 1) 所有链接
  const anchors = await page.evaluate(() => {
    const seen = new Set();
    const out = [];
    document.querySelectorAll("a").forEach((a) => {
      const t = (a.innerText || "").trim().replace(/\s+/g, " ");
      const href = a.getAttribute("href") || "";
      const oc = a.getAttribute("onclick") || "";
      const key = t + "|" + href + "|" + oc;
      if (key.length > 1 && !seen.has(key)) {
        seen.add(key);
        out.push({ t: t.slice(0, 24), href: href.slice(0, 120), oc: oc.slice(0, 120) });
      }
    });
    return out.slice(0, 80);
  });
  P("=== 首页链接（前 80）===");
  anchors.forEach((a) => P(`  "${a.t}"  href=${a.href}  onclick=${a.oc}`));

  // 2) iframe
  const frames = await page.evaluate(() =>
    [...document.querySelectorAll("iframe")].map((f) => f.src || "").filter(Boolean).slice(0, 20));
  P("\n=== iframe ===");
  frames.forEach((f) => P("  " + f.slice(0, 160)));

  // 3) 含 onclick 跳课表的菜单项
  const menus = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("li,div,span,a").forEach((el) => {
      const oc = el.getAttribute("onclick") || "";
      const t = (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 20);
      if (/课表|kb|Kb|KB/.test(oc) && t) out.push({ t, oc: oc.slice(0, 160) });
    });
    return out.slice(0, 30);
  });
  P("\n=== 含课表关键字的 onclick ===");
  menus.forEach((m) => P(`  "${m.t}"  onclick=${m.oc}`));

  // 4) 重试网格接口 8 次，成功就保存完整响应
  let saved = false;
  for (let i = 1; i <= 8; i++) {
    const r = await page.evaluate(async () => {
      const resp = await fetch("/admin/getXsdSykb", {
        method: "POST", credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: "zc=3",
      });
      return { status: resp.status, text: await resp.text() };
    });
    let j = null;
    try { j = JSON.parse(r.text); } catch (e) {}
    if (j && j.ret === 0) {
      fs.writeFileSync(path.join(OUT, "grid-week3.json"), JSON.stringify(j, null, 2), "utf8");
      P(`\n=== 网格接口第 ${i} 次成功，已保存 grid-week3.json (${r.text.length} 字节)`);
      saved = true;
      break;
    }
    P(`网格接口第 ${i} 次: status=${r.status} ${r.text.slice(0, 80)}`);
    await sleep(3000);
  }
  if (!saved) P("\n网格接口 8 次均失败");

  fs.writeFileSync(path.join(__dirname, "findkb-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
