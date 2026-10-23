#!/usr/bin/env node
/** 用权威网格重算学时覆盖率，确认这次真的补齐了 */
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "tools", "gmu", "out");
const raw = JSON.parse(fs.readFileSync(path.join(OUT, "raw-timetable.json"), "utf8"));
const rows = raw.timetable && raw.timetable.results ? raw.timetable.results : raw.results || [];
const cs = JSON.parse(fs.readFileSync(path.join(OUT, "courses.json"), "utf8"));

const zxs = {};
rows.forEach((r) => { zxs[r.kcmc] = Number(r.zxs || 0); });

const got = {};
cs.forEach((c) => {
  const n = c.endPeriod - c.startPeriod + 1;
  got[c.name] = (got[c.name] || 0) + c.weeks.length * n;
});

const out = [];
let need = 0, have = 0;
out.push("课程                          总学时   网格排到   缺口");
out.push("-".repeat(56));
Object.keys(zxs).sort().forEach((n) => {
  const z = zxs[n], g = got[n] || 0;
  need += z; have += g;
  out.push(`${n.padEnd(28)}${String(z).padStart(6)}${String(g).padStart(10)}${String(z - g).padStart(7)}${g < z ? "  缺" : "  齐"}`);
});
out.push("-".repeat(56));
out.push(`合计 总学时 ${need}，网格排出 ${have}，缺口 ${need - have}`);
out.push("");
out.push("注：智慧树网课（42+54 学时）无线下课表；临床营养学/五官科护理学/劳动教育在网格里也查无安排");

fs.writeFileSync(path.join(__dirname, "check2-out.txt"), out.join("\n"), "utf8");
console.log("ok");
