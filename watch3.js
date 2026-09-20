#!/usr/bin/env node
/** 用 Playwright 点真实周次标签，原生捕获响应（不劫持 XHR，避免把页面弄哑） */
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
  const P = (s) => { L.push(s); fs.writeFileSync(path.join(__dirname, "watch3-out.txt"), L.join("\n"), "utf8"); };

  let captured = [];
  page.on("response", async (r) => {
    if (!/getXsdSykb|sdpkkbList/.test(r.url())) return;
    try {
      captured.push({ url: r.url().replace(BASE, ""), status: r.status(), post: r.request().postData() || "", text: await r.text() });
    } catch (e) {}
  });

  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(7000);

  const env = await page.evaluate(() => ({
    hasGetZxkb: typeof window.getZxkb,
    tabs: document.querySelectorAll("#zxkbWeeks > div").length,
    grkbOn: !!document.querySelector(".schoolCanlendar ul li.grkb.on"),
    kbInfoRows: document.querySelectorAll("#kbInfo tr").length,
  }));
  P("环境: " + JSON.stringify(env));

  let saved = 0;
  for (let zc = 1; zc <= 19; zc++) {
    captured = [];
    const sel = `#zxkbWeeks > div:nth-child(${zc})`;
    try {
      await page.evaluate((s) => {
        const el = document.querySelector(s);
        if (el) el.click();
      }, sel);
    } catch (e) { P(`周${zc} 点击异常 ${String(e).slice(0, 60)}`); }
    await sleep(3000);

    const good = captured.find((c) => c.status === 200 && /"ret"\s*:\s*0/.test(c.text));
    if (good) {
      fs.writeFileSync(path.join(OUT, `grid-w${zc}.json`), good.text, "utf8");
      P(`周${zc}: 成功 (${good.text.length} 字节) -> grid-w${zc}.json`);
      saved++;
    } else {
      P(`周${zc}: 请求 ${captured.length} 条，状态 ${captured.map((c) => c.status).join(",") || "无"} post="${(captured[0] || {}).post || ""}"`);
    }
  }
  P(`\n拿到 ${saved}/19 周`);
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
