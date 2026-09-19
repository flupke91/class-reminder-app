#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 fetch_timetable.js 抓到的原始 JSON 解析成「上课啦」App 的课表格式。

  用法: python tools/gmu/parse_timetable.py [raw-timetable.json]

产物：
  out/courses.json      课程数组，可直接粘进 App 的 JSON 导入框
  out/app-state.json    完整 App 状态（含学期设置），供 apply_to_device.sh 写入手机

===== sksjdd（上课时间地点）格式说明 =====
这是解析里最容易出错的地方，规则是实测出来的（用教务系统第 1 周的课表网格交叉验证过）：

    "第8周 星期五 1-8节【见习场所11（章贡）】,第4周 星期二 1-2节 第4,7周 星期一 1-2节【11合班（章贡）】"

  * ';' 分大块，',' 分小组
  * '【地点】' 写在【小组末尾】，作用于该小组内的【全部】时间段
    —— 上面第二组里，"第4周 星期二 1-2节" 和 "第4,7周 星期一 1-2节" 都在 11合班（章贡）
  * 周次支持 "第1,13周"、"第3-4,8周"、"第14-15周" 这些写法
  * 有的小组压根没写【地点】，此时若整个大块里只有一个教室，则继承它；否则留空
"""
import json
import os
import re
import sys
from datetime import date, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("GMU_OUT") or os.path.join(HERE, "out")
DEFAULT_RAW = os.path.join(OUT, "raw-timetable.json")

CN_DAY = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 7, "天": 7}
SLOT_RE = re.compile(r"第([\d,\-]+)周\s*星期([一二三四五六日天])\s*(\d+)(?:\s*-\s*(\d+))?\s*节")
ROOM_RE = re.compile(r"【([^】]+)】")


def norm(s):
    return (s or "").replace("，", ",").replace("；", ";").replace("：", ":").strip()


def clean_room(r):
    return r.strip().replace(":", "").replace("：", "")


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


def parse_sksjdd(s):
    """返回 [{weeks, dayOfWeek, startPeriod, endPeriod, room}]"""
    s = norm(s)
    if not s:
        return []
    slots = []
    for chunk in s.split(";"):
        chunk = chunk.strip()
        if not chunk:
            continue
        # 保护 第X,Y周 / 第X-Y,Z周 里的逗号，避免被当成小组分隔符
        protected = re.sub(
            r"第([\d,\-]+)周",
            lambda m: "第" + m.group(1).replace(",", "_") + "周",
            chunk,
        )
        subs = [p.strip().replace("_", ",") for p in protected.split(",") if p.strip()]

        parsed = []
        for sub in subs:
            ms = list(SLOT_RE.finditer(sub))
            if ms:
                parsed.append({"sub": sub, "ms": ms, "rooms": [clean_room(x) for x in ROOM_RE.findall(sub)]})

        # 大块内只有一个教室时，没写教室的小组继承它
        all_rooms = []
        for p in parsed:
            for r in p["rooms"]:
                if r not in all_rooms:
                    all_rooms.append(r)
        chunk_only = all_rooms[0] if len(all_rooms) == 1 else None

        for p in parsed:
            sub, ms, rooms = p["sub"], p["ms"], p["rooms"]
            room_pos = [(m.start(), clean_room(m.group(1))) for m in ROOM_RE.finditer(sub)]
            for i, m in enumerate(ms):
                if rooms:
                    if len(rooms) == 1:
                        room = rooms[0]
                    else:  # 多个教室按位置就近
                        room = min(room_pos, key=lambda t: abs(t[0] - m.end()))[1] if room_pos else ""
                else:
                    room = chunk_only or ""
                weeks = split_weeks(m.group(1))
                day = CN_DAY.get(m.group(2), 1)
                start, end = int(m.group(3)), int(m.group(4) or m.group(3))
                if not weeks or start < 1 or end > 10 or end < start:
                    continue
                slots.append({"weeks": weeks, "dayOfWeek": day,
                              "startPeriod": start, "endPeriod": end, "room": room})
    return slots


def parse_md(md, ref):
    """教务系统返回的日期只有 '月-日'，这里结合抓取日期补上年份"""
    m, d = (int(x) for x in md.split("-"))
    try:
        cand = date(ref.year, m, d)
    except ValueError:
        return None
    if (cand - ref).days > 180:
        cand = date(ref.year - 1, m, d)
    elif (ref - cand).days > 180:
        cand = date(ref.year + 1, m, d)
    return cand


def main():
    raw_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_RAW
    if not os.path.exists(raw_path):
        print(f"找不到 {raw_path}，先运行 fetch_timetable.js")
        return 1

    raw = json.load(open(raw_path, encoding="utf-8"))
    # 兼容两种 raw 形态：
    #   1) fetch_timetable.js 产出的 {fetchedAt, timetable:{results}, weekInfo:{zc,days}}
    #   2) 直接把教务接口响应落盘的裸 {msg, ret, results}
    if isinstance(raw.get("timetable"), dict) and "results" in raw["timetable"]:
        rows = raw["timetable"]["results"]
    else:
        rows = raw.get("results") or []
    if not rows:
        print("原始数据里没有 results，先运行 fetch_timetable.js")
        return 1
    os.makedirs(OUT, exist_ok=True)

    # ---- 学期信息 ----
    terms = sorted({r.get("xnxq", "") for r in rows if r.get("xnxq")})
    term_name = terms[-1] if terms else ""

    # fetchedAt 可能缺失（裸响应），退回用文件的修改时间
    fetched_raw = raw.get("fetchedAt")
    if fetched_raw:
        fetched = date.fromisoformat(fetched_raw[:10])
    else:
        fetched = date.fromtimestamp(os.path.getmtime(raw_path))

    # weekInfo 优先取 raw 里的，其次退回同目录的 week-info.json
    week_info = raw.get("weekInfo")
    if not week_info:
        cand = os.path.join(OUT, "week-info.json")
        if os.path.exists(cand):
            try:
                w = json.load(open(cand, encoding="utf-8"))
                if isinstance(w.get("data"), list):
                    week_info = {"days": w["data"], "zc": w.get("zc")}
            except Exception:
                week_info = None

    term_start = None
    term_start_note = ""
    if week_info and week_info.get("days"):
        zc = week_info.get("zc")
        if zc:
            monday = parse_md(week_info["days"][0]["date"], fetched)
            if monday:
                term_start = monday - timedelta(weeks=int(zc) - 1)
        else:
            # week-info.json 只存了「本周日期」却没记录是第几周，无法推算学期开始日期
            today = next((d["date"] for d in week_info["days"] if d.get("sfdt")), None)
            term_start_note = (
                "本周日期=%s，但原始数据没记录它是第几周（缺少 zc），"
                "无法推算学期开始日期 —— 请在 App 里用「校准周次」手动填今天是第几周，"
                "或重新运行 fetch_timetable.js 以获取带 zc 的完整 weekInfo"
                % (today or "未知")
            )

    # ---- 解析每门课 ----
    all_slots = []
    meta = {}
    for r in rows:
        name = (r.get("kcmc") or "").strip()
        meta[name] = {"teacher": (r.get("rkjs") or "").strip(), "jxbzc": (r.get("jxbzc") or "").strip()}
        for s in parse_sksjdd(r.get("sksjdd") or ""):
            all_slots.append({"name": name, **meta[name], **s})

    print(f"课程 {len(rows)} 门 -> 时间段 {len(all_slots)} 条")
    for n, v in meta.items():
        print(f"  {n[:24]:26s} {sum(1 for s in all_slots if s['name'] == n):3d} 条   教师={v['teacher'][:22]}")

    # ---- 合并：同 (课程,班级,星期,起止节,教室) 合并周次，教师名单去重合并 ----
    groups = {}
    for s in all_slots:
        key = (s["name"], s["jxbzc"], s["dayOfWeek"], s["startPeriod"], s["endPeriod"], s["room"])
        g = groups.setdefault(key, {"weeks": set(), "teachers": []})
        g["weeks"].update(s["weeks"])
        for t in s["teacher"].split(","):
            t = t.strip()
            if t and t not in g["teachers"]:
                g["teachers"].append(t)

    # 合班课的 jxbzc 会列出所有班级，用 GMU_MY_CLASS 指定自己那一个，否则取第一个
    my_class = os.environ.get("GMU_MY_CLASS", "")

    courses = []
    for i, ((name, jxbzc, day, sp, ep, room), g) in enumerate(groups.items()):
        if my_class and my_class in jxbzc:
            cls = my_class
        else:
            cls = jxbzc.split(",")[0] if jxbzc else ""
        courses.append({
            "id": f"jw-{i + 1}",
            "name": name,
            "teacher": ",".join(g["teachers"]),
            "className": cls,
            "room": room or "未填教室",
            "dayOfWeek": day,
            "startPeriod": sp,
            "endPeriod": ep,
            "weeks": sorted(g["weeks"]),
            "remindEnabled": True,
        })
    courses.sort(key=lambda c: (c["dayOfWeek"], c["startPeriod"], c["name"]))

    max_week = max((w for c in courses for w in c["weeks"]), default=0)
    blank = sum(1 for c in courses if c["room"] == "未填教室")
    print(f"\n合并后 {len(courses)} 条，覆盖第 1~{max_week} 周，其中 {blank} 条教务系统未标注教室")

    # ---- 输出 ----
    json.dump(courses, open(os.path.join(OUT, "courses.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    state = {
        "settings": {
            "morningTime": "08:00",
            "afternoonTime": "13:40",
            "beforeMinutes": 3,
            "gapThresholdMinutes": 60,
            "termName": term_name,
            "termStartDate": term_start.isoformat() if term_start else "",
            "holidayDates": [],
        },
        "selectedWeekOffset": 0,
        "liveReminderEnabled": False,
        "courses": courses,
    }
    json.dump(state, open(os.path.join(OUT, "app-state.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    print(f"\n学期: {term_name}")
    print(f"学期开始日期: {state['settings']['termStartDate'] or '(未能推断，请在 App 里手动校准)'}")
    print(f"\n[saved] {os.path.join(OUT, 'courses.json')}")
    print(f"[saved] {os.path.join(OUT, 'app-state.json')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
