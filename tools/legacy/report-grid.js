#!/usr/bin/env node
/** 用权威网格生成的课表：打印第3周整周安排，并列出相对旧 sksjdd 版「新增了哪些」 */
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "tools", "gmu", "out");

const neu = JSON.parse(fs.readFileSync(path.join(OUT, "courses.json"), "utf8"));
const oldFs = ["courses-final.json", "tools/gmu/out/courses-parsed.json"];
let old = [];
for (const f of oldFs) {
  const p = path.join(__dirname, f);
  if (fs.existsSync(p)) { old = JSON.parse(fs.readFileSync(p, "utf8")); break; }
}

const WD = ["", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const out = [];
out.push(`权威网格版：${neu.length} 条课程 / ${neu.reduce((a, c) => a + c.weeks.length, 0)} 个周次排课`);
out.push(`旧 sksjdd 版：${old.length} 条课程 / ${old.reduce((a, c) => a + (c.weeks ? c.weeks.length : 0), 0)} 个周次排课\n`);

out.push("=== 第 3 周（9-14 ~ 9-20）完整安排 ===");
const w3 = neu.filter((c) => c.weeks.includes(3))
  .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startPeriod - b.startPeriod);
for (const c of w3) {
  out.push(`  ${WD[c.dayOfWeek]} 第${c.startPeriod}-${c.endPeriod}节  ${c.name}  ${c.room}  ${c.teacher || ""}`);
}

out.push("\n=== 今天 9-20（周日） ===");
const sun = neu.filter((c) => c.dayOfWeek === 7 && c.weeks.includes(3));
if (!sun.length) out.push("  （无课）");
sun.forEach((c) => out.push(`  第${c.startPeriod}-${c.endPeriod}节 ${c.name} ${c.room}`));

out.push("\n=== 9-19（周六，用户说漏了急危重症那天） ===");
const sat = neu.filter((c) => c.dayOfWeek === 6 && c.weeks.includes(3));
sat.forEach((c) => out.push(`  第${c.startPeriod}-${c.endPeriod}节 ${c.name} ${c.room}`));

// 新增对比
const oldKey = (c, w) => `${c.name}|${c.dayOfWeek}|${c.startPeriod}-${c.endPeriod}|${w}`;
const oldMap = new Map();
old.forEach((c) => (c.weeks || []).forEach((w) => oldMap.set(oldKey(c, w), c.room)));

out.push("\n=== 相对旧版，网格新查到的排课（按课程汇总）===");
const added = [];
for (const c of neu) {
  const missingWeeks = c.weeks.filter((w) => !oldMap.has(oldKey(c, w)));
  if (missingWeeks.length) added.push({ name: c.name, day: c.dayOfWeek, p: `${c.startPeriod}-${c.endPeriod}`, room: c.room, weeks: missingWeeks });
}
const byName = new Map();
added.forEach((a) => {
  const k = `${a.name}|${a.day}|${a.p}|${a.room}`;
  if (!byName.has(k)) byName.set(k, { ...a, weeks: [] });
  byName.get(k).weeks.push(...a.weeks);
});
[...byName.values()].sort((a, b) => a.name.localeCompare(b.name) || a.day - b.day)
  .forEach((a) => out.push(`  ${a.name}  ${WD[a.day]} 第${a.p}节  ${a.room}  新补周次: ${a.weeks.sort((x, y) => x - y).join(",")}`));

out.push(`\n新增条目合计 ${byName.size} 条`);

// 旧版里网格确认没有的（可能是过期/错排）
const neuKey = (c, w) => `${c.name}|${c.dayOfWeek}|${c.startPeriod}-${c.endPeriod}|${w}`;
const neuMap = new Map();
neu.forEach((c) => c.weeks.forEach((w) => neuMap.set(neuKey(c, w), 1)));
const stale = [];
old.forEach((c) => (c.weeks || []).forEach((w) => { if (!neuMap.has(oldKey(c, w))) stale.push({ c, w }); }));
out.push("\n=== 旧版有、但网格里查不到的（需留意）===");
stale.forEach((s) => out.push(`  ${s.c.name} 第${s.w}周 ${WD[s.c.dayOfWeek]} ${s.c.startPeriod}-${s.c.endPeriod}节 ${s.c.room}`));

out.push("\n=== 网格里出现的所有课程名 ===");
[...new Set(neu.map((c) => c.name))].forEach((n) => out.push("  " + n));

fs.writeFileSync(path.join(__dirname, "report-out.txt"), out.join("\n"), "utf8");
console.log("ok");
