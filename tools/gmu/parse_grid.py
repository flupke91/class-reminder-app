#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把「课表网格」(getXsdSykb) 的原始响应解析成「上课啦」App 的课表格式。

  用法: python tools/gmu/parse_grid.py

输入（任意一个都行，会全部读取并合并）：
  out/grid/week-<N>.json   fetch_grid3.js 产出
  out/grid-w<N>.json       retry-grid.js 产出
  out/grid-week<N>.json    其它脚本产出

网格结构（教务系统返回的权威周课表）：
  data.jcKcxx = [ { jcbm: "1",                       # 节次
                    kbxx: [ { yzxq: "1",             # 星期 1-7
                              kcxx: [ {teacher, classroom, kcmc} ] } ] } ]

比 sksjdd（已选课程里的「上课时间地点」字符串）可靠得多：
实测 sksjdd 会漏课 —— 用总学时对账，全学期 449 学时里 sksjdd 只排出 192 学时。
"""
import glob
import json
import os
import re
import sys
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("GMU_OUT") or os.path.join(HERE, "out")

PATTERNS = [
    os.path.join(OUT, "grid", "week-*.json"),
    os.path.join(OUT, "grid-w*.json"),
    os.path.join(OUT, "grid-week*.json"),
]


def load_weeks():
    """返回 {week_no: [ (day, period, name, teacher, room), ... ]}"""
    weeks = {}
    files = []
    for p in PATTERNS:
        files.extend(sorted(glob.glob(p)))
    for f in files:
        m = re.search(r"(\d+)\.json$", os.path.basename(f))
        if not m:
            continue
        wk = int(m.group(1))
        try:
            j = json.load(open(f, encoding="utf-8"))
        except Exception as e:
            print(f"  [跳过] {os.path.basename(f)}: {e}")
            continue
        data = (j.get("data") or {}) if isinstance(j, dict) else {}
        rows = data.get("jcKcxx") or []
        pts = []
        for p in rows:
            try:
                period = int(str(p.get("jcbm", "")).strip())
            except ValueError:
                continue
            for d in p.get("kbxx") or []:
                try:
                    day = int(str(d.get("yzxq", "")).strip())
                except ValueError:
                    continue
                for c in d.get("kcxx") or []:
                    name = (c.get("kcmc") or "").strip()
                    if not name:
                        continue
                    pts.append({
                        "day": day,
                        "period": period,
                        "name": name,
                        "teacher": (c.get("teacher") or "").strip(),
                        "room": (c.get("classroom") or "").strip(),
                    })
        if pts:
            weeks[wk] = pts
            print(f"  周{wk:>2}: {len(pts):>3} 个格子  ({os.path.basename(f)})")
    return weeks


def main():
    weeks = load_weeks()
    if not weeks:
        print(f"\n没找到任何网格文件（找过 {[os.path.basename(p) for p in PATTERNS]}）")
        print("先运行 fetch_grid3.js 或 retry-grid.js 抓取。")
        return 1

    # 每周内把连续节次、同一门课+同一教室合并成一个 block
    blocks = {}  # (day, p1, p2, name, room) -> weeks set, teachers
    for wk, pts in sorted(weeks.items()):
        by_day = {}
        for p in pts:
            by_day.setdefault(p["day"], []).append(p)
        for day, arr in by_day.items():
            arr.sort(key=lambda x: x["period"])
            cur = None
            for p in arr:
                if (cur and p["period"] == cur["period"] + 1
                        and p["name"] == cur["name"] and p["room"] == cur["room"]):
                    cur["period"] = p["period"]
                    for t in p["teacher"].split(","):
                        t = t.strip()
                        if t and t not in cur["teachers"]:
                            cur["teachers"].append(t)
                    continue
                if cur:
                    _emit(blocks, cur, wk)
                cur = {"day": day, "p1": p["period"], "period": p["period"],
                       "name": p["name"], "room": p["room"],
                       "teachers": [t.strip() for t in p["teacher"].split(",") if t.strip()]}
            if cur:
                _emit(blocks, cur, wk)

    courses = []
    for i, ((day, p1, p2, name, room), v) in enumerate(
            sorted(blocks.items(), key=lambda kv: (kv[0][0], kv[0][1], kv[0][3]))):
        courses.append({
            "id": f"kb-{i + 1}",
            "name": name,
            "teacher": ",".join(v["teachers"]),
            "className": "",
            "room": room or "未填教室",
            "dayOfWeek": day,
            "startPeriod": p1,
            "endPeriod": p2,
            "weeks": sorted(v["weeks"]),
            "remindEnabled": True,
        })

    json.dump(courses, open(os.path.join(OUT, "courses.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    # 学期开始日期沿用 parse_timetable.py 的推断结果（读旧 app-state 或 week-info）
    term_start, term_name = "", ""
    st_path = os.path.join(OUT, "app-state.json")
    if os.path.exists(st_path):
        try:
            st = json.load(open(st_path, encoding="utf-8"))
            term_start = (st.get("settings") or {}).get("termStartDate", "")
            term_name = (st.get("settings") or {}).get("termName", "")
        except Exception:
            pass

    state = {
        "settings": {
            "morningTime": "08:00",
            "afternoonTime": "13:40",
            "beforeMinutes": 3,
            "gapThresholdMinutes": 60,
            "termName": term_name,
            "termStartDate": term_start,
            "holidayDates": [],
        },
        "selectedWeekOffset": 0,
        "liveReminderEnabled": False,
        "courses": courses,
    }
    json.dump(state, open(os.path.join(OUT, "app-state.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    n_slots = sum(len(v["weeks"]) for v in blocks.values())
    print(f"\n覆盖第 {min(weeks)}~{max(weeks)} 周（{len(weeks)} 周），合并出 {len(courses)} 条课程，共 {n_slots} 个周次排课")
    print(f"[saved] {os.path.join(OUT, 'courses.json')}")
    print(f"[saved] {os.path.join(OUT, 'app-state.json')}")
    return 0


def _emit(blocks, cur, wk):
    key = (cur["day"], cur["p1"], cur["period"], cur["name"], cur["room"])
    g = blocks.setdefault(key, {"weeks": set(), "teachers": []})
    g["weeks"].add(wk)
    for t in cur["teachers"]:
        if t not in g["teachers"]:
            g["teachers"].append(t)


if __name__ == "__main__":
    sys.exit(main())
