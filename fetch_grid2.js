#!/usr/bin/env node
/**
 * 抓课表网格（带重试）。getXsdSykb 偶发 500，需重试 + 放慢节奏。
 * 先探 zc=3，成功再抓全量。
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
  const L = [];
  const P = (s) => { console.log(s); L.push(s); };

  // 从首页发起（此前唯一一次成功的上下文）
  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(6000);

  const st = await page.evaluate(() => ({
    url: location.href, hasPwd: !!document.querySelector('input[type=password]'),
  }));
  P("登录检查: url=" + st.url + " hasPwd=" + st.hasPwd);
  if (st.hasPwd) {
    P("!! 登录态失效");
    fs.writeFileSync(path.join(__dirname, "grid2-out.txt"), L.join("\n"), "utf8");
    await ctx.close();
    return;
  }

  // 带重试抓某一周
  const fetchWeek = (zc, tries) => page.evaluate(async ({ zc, tries }) => {
    let last = null;
    for (let i = 0; i < tries; i++) {
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
      try { j = JSON.parse(t); } catch (e) {}
      if (j && j.ret === 0) return { ok: true, attempt: i + 1, data: j };
      last = { status: r.status, head: t.slice(0, 120) };
      await new Promise((res) => setTimeout(res, 1500));
    }
    return { ok: false, last };
  }, { zc, tries });

  const probe = await fetchWeek(3, 4);
  P("zc=3 探测: ok=" + probe.ok + " " + JSON.stringify(probe.ok ? { attempt: probe.attempt } : probe.last));

  if (!probe.ok) {
    fs.writeFileSync(path.join(__dirname, "grid2-out.txt"), L.join("\n"), "utf8");
    await ctx.close();
    return;
  }

  // 全量抓 1..20
  const grid = {};
  grid[3] = { ok: true, data: probe.data };
  for (let zc = 1; zc <= 20; zc++) {
    if (zc === 3) continue;
    const r = await fetchWeek(zc, 4);
    grid[zc] = r.ok ? { ok: true, data: r.data } : { ok: false, last: r.last };
    P("周" + zc + ": " + (r.ok ? "OK(第" + r.attempt + "次)" : "FAIL"));
    await sleep(800);
  }

  fs.writeFileSync(path.join(OUT, "grid-raw.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString(), grid }, null, 2), "utf8");
  const okCount = Object.values(grid).filter((x) => x.ok).length;
  P("成功周数 = " + okCount);
  fs.writeFileSync(path.join(__dirname, "grid2-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
