#!/usr/bin/env node
/** 有头模式打开登录页二维码等你扫；登录成功后立刻把 1~19 周权威课表网格抓下来 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = "https://gmu.jw.chaoxing.com";
const OUT = path.join(__dirname, "tools", "gmu", "out");
const PROFILE = path.join(OUT, "chrome-profile");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MINUTES = Number(process.argv[2] || 15);

const log = (s) => {
  console.log(s);
  try { fs.appendFileSync(path.join(__dirname, "loginlog.txt"), s + "\n", "utf8"); } catch (e) {}
};

(async () => {
  fs.writeFileSync(path.join(__dirname, "loginlog.txt"), "", "utf8");
  fs.rmSync(path.join(OUT, "login-done.txt"), { force: true });

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    headless: false,
    viewport: null,
    args: ["--no-first-run", "--no-default-browser-check", "--start-maximized", "--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    locale: "zh-CN",
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(3000);

  for (const t of ["扫码登录", "二维码登录", "扫码"]) {
    try {
      const el = page.locator(`text=${t}`).first();
      if (await el.count()) { await el.click({ timeout: 4000 }); log("已切到「" + t + "」"); break; }
    } catch (e) {}
  }
  await sleep(3000);
  try { await page.bringToFront(); } catch (e) {}
  log("窗口已打开，请用学习通 App 扫码（最多等 " + MINUTES + " 分钟）");

  const deadline = Date.now() + MINUTES * 60 * 1000;
  let ok = false;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => ({
      url: location.href,
      hasPwd: !!document.querySelector("input[type=password]"),
    }));
    if (!st.hasPwd && !/\/admin\/(login|loginFailPage)/i.test(st.url)) { ok = true; log("登录成功 -> " + st.url); break; }
    await sleep(2500);
  }

  if (!ok) {
    log("等待扫码超时");
    fs.writeFileSync(path.join(OUT, "login-done.txt"), "TIMEOUT", "utf8");
    await ctx.close();
    process.exit(2);
  }

  // ---- 登录成功，立刻抓权威网格 ----
  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(6000);

  const grab = async (zc) => page.evaluate(async (z) => {
    const r = await fetch("/admin/getXsdSykb", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
      body: "zc=" + z,
    });
    return { status: r.status, text: await r.text() };
  }, zc);

  let got = 0;
  for (let zc = 1; zc <= 19; zc++) {
    for (let att = 1; att <= 4; att++) {
      const r = await grab(zc);
      let j = null;
      try { j = JSON.parse(r.text); } catch (e) {}
      if (j && j.ret === 0) {
        fs.writeFileSync(path.join(OUT, `grid-w${zc}.json`), r.text, "utf8");
        const cells = (j.data?.jcKcxx || []).reduce((a, p) => a + (p.kbxx || []).reduce((b, d) => b + ((d.kcxx || []).length), 0), 0);
        log(`周${zc}: OK 节次${(j.data?.jcKcxx || []).length} 课程格${cells}`);
        got++;
        break;
      }
      if (att === 4) log(`周${zc}: 失败 status=${r.status} ${r.text.slice(0, 60)}`);
      await sleep(2000);
    }
    await sleep(1200);
  }

  log(`\n共拿到 ${got}/19 周`);
  fs.writeFileSync(path.join(OUT, "login-done.txt"), got ? "OK " + got : "OK 0", "utf8");
  log("浏览器将在 20 秒后关闭");
  await sleep(20000);
  await ctx.close();
})().catch((e) => { log("[err] " + String(e && e.stack || e)); process.exit(1); });
