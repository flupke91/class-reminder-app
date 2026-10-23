#!/usr/bin/env node
/** 后台重试 getXsdSykb，成功即保存；同时挖「打印」等其它课表入口 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = "https://gmu.jw.chaoxing.com";
const OUT = path.join(__dirname, "tools", "gmu", "out");
const PROFILE = path.join(OUT, "chrome-profile");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRIES = Number(process.argv[2] || 30);
const GAP = Number(process.argv[3] || 45000);

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
  const P = (s) => { L.push(s); console.log(s); fs.writeFileSync(path.join(__dirname, "retry-grid-out.txt"), L.join("\n"), "utf8"); };

  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000);

  // 挖打印入口
  const prints = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("*").forEach((el) => {
      const oc = el.getAttribute("onclick") || "";
      const t = (el.innerText || "").trim().slice(0, 10);
      if (/print|打印|dy/i.test(oc) && t) out.push({ t, oc: oc.slice(0, 160) });
    });
    return out.slice(0, 15);
  });
  P("=== 打印相关 onclick ===");
  prints.forEach((p) => P(`  "${p.t}" ${p.oc}`));

  const call = (zc) => page.evaluate(async (z) => {
    const r = await fetch("/admin/getXsdSykb", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
      body: "zc=" + z,
    });
    return { status: r.status, text: await r.text() };
  }, zc);

  let done = 0;
  for (let i = 1; i <= TRIES && done < 19; i++) {
    for (let zc = 3; zc <= 3; zc++) { // 先确保第 3 周
      const r = await call(zc);
      let ok = false;
      try { ok = JSON.parse(r.text).ret === 0; } catch (e) {}
      if (ok) {
        fs.writeFileSync(path.join(OUT, "grid-week3.json"), r.text, "utf8");
        P(`[${new Date().toISOString()}] 第${i}轮 zc=3 成功，已保存 grid-week3.json`);
        break;
      }
      P(`[${new Date().toISOString()}] 第${i}轮 zc=3 -> ${r.status}`);
    }
    // 顺带试 1..19 周（若第 3 周已通则批量抓）
    if (fs.existsSync(path.join(OUT, "grid-week3.json"))) {
      for (let zc = 1; zc <= 19; zc++) {
        if (fs.existsSync(path.join(OUT, `grid-w${zc}.json`))) continue;
        const r = await call(zc);
        let ok = false;
        try { ok = JSON.parse(r.text).ret === 0; } catch (e) {}
        if (ok) { fs.writeFileSync(path.join(OUT, `grid-w${zc}.json`), r.text, "utf8"); done++; P(`  周${zc} OK`); }
        else P(`  周${zc} -> ${r.status}`);
        await sleep(1500);
      }
      break;
    }
    await sleep(GAP);
  }
  P("结束");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
