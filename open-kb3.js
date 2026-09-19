#!/usr/bin/env node
/** 深挖课表页：表单控件、getXsdSykb 调用参数、切换周次后的网格 */
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
  const P = (s) => { L.push(s); console.log(s); };

  const net = [];
  page.on("response", async (resp) => {
    const u = resp.url();
    if (!/gmu\.jw\.chaoxing\.com/.test(u)) return;
    if (/\.(js|css|png|jpg|gif|woff|svg|ico)/.test(u)) return;
    let body = "";
    try { body = (await resp.text()).slice(0, 400); } catch (e) {}
    net.push({
      method: resp.request().method(),
      url: u.replace(BASE, ""),
      post: (resp.request().postData() || "").slice(0, 300),
      status: resp.status(),
      body,
    });
  });

  await page.goto(`${BASE}/admin/pkgl/xskb/queryKbForXsd?xnxq=2026-2027-1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000);

  // 1) 表单控件
  const ctrls = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("select,input").forEach((el) => {
      const id = el.id || el.name || "";
      const opts = el.tagName === "SELECT"
        ? [...el.options].slice(0, 25).map((o) => o.value + ":" + o.text.trim().slice(0, 12))
        : [];
      out.push({ tag: el.tagName, id, type: el.type || "", value: el.value || "", opts });
    });
    return out;
  });
  P("=== 表单控件 ===");
  ctrls.forEach((c) => P(`${c.tag}#${c.id} type=${c.type} value=${c.value}\n     opts=${c.opts.join(" , ")}`));

  // 2) 页面脚本里 getXsdSykb / getGrkbInfo 的上下文
  const js = await page.evaluate(() => {
    const hits = [];
    for (const s of document.querySelectorAll("script")) {
      const t = s.textContent || "";
      const i = t.indexOf("getXsdSykb");
      if (i >= 0) hits.push("…" + t.slice(Math.max(0, i - 900), i + 500) + "…");
      const j = t.indexOf("function getGrkbInfo");
      if (j >= 0) hits.push("---getGrkbInfo---\n" + t.slice(j, j + 900));
    }
    return hits.slice(0, 4);
  });
  P("\n=== 页面脚本中 getXsdSykb 上下文 ===");
  js.forEach((h) => P(h.replace(/\n{2,}/g, "\n")));

  // 3) 直接调用页面自己的函数拿周课表（选周次 3）
  P("\n=== 尝试 select 周次=3 ===");
  const sel = await page.evaluate(() => {
    const s = [...document.querySelectorAll("select")].map((e) => ({ id: e.id, name: e.name }));
    return s;
  });
  P("select 列表: " + JSON.stringify(sel));

  for (const cand of ["zc", "zcList", "zxzc", "zdzc"]) {
    try {
      const ok = await page.evaluate((c) => {
        const el = document.getElementById(c) || document.querySelector(`select[name="${c}"]`);
        if (!el) return "no-elem";
        el.value = "3";
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return "set:" + el.value;
      }, cand);
      P(`  ${cand} -> ${ok}`);
    } catch (e) { P(`  ${cand} -> err ${String(e).slice(0, 60)}`); }
  }
  await sleep(4000);

  // 4) 再次读取网格
  const grid = await page.evaluate(() => {
    const t = document.querySelector("table");
    if (!t) return null;
    return [...t.querySelectorAll("tr")].map((tr) =>
      [...tr.querySelectorAll("th,td")].map((td) => (td.innerText || "").trim().replace(/\s+/g, " ")));
  });
  if (grid) {
    P("\n--- 切换后网格 ---");
    grid.forEach((r) => P(r.join(" | ")));
  }

  P("\n=== 全部 XHR ===");
  net.forEach((n) => P(`${n.method} ${n.status} ${n.url}\n     post=${n.post}\n     ${n.body.replace(/\s+/g, " ").slice(0, 250)}`));

  fs.writeFileSync(path.join(OUT, "kb-net2.json"), JSON.stringify(net, null, 2), "utf8");
  fs.writeFileSync(path.join(__dirname, "openkb3-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
