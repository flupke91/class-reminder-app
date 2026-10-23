#!/usr/bin/env node
/** 长时间轮询：反复打开首页，若课表组件渲染出来就点周次标签抓 19 周；否则直接 POST 试探 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = "https://gmu.jw.chaoxing.com";
const OUT = path.join(__dirname, "tools", "gmu", "out");
const PROFILE = path.join(OUT, "chrome-profile");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUNDS = Number(process.argv[2] || 60);
const GAPMS = Number(process.argv[3] || 90000);

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
  const P = (s) => { L.push(s); fs.writeFileSync(path.join(__dirname, "watcher-out.txt"), L.join("\n"), "utf8"); };

  let captured = [];
  page.on("response", async (r) => {
    if (!/getXsdSykb|sdpkkbList/.test(r.url())) return;
    try { captured.push({ url: r.url().replace(BASE, ""), status: r.status(), text: await r.text() }); } catch (e) {}
  });

  const have = (zc) => fs.existsSync(path.join(OUT, `grid-w${zc}.json`));

  for (let round = 1; round <= ROUNDS; round++) {
    const missing = [];
    for (let z = 1; z <= 19; z++) if (!have(z)) missing.push(z);
    if (!missing.length) { P("全部 19 周已到手，结束"); break; }

    try {
      await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await sleep(6000);
      const env = await page.evaluate(() => ({
        tabs: document.querySelectorAll("#zxkbWeeks > div").length,
        fn: typeof window.getZxkb,
        rows: document.querySelectorAll("#kbInfo tr").length,
      }));

      if (env.tabs > 0) {
        P(`[轮${round}] 组件已渲染 tabs=${env.tabs} getZxkb=${env.fn} rows=${env.rows} —— 逐周点击`);
        for (const zc of missing) {
          captured = [];
          await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.click(); }, `#zxkbWeeks > div:nth-child(${zc})`);
          await sleep(2500);
          const good = captured.find((c) => c.status === 200 && /"ret"\s*:\s*0/.test(c.text));
          if (good) {
            fs.writeFileSync(path.join(OUT, `grid-w${zc}.json`), good.text, "utf8");
            P(`   周${zc} OK (${good.text.length} 字节)`);
          } else {
            P(`   周${zc} 失败 status=${captured.map((c) => c.status).join(",") || "无请求"}`);
          }
        }
      } else {
        const r = await page.evaluate(async () => {
          const resp = await fetch("/admin/getXsdSykb", {
            method: "POST", credentials: "include",
            headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
            body: "zc=" + 3,
          });
          return { status: resp.status, head: (await resp.text()).slice(0, 90) };
        });
        P(`[轮${round}] 组件未渲染(tabs=0) 直连 -> ${r.status} ${r.head}`);
      }
    } catch (e) {
      P(`[轮${round}] 异常 ${String(e).slice(0, 100)}`);
    }
    await sleep(GAPMS);
  }

  const got = [];
  for (let z = 1; z <= 19; z++) if (have(z)) got.push(z);
  P(`\n结束，已拿到 ${got.length}/19 周: [${got.join(",")}]`);
  await ctx.close();
})().catch((e) => { fs.writeFileSync(path.join(__dirname, "watcher-fail.txt"), String(e && e.stack || e), "utf8"); process.exit(1); });
