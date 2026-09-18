#!/usr/bin/env node
/**
 * app.js 里纯解析函数的回归测试（不需要浏览器环境）
 *
 * 用法: node tools/test-parsers.js
 *
 * 重点覆盖两个曾经真实踩过的坑：
 *   1. 多位教师轮班上课时，同一节课被按 teacher 切碎成几十条
 *   2. 每周一条的 assets 数据没有走 normalizeCourse，导致缺 id / className / remindEnabled
 */
const fs = require("fs");
const path = require("path");

const APP_JS = path.join(__dirname, "..", "app.js");
const src = fs.readFileSync(APP_JS, "utf8");

/** 从 app.js 源码里按名字抠出一个顶层函数（用大括号配对确定结束位置） */
function extractFn(name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`找不到函数: ${name}`);
  let i = src.indexOf("{", start);
  let depth = 0;
  for (; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`函数 ${name} 括号不闭合`);
}

const harness = [
  // normalizeCourse 依赖 getWeekNumber() 拿一个兜底周次，这里固定返回 1
  "function getWeekNumber() { return 1; }",
  extractFn("normalizeCourse"),
  extractFn("mergeDuplicateCourses"),
  extractFn("normalizeAssetRows"),
  extractFn("getMaxCourseWeek"),
  extractFn("extractClassName"),
  "let state = { courses: [], settings: { termStartDate: '2026-08-31' } };",
  "module.exports = { normalizeCourse, mergeDuplicateCourses, normalizeAssetRows, getMaxCourseWeek, extractClassName, setCourses: (c) => { state.courses = c; } };",
].join("\n\n");

const mod = { exports: {} };
new Function("module", "exports", harness)(mod, mod.exports);
const { normalizeCourse, mergeDuplicateCourses, normalizeAssetRows, getMaxCourseWeek, extractClassName, setCourses } = mod.exports;

let failed = 0;
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}`);
  if (!ok) console.log(`      期望 ${e}\n      实际 ${a}`);
}

console.log("\n[1] 多位教师轮班上课 —— 同一节课不应被切碎");
{
  // 同一门课，周二 1-2 节，第 1~4 周各由不同老师上，教室相同
  const rows = [
    { name: "精神科护理学", teacher: "罗珍", room: "11合班（章贡）", day: 2, startPeriod: 1, endPeriod: 2, week: 1 },
    { name: "精神科护理学", teacher: "郑亚楠", room: "11合班（章贡）", day: 2, startPeriod: 1, endPeriod: 2, week: 2 },
    { name: "精神科护理学", teacher: "江茜", room: "11合班（章贡）", day: 2, startPeriod: 1, endPeriod: 2, week: 3 },
    { name: "精神科护理学", teacher: "袁水莲（外聘）", room: "11合班（章贡）", day: 2, startPeriod: 1, endPeriod: 2, week: 4 },
  ];
  const merged = mergeDuplicateCourses(normalizeAssetRows(rows).map(normalizeCourse).filter(Boolean));
  check("合并后只剩 1 条", merged.length, 1);
  check("周次合并为 1-4", merged[0].weeks, [1, 2, 3, 4]);
  check("教师名单合并", merged[0].teacher, "罗珍,郑亚楠,江茜,袁水莲（外聘）");
}

console.log("\n[2] 不同教室的同一门课应分开保留（换教室提醒要用）");
{
  const rows = [
    { name: "外科护理学", teacher: "李莉莉A", room: "17合班（章贡）", day: 3, startPeriod: 5, endPeriod: 6, weeks: [1] },
    { name: "外科护理学", teacher: "李莉莉A", room: "16合班（章贡）", day: 3, startPeriod: 5, endPeriod: 6, weeks: [2] },
  ];
  const merged = mergeDuplicateCourses(normalizeAssetRows(rows).map(normalizeCourse).filter(Boolean));
  check("保留 2 条", merged.length, 2);
  check("教室各自独立", merged.map((c) => c.room).sort(), ["16合班（章贡）", "17合班（章贡）"]);
}

console.log("\n[3] autoImport 后的课程必须带 id / className / remindEnabled");
{
  const rows = [{ name: "护理心理学", teacher: "许金仙", room: "12合班（章贡）", day: 3, startPeriod: 1, endPeriod: 2, week: 1 }];
  const merged = mergeDuplicateCourses(normalizeAssetRows(rows).map(normalizeCourse).filter(Boolean));
  const c = merged[0];
  check("有 id", typeof c.id === "string" && c.id.length > 0, true);
  check("有 className 字段", "className" in c, true);
  check("remindEnabled 为 true", c.remindEnabled, true);
}

console.log("\n[4] 非法数据要被丢弃而不是污染课表");
{
  const bad = [
    { name: "", dayOfWeek: 1, startPeriod: 1, endPeriod: 1 },         // 没名字
    { name: "越界", dayOfWeek: 9, startPeriod: 1, endPeriod: 1 },     // 星期越界
    { name: "倒挂", dayOfWeek: 1, startPeriod: 5, endPeriod: 2 },     // 结束早于开始
    { name: "超节次", dayOfWeek: 1, startPeriod: 1, endPeriod: 11 },  // 超过 10 节
    { name: "字段名写错", day: 1, startPeriod: 1, endPeriod: 1 },     // 写成 day → dayOfWeek 是 undefined → NaN
    { name: "节次不是数字", dayOfWeek: 1, startPeriod: "一", endPeriod: 2 },
  ];
  const out = bad.map(normalizeCourse).filter(Boolean);
  check("全部丢弃", out.length, 0);
}

console.log("\n[5] 学期过期检测");
{
  setCourses([{ weeks: [1, 2, 3] }, { weeks: [10, 11, 19] }]);
  check("课表最大周次 = 19", getMaxCourseWeek(), 19);
  setCourses([]);
  check("空课表返回 0", getMaxCourseWeek(), 0);
}

console.log("\n[6] 班级名提取（含 GMU 的 24级护理N班 格式）");
{
  // 合班课会列出多个班级，无法判断哪个是本班，取第一个匹配即可
  check("合班取第一个", extractClassName("24级护理3班,24级护理4班"), "24级护理3班");
  check("301中班", extractClassName("301中班"), "301中班");
  check("理论006", extractClassName("理论006"), "理论006");
}

console.log("\n[7] 真实课表 courses-final.json 冒烟测试");
{
  const file = path.join(__dirname, "..", "courses-final.json");
  if (!fs.existsSync(file)) {
    console.log("  - 跳过（courses-final.json 不存在）");
  } else {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const merged = mergeDuplicateCourses(normalizeAssetRows(data).map(normalizeCourse).filter(Boolean));
    check("没有数据被丢弃", merged.length, data.length);
    check("每条都有 id", merged.every((c) => typeof c.id === "string" && c.id.length > 0), true);
    check("每条都有合法周次", merged.every((c) => c.weeks.length > 0 && c.weeks.every((w) => w >= 1 && w <= 30)), true);
    check("每条星期在 1-7", merged.every((c) => c.dayOfWeek >= 1 && c.dayOfWeek <= 7), true);
    check("每条节次在 1-10", merged.every((c) => c.startPeriod >= 1 && c.endPeriod <= 10 && c.endPeriod >= c.startPeriod), true);
    setCourses(merged);
    console.log(`     ${data.length} 条课程，覆盖到第 ${getMaxCourseWeek()} 周`);
  }
}

console.log(failed === 0 ? "\n全部通过 ✅\n" : `\n${failed} 项失败 ❌\n`);
process.exit(failed === 0 ? 0 : 1);
