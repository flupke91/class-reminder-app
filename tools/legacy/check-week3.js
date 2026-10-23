#!/usr/bin/env node
/** 拉取「第 3 周」的真实课表：先试课表网格接口，再点进「主修课表」页面 */
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
  await sleep(4000);

  // ---- A. 课表网格接口：逐周试，重点看 zc=3 ----
  const apiRes = await page.evaluate(async () => {
    const out = [];
    for (const zc of [3]) {
      for (const body of [`zc=${zc}`, `zc=${zc}&xnxq=2026-2027-1`, `zc=${zc}&xnxq=2026-2027-1&xszxm=`]) {
        try {
          const r = await fetch("/admin/getXsdSykb", {
            method: "POST", credentials: "include",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-Requested-With": "XMLHttpRequest",
            },
            body,
          });
          const t = await r.text();
          out.push({ body, status: r.status, len: t.length, head: t.slice(0, 500) });
        } catch (e) { out.push({ body, err: String(e) }); }
      }
    }
    return out;
  });
  P("=== A. getXsdSykb(zc=3) 接口 ===");
  apiRes.forEach((x) => P("  " + JSON.stringify(x).slice(0, 600)));

  // ---- B. 点进「主修课表」页面 ----
  let navOk = false;
  try {
    const el = page.locator("text=主修课表").first();
    if (await el.count()) {
      await el.click({ timeout: 8000 });
      await sleep(5000);
      navOk = true;
    }
  } catch (e) { P("点击主修课表失败: " + String(e).slice(0, 120)); }

  if (navOk) {
    // 可能开了新标签页
    const pages = ctx.pages();
    const target = pages.length > 1 ? pages[pages.length - 1] : page;
    await target.waitForLoadState("domcontentloaded").catch(() => {});
    await sleep(3000);
    const info = await target.evaluate(() => ({
      url: location.href,
      title: document.title,
      text: document.body.innerText.slice(0, 2500).replace(/\n{2,}/g, "\n"),
    }));
    P("\n=== B. 主修课表页面 ===");
    P("url=" + info.url);
    P("title=" + info.title);
    P("--- 页面文本 ---");
    P(info.text);
  }

  fs.writeFileSync(path.join(__dirname, "week3-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
