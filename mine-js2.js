#!/usr/bin/env node
/** 把所有 JS 里出现 getXsdSykb / sdpkkbList / getGrkbInfo 的上下文整段拖出来 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = "https://gmu.jw.chaoxing.com";
const OUT = path.join(__dirname, "tools", "gmu", "out");
const PROFILE = path.join(OUT, "chrome-profile");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEYS = ["getXsdSykb", "sdpkkbList", "getGrkbInfo", "getZxkb", "printXskb", "print", "export"];

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
  const P = (s) => { L.push(s); fs.writeFileSync(path.join(__dirname, "mine2-out.txt"), L.join("\n"), "utf8"); };

  const grab = async (url, label) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(6000);
    const res = await page.evaluate(async (keys) => {
      const srcs = new Set();
      document.querySelectorAll("script[src]").forEach((s) => srcs.add(s.getAttribute("src")));
      const bodies = [];
      document.querySelectorAll("script:not([src])").forEach((s, i) => bodies.push({ src: "#inline" + i, body: s.textContent || "" }));
      for (const u of srcs) {
        try { bodies.push({ src: u.replace(location.origin, ""), body: await (await fetch(u, { credentials: "include" })).text() }); }
        catch (e) { bodies.push({ src: u, body: "" }); }
      }
      const out = [];
      for (const b of bodies) {
        for (const k of keys) {
          let i = b.body.indexOf(k);
          while (i >= 0) {
            out.push({ key: k, src: b.src, snippet: b.body.slice(Math.max(0, i - 700), i + 500).replace(/\n{2,}/g, "\n") });
            i = b.body.indexOf(k, i + 1);
            if (out.filter((o) => o.key === k).length > 3) break;
          }
        }
      }
      // 兜底：函数实现
      for (const fn of ["getGrkbInfo", "getZxkb"]) {
        const f = window[fn];
        if (typeof f === "function") out.push({ key: "FN:" + fn, src: "window", snippet: f.toString().slice(0, 2500) });
      }
      return out;
    }, KEYS);
    P(`\n########## ${label} ##########`);
    res.forEach((r) => P(`\n--- [${r.key}] @ ${r.src} ---\n${r.snippet}`));
  };

  await grab(`${BASE}/admin/pkgl/xskb/queryKbForXsd?xnxq=2026-2027-1`, "学生课表页");
  await grab(`${BASE}/admin?sfjrxk=1`, "首页");

  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
