#!/usr/bin/env node
/** 抓取权威课表网格 getXsdSykb：只用 zc=N（多余参数会导致 500），逐周重试 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = "https://gmu.jw.chaoxing.com";
const OUT = path.join(__dirname, "tools", "gmu", "out");
const DIR = path.join(OUT, "grid");
const PROFILE = path.join(OUT, "chrome-profile");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MAX_WEEK = Number(process.argv[2] || 20);

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

  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000);
  P("url=" + page.url());

  const call = (zc) =>
    page.evaluate(async (zc) => {
      const r = await fetch("/admin/getXsdSykb", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: "zc=" + zc,
      });
      const t = await r.text();
      return { status: r.status, text: t };
    }, zc);

  const summary = [];
  let okCount = 0;
  for (let zc = 1; zc <= MAX_WEEK; zc++) {
    let done = false;
    for (let att = 1; att <= 6 && !done; att++) {
      try {
        const r = await call(zc);
        let j = null;
        try { j = JSON.parse(r.text); } catch (e) {}
        if (j && j.ret === 0 && j.data && Array.isArray(j.data.jcKcxx)) {
          fs.writeFileSync(path.join(DIR, `week-${zc}.json`), JSON.stringify(j, null, 2), "utf8");
          const n = j.data.jcKcxx.reduce(
            (a, p) => a + p.kbxx.reduce((b, d) => b + (d.kcxx ? d.kcxx.length : 0), 0), 0);
          P(`周${zc}: OK (第${att}次) 节次=${j.data.jcKcxx.length} 课程格=${n}`);
          summary.push({ zc, ok: true, cells: n });
          okCount++;
          done = true;
        } else {
          if (att === 6) {
            P(`周${zc}: FAIL status=${r.status} ${r.text.slice(0, 90)}`);
            summary.push({ zc, ok: false, status: r.status });
          }
        }
      } catch (e) {
        if (att === 6) { P(`周${zc}: ERR ${String(e).slice(0, 90)}`); summary.push({ zc, ok: false, err: String(e).slice(0, 80) }); }
      }
      if (!done) await sleep(2500);
    }
    await sleep(1200);
  }

  P(`\n成功 ${okCount}/${MAX_WEEK} 周`);
  fs.writeFileSync(path.join(OUT, "grid-summary.json"), JSON.stringify(summary, null, 2), "utf8");
  fs.writeFileSync(path.join(__dirname, "grid3-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
