#!/usr/bin/env node
/**
 * 赣南医科大学 教务系统（超星平台）课表抓取
 *
 *   用法: node tools/gmu/fetch_timetable.js
 *   依赖: npm i playwright-core   （用系统已装的 Chrome，不额外下载 Chromium）
 *
 * 流程：
 *   1. 打开 https://gmu.jw.chaoxing.com/admin/login ，优先切到「扫码登录」
 *   2. 把二维码截图到 out/qr.png，等你用学习通 App 扫码；轮询直到登录成功
 *   3. 登录后一次拿到本学期全部已选课程（含 sksjdd 上课时间地点）
 *   4. 顺便用 getXqByZc 定位「今天是第几周」，供推算学期开始日期
 *   5. 原始响应写到 out/raw-timetable.json
 *
 * 登录态保存在 out/chrome-profile，第二次运行通常不用再扫码。
 */
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BASE = "https://gmu.jw.chaoxing.com";
const LOGIN_URL = `${BASE}/admin/login`;
const HOME_URL = `${BASE}/admin?sfjrxk=1`;

const OUT = process.env.GMU_OUT || path.join(__dirname, "out");
const PROFILE = path.join(OUT, "chrome-profile");
fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ];
  return candidates.find((p) => fs.existsSync(p));
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    console.error("没找到 Chrome，请设置环境变量 CHROME_PATH 指向浏览器可执行文件");
    process.exit(1);
  }

  const ctx = await chromium.launchPersistentContext(PROFILE, {
    executablePath: chrome,
    headless: false,
    viewport: { width: 1400, height: 950 },
    args: ["--no-first-run", "--no-default-browser-check", "--disable-blink-features=AutomationControlled"],
    ignoreDefaultArgs: ["--enable-automation"],
    locale: "zh-CN",
  });
  const page = ctx.pages()[0] || (await ctx.newPage());

  // ---------- 1. 登录 ----------
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3000);

  const looksLoggedIn = async () =>
    page.evaluate(() => ({
      url: location.href,
      hasPwd: !!document.querySelector('input[type=password]'),
      body: document.body.innerText.slice(0, 400),
    }));

  let st = await looksLoggedIn();
  if (st.hasPwd) {
    // 切到扫码登录
    for (const t of ["扫码登录", "二维码登录", "扫码"]) {
      try {
        const el = page.locator(`text=${t}`).first();
        if (await el.count()) {
          await el.click({ timeout: 3000 });
          break;
        }
      } catch (e) { /* 没有这个标签就算了 */ }
    }
    await page.waitForTimeout(2500);

    const qrPath = path.join(OUT, "qr.png");
    await page.screenshot({ path: qrPath });
    console.log(`\n请用学习通 App 扫描二维码登录：${qrPath}\n`);

    const deadline = Date.now() + 8 * 60 * 1000;
    let lastShot = 0;
    let ok = false;
    while (Date.now() < deadline) {
      st = await looksLoggedIn();
      // 登录成功后会跳到学生端页面，且不再有密码框
      if (!st.hasPwd && !/\/admin\/login/i.test(st.url)) { ok = true; break; }
      if (Date.now() - lastShot > 20000) { // 二维码会刷新，定期重截
        await page.screenshot({ path: qrPath });
        lastShot = Date.now();
      }
      await sleep(2000);
    }
    if (!ok) {
      console.error("等待扫码超时");
      await ctx.close();
      process.exit(2);
    }
  }
  console.log("登录成功：", await page.title());

  // ---------- 2. 拿已选课程（一次拿到整个学期的上课时间地点） ----------
  await page.goto(`${BASE}/admin/xsd/yxkccx`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(5000);

  const fields = [
    "id", "parentId", "kcid", "xnxq", "xdxz", "xdfs", "kcbh", "kcjj", "kcbz", "jxbmc", "jxbbh",
    "zxs", "llxs", "syxs", "shangjxs", "shijianxs", "qtxs", "jxbzc", "kclb", "kcxz", "type",
    "kclx", "kcgs", "rkjs", "jxms", "sksjdd", "xf", "skfs", "xkfs", "xklx",
  ].join(",");
  const body = `queryFields=${fields}&_search=false&nd=${Date.now()}&page.size=10000&page.pn=1&sort=id`;

  const resp = await page.evaluate(async (b) => {
    const r = await fetch("/admin/xsd/yxkccx/listYxkc?gridtype=jqgrid&async=1", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
      body: b,
    });
    return { status: r.status, text: await r.text() };
  }, body);

  if (resp.status !== 200) {
    console.error("抓取已选课程失败:", resp.status, resp.text.slice(0, 200));
    await ctx.close();
    process.exit(3);
  }
  const timetable = JSON.parse(resp.text);
  console.log(`已选课程 ${timetable.total} 门，学期 ${[...new Set(timetable.results.map((r) => r.xnxq))].join(",")}`);

  // ---------- 3. 定位今天是第几周（用来推算学期开始日期） ----------
  const weekInfo = await page.evaluate(async () => {
    for (let zc = 1; zc <= 25; zc += 1) {
      try {
        const r = await fetch("/admin/getXqByZc", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: "zc=" + zc,
        });
        const j = await r.json();
        if (j.ret !== 0 || !Array.isArray(j.data)) return null;
        if (j.data.some((d) => d.sfdt)) return { zc, days: j.data }; // sfdt = 今天
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  const result = { fetchedAt: new Date().toISOString(), timetable, weekInfo };
  const outFile = path.join(OUT, "raw-timetable.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");

  if (weekInfo) {
    console.log(`今天 = 第 ${weekInfo.zc} 周（周一 ${weekInfo.days[0].date}）`);
  } else {
    console.log("没能自动定位当前周次，导入后请在 App 里手动校准");
  }
  console.log(`\n原始数据已写入 ${outFile}`);
  console.log("下一步: python tools/gmu/parse_timetable.py");

  await ctx.close();
}

main().catch((e) => {
  console.error("[error]", e);
  process.exit(1);
});
