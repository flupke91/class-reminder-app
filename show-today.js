#!/usr/bin/env node
/** 列出解析结果里指定日期的课程（默认今天） */
const fs = require("fs");
const path = require("path");
const day = process.argv[2] || "2026-09-19";
const cs = JSON.parse(fs.readFileSync(path.join(__dirname, "tools", "gmu", "out", "courses.json"), "utf8"));
const arr = Array.isArray(cs) ? cs : cs.courses || [];
const out = [];
out.push("courses.json 共 " + arr.length + " 条；样本字段: " + Object.keys(arr[0] || {}).join(","));
out.push("\n=== " + day + " 的课程 ===");
const hit = arr.filter((c) => String(c.date || c.day || "").indexOf(day) >= 0);
if (!hit.length) {
  out.push("(无)  —— 尝试别的匹配方式");
  const h2 = arr.filter((c) => JSON.stringify(c).indexOf(day) >= 0);
  out.push("JSON 全文匹配命中 " + h2.length + " 条");
  h2.slice(0, 20).forEach((c) => out.push("  " + JSON.stringify(c).slice(0, 200)));
}
hit.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
hit.forEach((c) => out.push(`  ${c.startTime || "?"}-${c.endTime || "?"} ${c.name || c.courseName || "?"} @ ${c.location || c.room || "?"} [${c.week || ""}周 ${c.weekday || ""}]`));
out.push("\n=== 全部含「急危重症」的条目 ===");
arr.filter((c) => JSON.stringify(c).indexOf("急危重症") >= 0)
  .forEach((c) => out.push("  " + JSON.stringify(c).slice(0, 220)));
out.push("\n=== 全部含「外科护理」的条目（前 30）===");
arr.filter((c) => JSON.stringify(c).indexOf("外科护理") >= 0).slice(0, 30)
  .forEach((c) => out.push("  " + JSON.stringify(c).slice(0, 220)));
fs.writeFileSync(path.join(__dirname, "today-out.txt"), out.join("\n"), "utf8");
console.log("ok");
