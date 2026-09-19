#!/usr/bin/env node
/** 比对：courses.json 展开出的排课点  vs  sksjdd 全局匹配出的排课点（看解析器是否丢片段） */
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "tools", "gmu", "out");
const raw = JSON.parse(fs.readFileSync(path.join(OUT, "raw-timetable.json"), "utf8"));
const rows = raw.timetable && raw.timetable.results ? raw.timetable.results : raw.results || [];
const cs = JSON.parse(fs.readFileSync(path.join(OUT, "courses.json"), "utf8"));
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
      let m; RE.lastIndex = 0;
      while ((m = RE.exec(group)) !== null) {
        const weeks = [];
        for (const part of m[1].split(/[,\u4e00-\u9fa5]+/).filter(Boolean)) {
          const rg = part.match(/^(\d+)-(\d+)$/);
          if (rg) { for (let i = +rg[1]; i <= +rg[2]; i++) weeks.push(i); }
          else if (/^\d+$/.test(part)) weeks.push(+part);
        }
        for (const w of weeks) out.push({ w, d: CN[m[2]] || 0, p1: +m[3], p2: +m[4], room });
      }
    }
  }
  return out;
}

const key = (o) => `${o.w}|${o.d}|${o.p1}-${o.p2}`;
const out = [];
let totalSrc = 0, totalDst = 0, totalLost = 0;

for (const r of rows) {
  const src = parse(r.sksjdd || "");
  const name = r.kcmc;
  const dstPts = [];
  for (const c of arr) {
    if ((c.name || "") !== name) continue;
    for (const w of c.weeks || []) dstPts.push({ w, d: Number(c.dayOfWeek), p1: c.startPeriod, p2: c.endPeriod, room: c.room || "" });
  }
  const srcMap = new Map();
  src.forEach((p) => { const k = key(p); srcMap.set(k, (srcMap.get(k) || 0) + 1); });
  const dstMap = new Map();
  dstPts.forEach((p) => { const k = key(p); dstMap.set(k, (dstMap.get(k) || 0) + 1); });

  const lost = [], extra = [];
  srcMap.forEach((v, k) => { const d = dstMap.get(k) || 0; if (v > d) lost.push(`${k} ×${v - d}`); });
  dstMap.forEach((v, k) => { const s = srcMap.get(k) || 0; if (v > s) extra.push(`${k} ×${v - s}`); });

  totalSrc += src.length; totalDst += dstPts.length; totalLost += lost.length;
  out.push(`${name}: sksjdd点=${src.length} 解析点=${dstPts.length}` +
    (lost.length ? `\n    丢失: ${lost.join(", ")}` : "") +
    (extra.length ? `\n    多出: ${extra.join(", ")}` : "") +
    (!lost.length && !extra.length ? "  OK" : ""));
}
out.push("");
out.push(`合计 sksjdd 点 ${totalSrc}，解析点 ${totalDst}，丢失种类 ${totalLost}`);
fs.writeFileSync(path.join(__dirname, "compare-out.txt"), out.join("\n"), "utf8");
console.log("ok");
