#!/usr/bin/env node
/** 扫描仓库里所有历史课表文件，找出当前 courses.json 里没有的排课（尤其是急危重症/第3周） */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const FILES = [
  ["www/courses.json", null],
  ["www/courses-v2.json", null],
  ["www/classbell-import.json", null],
  ["www/courses-from-api.json", null],
  ["www/scraped-courses.json", null],
  ["courses-final.json", null],
  ["tools/gmu/out/courses.json", null],
  ["tools/gmu/out/courses-parsed.json", null],
];

function loadList(p) {
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    return Array.isArray(j) ? j : j.courses || null;
  } catch (e) { return null; }
}

const norm = (arr) => (arr || []).map((c) => ({
  name: (c.name || c.kcmc || c.courseName || "").trim(),
  day: Number(c.dayOfWeek ?? c.day ?? c.xq ?? 0),
  p1: Number(c.startPeriod ?? c.start ?? c.jc ?? 0),
  p2: Number(c.endPeriod ?? c.end ?? 0),
  weeks: (c.weeks || (c.week !== undefined ? [c.week] : [])).map(Number),
  room: c.room || c.classroom || "",
})).filter((c) => c.name && c.day);

const base = norm(loadList("tools/gmu/out/courses.json"));
const baseKey = (c) => `${c.name}|${c.day}|${c.p1}-${c.p2}|${c.room}`;
const baseMap = new Map();
base.forEach((c) => c.weeks.forEach((w) => {
  const k = baseKey(c) + "|" + w;
  baseMap.set(k, c);
}));

const out = [];
out.push(`基准 out/courses.json: ${base.length} 条 / ${baseMap.size} 个周次点\n`);

for (const [p] of FILES) {
  const arr = norm(loadList(p));
  if (!arr) { out.push(`--- ${p}: 读取失败/不存在`); continue; }
  const missing = [];
  for (const c of arr) {
    for (const w of c.weeks) {
      if (!w) continue;
      const k = baseKey(c) + "|" + w;
      if (!baseMap.has(k)) missing.push({ c, w });
    }
  }
  out.push(`--- ${p}: ${arr.length} 条，其中 ${missing.length} 个排课点不在基准里`);
  missing.slice(0, 40).forEach((m) => out.push(`      ${m.c.name} 周${m.w} 周${m.c.day} ${m.c.p1}-${m.c.p2}节 ${m.c.room || "(无教室)"}`));

  // 特别点名
  const special = missing.filter((m) => /急危重症/.test(m.c.name));
  if (special.length) {
    out.push(`      >>> 含急危重症 ${special.length} 条：`);
    special.forEach((m) => out.push(`         第${m.w}周 周${m.c.day} ${m.c.p1}-${m.c.p2}节 ${m.c.room || "(无教室)"}`));
  }
}

fs.writeFileSync(path.join(ROOT, "scanhist-out.txt"), out.join("\n"), "utf8");
console.log("ok");
