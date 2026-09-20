#!/usr/bin/env node
/** 只做一件事：调出二维码等你扫码登录，登录态存进 chrome-profile；成功后自动退出 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = "https://gmu.jw.chaoxing.com";
const OUT = path.join(__dirname, "tools", "gmu", "out");
const PROFILE = path.join(OUT, "chrome-profile");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MINUTES = Number(process.argv[2] || 10);

const log = (s) => {
  console.log(s);
  fs.appendFileSync(path.join(__dirname, "qrlog.txt"), s + "\n", "utf8");
};

(async () => {
  fs.writeFileSync(path.join(__dirname, "qrlog.txt"), "", "utf8");
  fs.rmSync(path.join(OUT, "qr-done.txt"), { force: true });

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    headless: true,
    viewport: { width: 1200, height: 820 },
    args: ["--no-first-run", "--no-default-browser-check", "--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    locale: "zh-CN",
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(3500);

  // 切到扫码登录
  for (const t of ["扫码登录", "二维码登录", "扫码"]) {
    try {
      const el = page.locator(`text=${t}`).first();
      if (await el.count()) { await el.click({ timeout: 3000 }); log("已点击「" + t + "」"); break; }
    } catch (e) {}
  }
  await sleep(3000);

  const shotQR = async () => {
    try {
      // 二维码在 iframe 里：直接截 iframe 元素本身（渲染出的就是二维码）
      const iframes = page.locator("iframe");
      const n = await iframes.count();
      for (let i = 0; i < n; i++) {
        const el = iframes.nth(i);
        const src = (await el.getAttribute("src")) || "";
        if (!/qr|code|passport|login|erweima/i.test(src)) continue;
        const box = await el.boundingBox();
        if (box && box.width > 100 && box.height > 100) {
          await el.screenshot({ path: path.join(OUT, "qr.png") });
          return "iframe-elem:" + src.slice(0, 60);
        }
      }
    } catch (e) {}
    try {
      const el = await page.$("iframe");
      if (el) {
        const box = await el.boundingBox();
        if (box && box.width > 100 && box.height > 100) {
          await el.screenshot({ path: path.join(OUT, "qr.png") });
          return "iframe-elem-any";
        }
      }
    } catch (e) {}
    await page.screenshot({ path: path.join(OUT, "qr.png") });
    return "fullpage";
  };

  const how = await shotQR();
  log("二维码已生成: " + path.join(OUT, "qr.png") + "  方式=" + how);

  const deadline = Date.now() + MINUTES * 60 * 1000;
  let last = Date.now();
  let ok = false;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => ({
      url: location.href,
      hasPwd: !!document.querySelector("input[type=password]"),
      body: document.body.innerText.slice(0, 200),
    }));
    if (!st.hasPwd && !/\/admin\/(login|loginFailPage)/i.test(st.url)) { ok = true; log("登录成功 -> " + st.url); break; }
    if (Date.now() - last > 25000) { await shotQR(); last = Date.now(); log("二维码已刷新"); }
    await sleep(2500);
  }

  if (!ok) {
    log("等待扫码超时");
    await ctx.close();
    process.exit(2);
  }

  // 校验：看能不能拿到「当前第几周」，确认会话真的可用
  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000);
  const probe = await page.evaluate(async () => {
    const out = {};
    try {
      const a = await fetch("/admin/api/getXlzc", { credentials: "include" });
      out.xlzc = (await a.text()).slice(0, 80);
    } catch (e) { out.xlzc = "ERR"; }
    try {
      const b = await fetch("/admin/getXsdSykb", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
        body: "zc=3",
      });
      const t = await b.text();
      out.sykb = { status: b.status, head: t.slice(0, 120), len: t.length };
      if (b.status === 200 && t.indexOf('"ret":0') >= 0) {
        out.saved = true;
      }
    } catch (e) { out.sykb = "ERR"; }
    return out;
  });
  log("校验 getXlzc: " + probe.xlzc);
  log("校验 getXsdSykb: " + JSON.stringify(probe.sykb));
  if (probe.sykb && probe.sykb.saved) {
    fs.writeFileSync(path.join(OUT, "grid-w3.json"), await page.evaluate(async () => {
      const r = await fetch("/admin/getXsdSykb", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
        body: "zc=3",
      });
      return await r.text();
    }), "utf8");
    log(">>> 已保存 grid-w3.json");
  }
  fs.writeFileSync(path.join(OUT, "qr-done.txt"), ok ? "OK" : "TIMEOUT", "utf8");
  await ctx.close();
})().catch((e) => { log("[err] " + String(e && e.stack || e)); process.exit(1); });
