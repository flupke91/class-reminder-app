#!/usr/bin/env node
/** 劫持 XHR/fetch 记录调用栈；再点真实「N周」标签走 UI 路径触发课表请求 */
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
  const P = (s) => { L.push(s); fs.writeFileSync(path.join(__dirname, "watchkb-out.txt"), L.join("\n"), "utf8"); };

  await page.addInitScript(() => {
    window.__reqs = [];
    const rec = (o) => { window.__reqs.push(o); };
    const OldXHR = window.XMLHttpRequest;
    function Patched() {
      const x = new OldXHR();
      const stack = new Error().stack || "";
      let method = "", url = "", body = "";
      const open = x.open;
      x.open = function (m, u, ...rest) { method = m; url = String(u); return open.call(x, m, u, ...rest); };
      const send = x.send;
      x.send = function (b) {
        body = typeof b === "string" ? b : "";
        const done = () => rec({ kind: "xhr", method, url, body, status: x.status, resp: (x.responseText || "").slice(0, 200), stack });
        x.addEventListener("loadend", done);
        return send.call(x, b);
      };
      return x;
    }
    window.XMLHttpRequest = Patched;
    const of = window.fetch;
    window.fetch = function (...a) {
      const stack = new Error().stack || "";
      return of.apply(this, a).then((r) => {
        try {
          r.clone().text().then((t) => rec({
            kind: "fetch",
            method: (a[1] && a[1].method) || "GET",
            url: String(a[0]), body: a[1] && a[1].body ? String(a[1].body) : "",
            status: r.status, resp: t.slice(0, 200), stack,
          }));
        } catch (e) {}
        return r;
      });
    };
  });

  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(7000);

  // 点真实周次标签
  P("=== 点击周次标签 ===");
  for (const zc of [3, 1, 2, 4, 5]) {
    await page.evaluate((z) => {
      window.__reqs = [];
      const tabs = document.querySelectorAll("#zxkbWeeks>div");
      const el = tabs[z - 1] || document.querySelector(`[onclick="getZxkb(${z},this)"]`);
      if (el && typeof getZxkb === "function") getZxkb(z, el);
      else if (typeof getZxkb === "function") getZxkb(z, document.createElement("div"));
    }, zc);
    await sleep(3500);
    const reqs = await page.evaluate(() => window.__reqs.filter((r) => /kb|Kb/i.test(r.url)));
    P(`\n--- 第${zc}周 -> ${reqs.length} 条课表相关请求 ---`);
    reqs.forEach((r) => P(`  ${r.kind} ${r.method} ${r.status} ${r.url.replace(location.origin, "")} body="${r.body}"\n      resp=${String(r.resp).slice(0, 100)}\n      stack=${String(r.stack).split("\n").slice(1, 4).join(" <- ").trim()}`));
    const ok = reqs.find((r) => r.kind === "xhr" && /"ret":0/.test(String(r.resp)));
    if (ok) {
      const full = await page.evaluate(async (u) => {
        const r = await fetch(u.u, { method: u.m, credentials: "include", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" }, body: u.b });
        return await r.text();
      }, { u: ok.url, m: ok.method, b: ok.body });
      fs.writeFileSync(path.join(OUT, `grid-w${zc}.json`), full, "utf8");
      P(`  >>> 成功，已存 grid-w${zc}.json (${full.length} 字节)`);
    }
  }

  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
