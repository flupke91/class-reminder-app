#!/usr/bin/env node
/** 挖教务系统前端 JS 里所有和课表有关的接口 URL */
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
  const P = (s) => { L.push(s); console.log(s); fs.writeFileSync(path.join(__dirname, "mine-out.txt"), L.join("\n"), "utf8"); };

  const mine = async (url, label) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(6000);
    // 页面上所有 script（外链 + 内联）
    const res = await page.evaluate(async () => {
      const urls = new Set();
      const inline = [];
      document.querySelectorAll("script[src]").forEach((s) => urls.add(s.getAttribute("src")));
      document.querySelectorAll("script:not([src])").forEach((s) => inline.push(s.textContent || ""));

      const texts = [];
      for (const u of urls) {
        try {
          const r = await fetch(u, { credentials: "include" });
          texts.push({ src: u, body: await r.text() });
        } catch (e) { texts.push({ src: u, body: "" }); }
      }
      inline.forEach((b, i) => texts.push({ src: "#inline" + i, body: b }));

      const RE = /["'`]([^"'`\s]*\/(?:admin|xsd|pkgl)[^"'`\s]{2,90})["'`]/g;
      const KB = /kb|Kb|KB|课表|print|print|export|dc|Sykb|xskb/i;
      const hits = [];
      for (const t of texts) {
        let m;
        RE.lastIndex = 0;
        while ((m = RE.exec(t.body)) !== null) {
          const v = m[1];
          if (KB.test(v) || /kb/i.test(t.src)) {
            const ctxStart = Math.max(0, m.index - 120);
            hits.push({ url: v, src: t.src.replace(location.origin, ""), ctx: t.body.slice(ctxStart, m.index + v.length + 60).replace(/\s+/g, " ") });
          }
        }
      }
      const seen = new Set();
      return hits.filter((h) => { const k = h.url; if (seen.has(k)) return false; seen.add(k); return true; });
    });
    P(`\n===== ${label} =====`);
    res.forEach((h) => P(`  ${h.url}\n      @ ${h.src}\n      …${h.ctx}…`));
    return res;
  };

  await mine(`${BASE}/admin?sfjrxk=1`, "首页");
  await mine(`${BASE}/admin/pkgl/xskb/queryKbForXsd?xnxq=2026-2027-1`, "学生课表页");

  fs.writeFileSync(path.join(__dirname, "mine-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
