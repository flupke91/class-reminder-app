#!/usr/bin/env node
/** 打印原始抓取数据里每门课的上课时间地点，便于人工核对 */
const fs = require("fs");
const path = require("path");
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "tools", "gmu", "out", "raw-timetable.json"), "utf8"));
const rows = raw.timetable && raw.timetable.results ? raw.timetable.results : raw.results || [];
const out = [];
out.push("fetchedAt=" + (raw.fetchedAt || "-") + "  weekInfo=" + JSON.stringify(raw.weekInfo || {}) + "  课程数=" + rows.length);
rows.forEach((r, i) => {
  out.push(`\n[${i + 1}] ${r.kcmc || r.courseName || "?"}`);
  out.push("    教师: " + (r.skjs || r.teacher || "-"));
  out.push("    sksjdd: " + (r.sksjdd === undefined || r.sksjdd === null ? "<无字段>" : r.sksjdd === "" ? "<空>" : r.sksjdd));
  for (const k of Object.keys(r)) {
    if (!["kcmc", "courseName", "skjs", "teacher", "sksjdd"].includes(k)) {
      const v = typeof r[k] === "object" ? JSON.stringify(r[k]).slice(0, 120) : String(r[k]).slice(0, 60);
      out.push(`    ${k}: ${v}`);
    }
  }
});
fs.writeFileSync(path.join(__dirname, "raw-dump.txt"), out.join("\n"), "utf8");
console.log("ok " + rows.length);
