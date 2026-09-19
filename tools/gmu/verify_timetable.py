#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
课表核对（不依赖登录）：把生成的 courses 按周次展开成「点」，与原始 sksjdd 展开的点集做双向比对。

点 = (课程名, 周次, 星期, 起始节, 结束节, 教室)

目的：验证解析过程「不丢不多不错配教室」。
"""
import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # 项目根
OUT = os.path.join(HERE, "out")

CN_DAY = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7, "天": 7}
SLOT_RE = re.compile(r"第([\d,\-]+)周\s*星期([一二三四五六日天])\s*(\d+)(?:\s*-\s*(\d+))?\s*节")
ROOM_RE = re.compile(r"【([^】]+)】")


def split_weeks(payload):
    out = []
    for c in payload.split(","):
        c = c.strip()
        if not c:
            continue
        m = re.match(r"^(\d+)-(\d+)$", c)
        if m:
            out.extend(range(int(m.group(1)), int(m.group(2)) + 1))
        elif re.match(r"^\d+$", c):
            out.append(int(c))
    return sorted(set(w for w in out if 1 <= w <= 30))


def clean_room(r):
    return r.strip().replace(":", "").replace("：", "")


def expand_raw_points(sksjdd, name):
    """从原始字符串独立抽出所有点（rooms 用「就近出现在该 slot 之后」的规则）"""
    pts = []
    s = (sksjdd or "").replace("，", ",").replace("；", ";").replace("：", ":").strip()
    if not s:
        return pts
    for chunk in s.split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        protected = re.sub(r"第([\d,\-]+)周",
                           lambda m: "第" + m.group(1).replace(",", "_") + "周", chunk)
        subs = [p.strip().replace("_", ",") for p in protected.split(",") if p.strip()]
        parsed = []
        for sub in subs:
            ms = list(SLOT_RE.finditer(sub))
            if ms:
                parsed.append({"sub": sub, "ms": ms,
                               "rooms": [clean_room(x) for x in ROOM_RE.findall(sub)]})
        all_rooms = []
        for p in parsed:
            for r in p["rooms"]:
                if r not in all_rooms:
                    all_rooms.append(r)
        chunk_only = all_rooms[0] if len(all_rooms) == 1 else None
        for p in parsed:
            sub, ms, rooms = p["sub"], p["ms"], p["rooms"]
            room_pos = [(m.start(), clean_room(m.group(1))) for m in ROOM_RE.finditer(sub)]
            for m in ms:
                if rooms:
                    if len(rooms) == 1:
                        room = rooms[0]
                    else:
                        room = min(room_pos, key=lambda t: abs(t[0] - m.end()))[1] if room_pos else ""
                else:
                    room = chunk_only or ""
                weeks = split_weeks(m.group(1))
                day = CN_DAY.get(m.group(2), 1)
                start = int(m.group(3))
                end = int(m.group(4) or m.group(3))
                for w in weeks:
                    pts.append((name, w, day, start, end, room or "未填教室"))
    return pts


def expand_course_points(courses):
    pts = []
    for c in courses:
        for w in c["weeks"]:
            pts.append((c["name"], w, c["dayOfWeek"],
                        c["startPeriod"], c["endPeriod"], c["room"]))
    return pts


def main():
    raw_path = os.path.join(OUT, "raw-timetable.json")
    courses_path = os.path.join(OUT, "courses.json")
    for p in (raw_path, courses_path):
        if not os.path.exists(p):
            print("缺少", p)
            return 1

    raw = json.load(open(raw_path, encoding="utf-8"))
    rows = raw.get("results") or raw.get("timetable", {}).get("results") or []
    courses = json.load(open(courses_path, encoding="utf-8"))

    raw_pts, no_sksjdd = [], []
    for r in rows:
        name = (r.get("kcmc") or "").strip()
        s = r.get("sksjdd")
        if not (s or "").strip():
            no_sksjdd.append((name, (r.get("jxbmc") or ""), (r.get("rkjs") or ""),
                              r.get("zxs"), (r.get("jxbzc") or "")[:40]))
            continue
        raw_pts.extend(expand_raw_points(s, name))

    gen_pts = expand_course_points(courses)

    L = []
    L.append("=" * 72)
    L.append("课表核对报告")
    L.append("=" * 72)
    L.append(f"原始课程记录        : {len(rows)} 门")
    L.append(f"其中无 sksjdd       : {len(no_sksjdd)} 门")
    L.append(f"原始展开点           : {len(raw_pts)}")
    L.append(f"生成 courses 合并后  : {len(courses)} 条")
    L.append(f"生成展开点           : {len(gen_pts)}")
    L.append("")

    from collections import Counter
    cr, cg = Counter(raw_pts), Counter(gen_pts)
    only_raw = cr - cg
    only_gen = cg - cr
    L.append(f"--- 守恒性 ---")
    L.append(f"只在原始有(丢失)   : {len(only_raw)}")
    L.append(f"只在生成有(凭空)   : {len(only_gen)}")
    if only_raw:
        L.append("")
        L.append("[丢失明细] 前 30 条")
        for p, n in list(only_raw.items())[:30]:
            L.append(f"   {n}x {p[0]} 第{p[1]}周 星期{p[2]} {p[3]}-{p[4]}节 教室={p[5]}")
    if only_gen:
        L.append("")
        L.append("[多余明细] 前 30 条")
        for p, n in list(only_gen.items())[:30]:
            L.append(f"   {n}x {p[0]} 第{p[1]}周 星期{p[2]} {p[3]}-{p[4]}节 教室={p[5]}")
    L.append("")

    # 教室错配检查：同一 (课,周,星期,节) 在原始 vs 生成的教室是否一致
    raw_map = defaultdict(set)
    for p in raw_pts:
        raw_map[(p[0], p[1], p[2], p[3], p[4])].add(p[5])
    conflict = []
    for c in courses:
        for w in c["weeks"]:
            k = (c["name"], w, c["dayOfWeek"], c["startPeriod"], c["endPeriod"])
            rr = raw_map.get(k)
            if rr is None:
                conflict.append(("生成有原始无", k, c["room"]))
            elif len(rr) > 1:
                conflict.append(("原始多教室", k, sorted(rr)))
    if conflict:
        L.append(f"[教室可疑] {len(conflict)} 处，前 30:")
        for t, k, v in conflict[:30]:
            L.append(f"   {t}: {k} -> {v}")
    else:
        L.append("[教室] 逐点教室分配与原始一致 ✓")
    L.append("")

    L.append(f"--- 教务未返回 sksjdd 的课程（必然进不了课表）---")
    for nm, jxb, tea, zxs, cls in no_sksjdd:
        L.append(f"   {nm}")
        L.append(f"      教学班={jxb}")
        L.append(f"      教师={tea}  总学时={zxs}  组班={cls}")
    L.append("")

    # ---- 附加核对 1：同一时间点是否被排了多门课（冲突）----
    slot_map = defaultdict(list)
    for c in courses:
        for w in c["weeks"]:
            for p in range(c["startPeriod"], c["endPeriod"] + 1):
                slot_map[(w, c["dayOfWeek"], p)].append(
                    f'{c["name"]}@{c["room"]}')
    clashes = [(k, v) for k, v in slot_map.items() if len(v) > 1]
    L.append(f"--- 时间冲突检查 ---")
    L.append(f"同一 (周次,星期,节次) 排了多门课的格子: {len(clashes)}")
    if clashes:
        L.append("  前 20 处:")
        for (w, d, p), v in sorted(clashes)[:20]:
            L.append(f"   第{w}周 星期{d} 第{p}节 -> {v}")
    L.append("")

    # ---- 附加核对 2：未填教室明细 ----
    blank = [c for c in courses if c["room"] == "未填教室"]
    L.append(f"--- 未填教室明细 ---  共 {len(blank)} 条")
    for c in blank:
        L.append(f"   {c['name']}  星期{c['dayOfWeek']} {c['startPeriod']}-{c['endPeriod']}节  周次={c['weeks']}")
    L.append("")

    # ---- 附加核对 3：每周每天节数分布概览 ----
    L.append(f"--- 每周课程数分布 ---")
    per_week = Counter()
    for c in courses:
        for w in c["weeks"]:
            per_week[w] += 1
    if per_week:
        ws = sorted(per_week)
        L.append("  周次: " + ", ".join(f"{w}周({per_week[w]}节)" for w in ws))
    L.append("")
    L.append("说明：以上仅用本地 raw 数据核对「解析环节」，")
    L.append("      这些课程是否真的没有排课，必须登录教务系统才能确认。")

    txt = "\n".join(L)
    print(txt)
    open(os.path.join(OUT, "verify-report.txt"), "w", encoding="utf-8").write(txt)
    return 0


if __name__ == "__main__":
    sys.exit(main())
