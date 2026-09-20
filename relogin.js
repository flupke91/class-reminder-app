#!/usr/bin/env node
/** 检查登录态：是否被登出、caslogin 能否续期、登录页有没有记住我/自动填充 */
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
  const P = (s) => { L.push(s); fs.writeFileSync(path.join(__dirname, "relogin-out.txt"), L.join("\n"), "utf8"); };

  // 0) cookie 概览
  const cookies = await ctx.cookies();
  P("=== cookie ===");
  cookies.filter((c) => /chaoxing/.test(c.domain)).forEach((c) =>
    P(`  ${c.name} domain=${c.domain} path=${c.path} 过期=${c.expires} httpOnly=${c.httpOnly} len=${(c.value || "").length}`));

  // 1) 首页是否被踢
  await page.goto(`${BASE}/admin?sfjrxk=1`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(4000);
  P("\n首页 -> " + page.url());

  // 2) caslogin 能否续期
  await page.goto(`${BASE}/admin/caslogin`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(5000);
  P("caslogin -> " + page.url());
  const body = await page.evaluate(() => document.body.innerText.slice(0, 300).replace(/\n+/g, " | "));
  P("  body: " + body);

  // 3) 登录页结构
  await page.goto(`${BASE}/admin/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await sleep(3000);
  const form = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll("input")].map((i) => ({
      id: i.id, name: i.name, type: i.type, value: (i.value || "").slice(0, 20), ph: i.placeholder || "",
    }));
    const btns = [...document.querySelectorAll("button,a")].map((b) => (b.innerText || "").trim()).filter(Boolean).slice(0, 12);
    return { url: location.href, inputs, btns };
  });
  P("\n=== 登录页 ===");
  P("url=" + form.url);
  form.inputs.forEach((i) => P(`  input#${i.id} name=${i.name} type=${i.type} value="${i.value}" ph="${i.ph}"`));
  P("  按钮: " + form.btns.join(" / "));

  fs.writeFileSync(path.join(__dirname, "relogin-out.txt"), L.join("\n"), "utf8");
  await ctx.close();
})().catch((e) => { console.error("[err]", e); process.exit(1); });
