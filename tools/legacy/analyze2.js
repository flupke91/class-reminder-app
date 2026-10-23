#!/usr/bin/env node
/** 修正版：全局匹配 sksjdd（处理挤在一起的多个"第X周 星期Y A-B节"），按 ; 分块、, 分组、组内共用【地点】 */
const fs = require("fs");
const path = require("path");
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "tools", "gmu", "out", "raw-timetable.json"), "utf8"));
const rows = raw.timetable && raw.timetable.results ? raw.timetable.results : raw.results || [];
const cs = JSON.parse(fs.readFileSync(path.join(__dirname, "tools", "gmu", "out", "courses.json"), "utf8"));
const arr = Array.isArray(cs) ? cs : cs.courses || [];

const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7 };
const RE = /第([\d,\-\u4e00-\u9fa5]+?)周\s*星期([\u4e00-\u9fa5])\s*(\d+)\s*-\s*(\d+)\s*节/g;

function parse(s) {
  const out = [];
  if (!s) return out;
  for (const block of s.split(";")) {
    for (const group of block.split(",")) {
      const rm = group.match(/【([^】]*)】/);
      const room = rm ? rm[1] : "";
      let m;
      RE.lastIndex = 0;
      while ((m = RE.exec(group)) !== null) {
        const weeks = [];
        for (const part of m[1].split(/[,\u4e00-\u9fa5]+/).filter(Boolean)) {
          const rg = part.match(/^(\d+)\s*-\s*(\d+)$/);
          if (rg) { for (let i = +rg[1]; i <= +rg[2]; i++) weeks.push(i); }
          else if (/^\d+$/.test(part)) weeks.push(+part);
        }
        if (!weeks.length) continue;
        out.push({ weeks, day: CN[m[2]] || 0, p1: +m[3], p2: +m[4], room });
      }
    }
  }
  return out;
}

const out = [];
let sn = 0, sg = 0;
out.push("课程".padEnd(20) + " 总学时 已排学时  缺口");
out.push("-".repeat(60));
for (const r of rows) {
  const pts = parse(r.sksjdd || "");
  let got = 0;
  for (const p of pts) got += p.weeks.length * (p.p2 - p.p1 + 1);
  const need = Number(r.zxs || 0);
  sn += need; sg += got;
  out.push(String(r.kcmc || "?").padEnd(20) + String(need).padStart(6) + String(got).padStart(9) + String(need - got).padStart(7) + (got < need ? "  <<< 缺" : ""));
}
out.push("-".repeat(60));
out.push(`合计 总学时 ${sn}  已排 ${sg}  缺 ${sn - sg}`);

out.push("\n=== 第3周安排（权威 sksjdd 解析）===");
for (const r of rows) {
  for (const p of parse(r.sksjdd || "")) {
    if (p.weeks.includes(3)) out.push(`  ${r.kcmc}  星期${"一二三四五六日"[p.day - 1]} ${p.p1}-${p.p2}节  ${p.room || "(无地点)"}`);
  }
}

out.push("\n=== courses.json 里 dayOfWeek>=6 的条目 ===");
const sat = arr.filter((c) => Number(c.dayOfWeek) >= 6);
out.push("共 " + sat.length + " 条");
sat.forEach((c) => out.push(`  ${c.name} 周${c.dayOfWeek} ${c.startPeriod}-${c.endPeriod}节 周次[${c.weeks}] ${c.room}`));

out.push("\n=== courses.json 里含第3周的条目 ===");
arr.filter((c) => (c.weeks || []).includes(3))
  .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startPeriod - b.startPeriod)
  .forEach((c) => out.push(`  周${c.dayOfWeek} ${c.startPeriod}-${c.endPeriod}节 ${c.name} @ ${c.room}`));

fs.writeFileSync(path.join(__dirname, "analyze2-out.txt"), out.join("\n"), "utf8");
console.log("ok");
