#!/usr/bin/env node
/**
 * 抓取教务系统权威课表网格：POST /admin/getXsdSykb  body=zc=N
 * 产出 out/grid-raw.json（第 1..19 周原始响应）
 * 关键：body 只传 zc，多传参数会 500
 */
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

  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(4000);

  const grid = await page.evaluate(async () => {
    const res = {};
    for (let zc = 1; zc <= 20; zc++) {
      try {
        const r = await fetch("/admin/getXsdSykb", {
          method: "POST", credentials: "include",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: "zc=" + zc,
        });
        const t = await r.text();
        let j = null;
        try { j = JSON.parse(t); } catch (e) { /* not json */ }
        res[zc] = { status: r.status, ok: !!(j && j.ret === 0), data: j };
      } catch (e) {
        res[zc] = { status: -1, ok: false, err: String(e) };
      }
    }
    return res;
  });

  const okCount = Object.values(grid).filter((x) => x.ok).length;
  fs.writeFileSync(path.join(OUT, "grid-raw.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString(), grid }, null, 2), "utf8");
  console.log("抓取完成，成功周数 = " + okCount);
  console.log("保存: " + path.join(OUT, "grid-raw.json"));
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
