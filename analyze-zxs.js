#!/usr/bin/env node
/** 用「总学时 zxs」对账 sksjdd 实际排出的学时，量化缺了多少课 */
const fs = require("fs");
const path = require("path");
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "tools", "gmu", "out", "raw-timetable.json"), "utf8"));
const rows = raw.timetable && raw.timetable.results ? raw.timetable.results : raw.results || [];

const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7 };
function parseSksjdd(s) {
  // 返回 [{weeks:[], day, p1, p2, room}]
  const out = [];
  if (!s) return out;
  for (const block of s.split(";")) {
    // 每段内用「,」分，但周次里也可能有逗号（第1-2周 / 第3-4,8周 / 第4,7周）
    // 先按【地点】拆出教室（每段最多一个）
    const m = block.match(/【([^】]*)】/);
    const room = m ? m[1] : "";
    for (const seg of block.split(",")) {
      const g = seg.match(/第([\d\-,\u4e00-\u9fa5]*?)周\s*星期([\u4e00-\u9fa5])\s*(\d+)\s*-\s*(\d+)\s*节/);
      if (!g) continue;
      const weeks = [];
      for (const part of g[1].split(",")) {
        const rg = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (rg) { for (let i = +rg[1]; i <= +rg[2]; i++) weeks.push(i); }
        else if (/^\d+$/.test(part)) weeks.push(+part);
      }
      if (!weeks.length) continue;
      out.push({ weeks, day: CN[g[2]] || 0, p1: +g[3], p2: +g[4], room });
    }
  }
  return out;
}

const out = [];
let sumNeed = 0, sumGot = 0;
out.push("课程".padEnd(22) + " 总学时  已排学时  缺口   明细(周次×节数)");
out.push("-".repeat(90));
for (const r of rows) {
  const pts = parseSksjdd(r.sksjdd || "");
  let got = 0;
  const detail = [];
  for (const p of pts) {
    const n = p.p2 - p.p1 + 1;
    got += p.weeks.length * n;
    detail.push(`w${p.weeks.join("/")}d${p.day}(${n})`);
  }
  const need = Number(r.zxs || 0);
  sumNeed += need; sumGot += got;
  const flag = got < need ? " <<< 缺 " + (need - got) : "";
  out.push(
    String(r.kcmc || "?").padEnd(22) +
    String(need).padStart(6) + String(got).padStart(9) + String(need - got).padStart(7) + "   " +
    (detail.join(" ") + flag).slice(0, 400));
}
out.push("-".repeat(90));
out.push(`合计  总学时 ${sumNeed}  已排 ${sumGot}  缺 ${sumNeed - sumGot}`);

// 逐周看周六/周日
out.push("\n=== sksjdd 里出现的所有周六(6)/周日(7)安排 ===");
for (const r of rows) {
  for (const p of parseSksjdd(r.sksjdd || "")) {
    if (p.day >= 6) out.push(`  ${r.kcmc}  第${p.weeks.join(",")}周 星期${p.day === 6 ? "六" : "日"} ${p.p1}-${p.p2}节 ${p.room}`);
  }
}

fs.writeFileSync(path.join(__dirname, "zxs-out.txt"), out.join("\n"), "utf8");
console.log("ok");
