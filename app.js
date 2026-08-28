const STORAGE_KEY = "class-reminder-state-v1";

const PERIOD_TIMES = {
  1: ["08:30", "09:10"],
  2: ["09:20", "10:00"],
  3: ["10:20", "11:00"],
  4: ["11:10", "11:50"],
  5: ["14:00", "14:40"],
  6: ["14:50", "15:30"],
  7: ["15:50", "16:30"],
  8: ["16:40", "17:20"],
  9: ["19:00", "19:40"],
  10: ["19:50", "20:30"],
};

const COURSE_COLORS = [
  "#2bbaf9",
  "#f78444",
  "#ff4f8b",
  "#2dd4bf",
  "#f6be43",
  "#8b7bf9",
  "#17a2f2",
  "#e86d79",
  "#6ebf57",
  "#f75f1c",
];

const WEEKDAY_CN = ["涓€", "浜?, "涓?, "鍥?, "浜?, "鍏?, "鏃?];

const SAMPLE_COURSES = [
  {
    id: "c1",
    name: "鍐呯鎶ょ悊瀛︼紙鐞嗚锛?,
    teacher: "璋㈠叏鑳?,
    className: "301涓彮",
    room: "钃夋睙涓€鏁?,
    dayOfWeek: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeks: [13, 14, 15, 16, 17],
    remindEnabled: true,
  },
  {
    id: "c2",
    name: "鑻辫锛堢悊璁猴級",
    teacher: "鍒樻尟浼?,
    className: "315涓彮",
    room: "钃夋睙涓€鏁?,
    dayOfWeek: 2,
    startPeriod: 3,
    endPeriod: 4,
    weeks: [13, 14, 15, 16, 17],
    remindEnabled: true,
  },
  {
    id: "c3",
    name: "棰勯槻鍖诲瀹為獙",
    teacher: "寮犺€佸笀",
    className: "sps5-8",
    room: "瀹為獙瀹ょ粍2",
    dayOfWeek: 1,
    startPeriod: 5,
    endPeriod: 6,
    weeks: [13, 14, 15, 16],
    remindEnabled: true,
  },
  {
    id: "c4",
    name: "涔犺繎骞虫柊鏃朵唬涓浗鐗硅壊绀句細涓讳箟鎬濇兂姒傝",
    teacher: "鐜嬭€佸笀",
    className: "鐞嗚001",
    room: "钃夋睙浜屾暀",
    dayOfWeek: 4,
    startPeriod: 5,
    endPeriod: 6,
    weeks: [13, 14, 15, 16, 17],
    remindEnabled: true,
  },
  {
    id: "c5",
    name: "浣撹偛",
    teacher: "璧佃€佸笀",
    className: "绗洓缁?,
    room: "A-02",
    dayOfWeek: 3,
    startPeriod: 7,
    endPeriod: 8,
    weeks: [13, 15, 17],
    remindEnabled: true,
  },
];

const defaultState = {
  settings: {
    morningTime: "08:00",
    afternoonTime: "13:40",
    beforeMinutes: 3,
    gapThresholdMinutes: 60,
    termName: "2025-2026-2瀛︽湡",
    termStartDate: "2026-03-02",
    holidayDates: [],
  },
  selectedWeekOffset: 0,
  courses: SAMPLE_COURSES,
};

let state = loadState();
let liveReminderTimer = null;
let liveReminderEnabled = false;
const firedReminderKeys = new Set();

const els = {
  termName: document.getElementById("termName"),
  weekLabel: document.getElementById("weekLabel"),
  weekdayHeader: document.getElementById("weekdayHeader"),
  timetableGrid: document.getElementById("timetableGrid"),
  emptyNotice: document.getElementById("emptyNotice"),
  reminderLog: document.getElementById("reminderLog"),
  importType: document.getElementById("importType"),
  importFile: document.getElementById("importFile"),
  importText: document.getElementById("importText"),
  settingsDialog: document.getElementById("settingsDialog"),
  settingsForm: document.getElementById("settingsForm"),
  courseToggleList: document.getElementById("courseToggleList"),
  toggleLiveReminderBtn: document.getElementById("toggleLiveReminderBtn"),
};

bindEvents();
renderAll();

function bindEvents() {
  document.getElementById("prevWeekBtn").addEventListener("click", () => {
    state.selectedWeekOffset -= 1;
    persistAndRender();
  });

  document.getElementById("nextWeekBtn").addEventListener("click", () => {
    state.selectedWeekOffset += 1;
    persistAndRender();
  });

  document.getElementById("todayBtn").addEventListener("click", () => {
    state.selectedWeekOffset = 0;
    persistAndRender();
  });

  document.getElementById("openSettingsBtn").addEventListener("click", openSettings);

  els.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSettings();
  });

  document.getElementById("importBtn").addEventListener("click", handleImport);

  document.getElementById("loadSampleBtn").addEventListener("click", () => {
    state.courses = structuredClone(SAMPLE_COURSES);
    persistAndRender();
    appendLog("宸插姞杞界ず渚嬭琛?);
  });
  document.getElementById("simulateReminderBtn").addEventListener("click", async () => {
    const NN = window.Capacitor?.Plugins?.NativeNotification;
    const delayMs = 15000;

    appendLog(`已安排${Math.floor(delayMs / 1000)}秒后测试弹窗，请先切到后台`);

    if (NN) {
      try {
        await NN.schedule({
          title: "测试提醒",
          body: "这是一条后台系统通知，确认提醒功能正常",
          id: 99999,
          delayMs,
        });
      } catch (e) {
        appendLog("测试提醒调度失败: " + (e?.message || e));
      }
    } else {
      appendLog("NativeNotification插件不可用");
    }
  });

  els.toggleLiveReminderBtn.addEventListener("click", toggleLiveReminder);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      settings: { ...defaultState.settings, ...(parsed.settings || {}) },
      selectedWeekOffset: Number.isFinite(parsed.selectedWeekOffset) ? parsed.selectedWeekOffset : 0,
      courses: Array.isArray(parsed.courses) ? parsed.courses : structuredClone(defaultState.courses),
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function persistAndRender() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  firedReminderKeys.clear();
  renderAll();
}

function renderAll() {
  renderHeader();
  renderGrid();
  renderReminderSnapshot();
}

function renderHeader() {
  const anchorDate = getAnchorDate();
  const currentWeek = getWeekNumber(anchorDate);
  els.termName.textContent = state.settings.termName;
  els.weekLabel.textContent = `绗?{currentWeek}鍛ㄨ琛╜;

  const weekDates = getWeekDates(anchorDate);
  const todayISO = toISODate(new Date());
  els.weekdayHeader.innerHTML = "";

  const corner = document.createElement("div");
  corner.className = "period-head";
  corner.textContent = "鑺傛";
  els.weekdayHeader.appendChild(corner);

  weekDates.forEach((d, index) => {
    const node = document.createElement("div");
    node.className = "weekday-head";
    if (toISODate(d) === todayISO) node.classList.add("today");
    node.innerHTML = `<div>${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}</div><div>鍛?{WEEKDAY_CN[index]}</div>`;
    els.weekdayHeader.appendChild(node);
  });
}

function renderGrid() {
  const anchorDate = getAnchorDate();
  const currentWeek = getWeekNumber(anchorDate);
  const weekDates = getWeekDates(anchorDate);
  const todayISO = toISODate(new Date());

  els.timetableGrid.innerHTML = "";

  for (let period = 1; period <= 10; period += 1) {
    const pl = document.createElement("div");
    pl.className = "period-label";
    pl.style.gridColumn = "1";
    pl.style.gridRow = `${period}`;
    pl.textContent = String(period);
    els.timetableGrid.appendChild(pl);

    for (let day = 1; day <= 7; day += 1) {
      const cell = document.createElement("div");
      cell.className = "grid-cell";
      cell.style.gridColumn = `${day + 1}`;
      cell.style.gridRow = `${period}`;
      if (toISODate(weekDates[day - 1]) === todayISO) cell.classList.add("today");
      els.timetableGrid.appendChild(cell);
    }
  }

  const displayCourses = state.courses.filter(
    (course) => Array.isArray(course.weeks) && course.weeks.includes(currentWeek)
  );

  displayCourses.forEach((course, idx) => {
    const card = document.createElement("div");
    card.className = "course-card";
    card.style.background = COURSE_COLORS[idx % COURSE_COLORS.length];
    card.style.gridColumn = `${course.dayOfWeek + 1}`;
    card.style.gridRow = `${course.startPeriod} / ${course.endPeriod + 1}`;
    card.innerHTML = `<div class="course-name">${escapeHtml(course.name)}</div><div class="course-room">${escapeHtml(course.room || "鏈～鍐欐暀瀹?)}</div>`;
    card.addEventListener("click", () => {
      alert(
        [
          `${course.name}`,
          `鏁欏笀锛?{course.teacher || "-"}`,
          `鐝骇锛?{course.className || "-"}`,
          `鍦扮偣锛?{course.room || "-"}`,
          `鑺傛锛氱${course.startPeriod}-${course.endPeriod}鑺俙,
          `鍛ㄦ锛?{(course.weeks || []).join(",")}`,
          `鎻愰啋锛?{course.remindEnabled === false ? "鍏抽棴" : "寮€鍚?}`,
        ].join("\n")
      );
    });
    els.timetableGrid.appendChild(card);
  });

  els.emptyNotice.hidden = displayCourses.length > 0;
}

function renderReminderSnapshot() {
  const logs = simulateTodayReminders(new Date());
  els.reminderLog.innerHTML = "";
  if (!logs.length) {
    appendLog("浠婃棩鏆傛棤瑙﹀彂鎻愰啋");
    return;
  }
  logs.forEach((msg) => appendLog(msg));
}

function appendLog(text) {
  const latest = els.reminderLog.firstElementChild?.textContent;
  if (latest === text) return;
  const div = document.createElement("div");
  div.className = "log-item";
  div.textContent = text;
  els.reminderLog.prepend(div);
}

async function toggleLiveReminder() {
  if (!liveReminderEnabled) {
    const ok = await requestNotificationPermission();
    if (!ok) {
      appendLog("娴忚鍣ㄩ€氱煡鏉冮檺鏈紑鍚紝浠呭湪椤甸潰鍐呭睍绀烘彁閱?);
    }
    startLiveReminderLoop();
    liveReminderEnabled = true;
    els.toggleLiveReminderBtn.textContent = "鍏抽棴娴忚鍣ㄦ彁閱?;
    appendLog("宸插紑鍚疄鏃舵彁閱掓鏌ワ紙姣?0绉掞級");
    return;
  }

  stopLiveReminderLoop();
  liveReminderEnabled = false;
  els.toggleLiveReminderBtn.textContent = "寮€鍚祻瑙堝櫒鎻愰啋";
  appendLog("宸插叧闂疄鏃舵彁閱掓鏌?);
}

function startLiveReminderLoop() {
  stopLiveReminderLoop();
  runLiveReminderCheck();
  liveReminderTimer = setInterval(runLiveReminderCheck, 30000);
}

function stopLiveReminderLoop() {
  if (liveReminderTimer) {
    clearInterval(liveReminderTimer);
    liveReminderTimer = null;
  }
}

function runLiveReminderCheck() {
  const now = new Date();
  const due = collectDueReminders(now);
  due.forEach((item) => {
    const key = `${toISODate(now)}-${item.type}-${item.courseId || "summary"}-${item.slot}`;
    if (firedReminderKeys.has(key)) return;
    firedReminderKeys.add(key);
    appendLog(item.message);
    pushNotification(item.title, item.body);
  });
}

function collectDueReminders(now) {
  const todayIso = toISODate(now);
  if (state.settings.holidayDates.includes(todayIso)) return [];

  const week = getWeekNumber(now);
  const dayOfWeek = jsDayToCourseDay(now.getDay());
  const todayCourses = state.courses
    .filter(
      (c) =>
        c.dayOfWeek === dayOfWeek &&
        c.remindEnabled !== false &&
        Array.isArray(c.weeks) &&
        c.weeks.includes(week)
    )
    .sort((a, b) => a.startPeriod - b.startPeriod);

  if (!todayCourses.length) return [];

  const due = [];

  const morning = todayCourses.filter((c) => c.startPeriod <= 4);
  const afternoon = todayCourses.filter((c) => c.startPeriod >= 5 && c.startPeriod <= 8);

  if (isWithinMinute(now, state.settings.morningTime) && morning.length) {
    const msg = formatSummary("涓婂崍璇剧▼鎻愰啋", morning);
    due.push({ type: "morning", title: "涓婂崍璇剧▼鎻愰啋", body: msg, message: msg, slot: state.settings.morningTime });
  }

  if (isWithinMinute(now, state.settings.afternoonTime) && afternoon.length) {
    const msg = formatSummary("涓嬪崍璇剧▼鎻愰啋", afternoon);
    due.push({ type: "afternoon", title: "涓嬪崍璇剧▼鎻愰啋", body: msg, message: msg, slot: state.settings.afternoonTime });
  }

  const beforeMin = Number(state.settings.beforeMinutes);
  const threshold = Number(state.settings.gapThresholdMinutes);

  for (let i = 0; i < todayCourses.length - 1; i += 1) {
    const current = todayCourses[i];
    const next = todayCourses[i + 1];
    const currentEnd = periodEndDate(now, current.endPeriod);
    const nextStart = periodStartDate(now, next.startPeriod);

    const gap = (nextStart.getTime() - currentEnd.getTime()) / 60000;
    if (gap > threshold) continue;

    const remindAt = new Date(currentEnd.getTime() - beforeMin * 60000);
    if (!sameMinute(now, remindAt)) continue;

    const body = `${periodToStartTime(next.startPeriod)} 绗?{next.startPeriod}鑺傦綔${next.name}锝?{next.room}`;
    due.push({
      type: "next",
      title: "涓嬭妭璇炬彁閱?,
      body,
      message: `涓嬭妭璇炬彁閱抃n${body}`,
      courseId: next.id,
      slot: toHHMM(remindAt),
    });
  }

  return due;
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  const permission = await Notification.requestPermission();
  return permission === "granted";
}

function pushNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  new Notification(title, { body });
}

function openSettings() {
  const f = els.settingsForm;
  f.morningTime.value = state.settings.morningTime;
  f.afternoonTime.value = state.settings.afternoonTime;
  f.beforeMinutes.value = state.settings.beforeMinutes;
  f.gapThresholdMinutes.value = state.settings.gapThresholdMinutes;
  f.termName.value = state.settings.termName;
  f.termStartDate.value = state.settings.termStartDate;
  f.holidayToday.checked = state.settings.holidayDates.includes(toISODate(new Date()));

  renderCourseToggles();
  els.settingsDialog.showModal();
}

function renderCourseToggles() {
  const map = uniqueCoursesByName(state.courses);
  els.courseToggleList.innerHTML = "";
  map.forEach(({ name, enabled }) => {
    const row = document.createElement("label");
    row.className = "course-toggle";
    const title = document.createElement("span");
    title.textContent = name;
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.courseName = name;
    input.checked = enabled;
    row.appendChild(title);
    row.appendChild(input);
    els.courseToggleList.appendChild(row);
  });
}

function uniqueCoursesByName(courses) {
  const seen = new Map();
  courses.forEach((c) => {
    if (!seen.has(c.name)) {
      seen.set(c.name, { name: c.name, enabled: c.remindEnabled !== false });
    }
  });
  return [...seen.values()];
}

function saveSettings() {
  const f = els.settingsForm;
  const today = toISODate(new Date());
  const holidayDates = new Set(state.settings.holidayDates);

  if (f.holidayToday.checked) holidayDates.add(today);
  else holidayDates.delete(today);

  state.settings = {
    ...state.settings,
    morningTime: f.morningTime.value,
    afternoonTime: f.afternoonTime.value,
    beforeMinutes: Number(f.beforeMinutes.value),
    gapThresholdMinutes: Number(f.gapThresholdMinutes.value),
    termName: f.termName.value.trim(),
    termStartDate: f.termStartDate.value,
    holidayDates: [...holidayDates],
  };

  const toggles = els.courseToggleList.querySelectorAll("input[type='checkbox']");
  const remindMap = new Map();
  toggles.forEach((node) => {
    remindMap.set(node.dataset.courseName, node.checked);
  });

  state.courses = state.courses.map((c) => ({
    ...c,
    remindEnabled: remindMap.has(c.name) ? remindMap.get(c.name) : c.remindEnabled,
  }));

  els.settingsDialog.close();
  persistAndRender();
}

async function handleImport() {
  try {
    const type = els.importType.value;
    let importedCourses = [];

    if (type === "xlsx") {
      importedCourses = await parseXlsxCourses(els.importFile.files[0]);
    } else {
      const text = await getImportText();
      if (!text.trim()) {
        alert("璇峰厛涓婁紶鏂囦欢鎴栫矘璐村唴瀹?);
        return;
      }
      if (type === "json") importedCourses = parseJsonCourses(text);
      if (type === "ical") importedCourses = parseIcsCourses(text);
      if (type === "ocr") importedCourses = parseOcrTextCourses(text);
    }

    if (!importedCourses.length) {
      alert("鏈瘑鍒埌璇剧▼锛岃妫€鏌ユ牸寮?);
      return;
    }

    state.courses = mergeDuplicateCourses(importedCourses).map((c, idx) => ({
      id: c.id || `import-${Date.now()}-${idx}`,
      remindEnabled: c.remindEnabled !== false,
      ...c,
    }));
    state.selectedWeekOffset = 0;
    persistAndRender();
    appendLog(`瀵煎叆鎴愬姛锛?{state.courses.length} 鏉¤绋媊);
  } catch (error) {
    alert(`瀵煎叆澶辫触锛?{error.message}`);
  }
}

function getImportText() {
  const pasted = els.importText.value;
  const file = els.importFile.files[0];
  if (pasted.trim()) return Promise.resolve(pasted);
  if (!file) return Promise.resolve("");
  return file.text();
}

function parseJsonCourses(text) {
  const raw = JSON.parse(text);
  const arr = Array.isArray(raw) ? raw : raw.courses;
  if (!Array.isArray(arr)) throw new Error("JSON 蹇呴』鏄暟缁勬垨 { courses: [] }");
  return arr.map(normalizeCourse).filter(Boolean);
}

function parseIcsCourses(text) {
  const events = text.split("BEGIN:VEVENT").slice(1);
  const courses = [];
  events.forEach((part, index) => {
    const summary = pickIcsField(part, "SUMMARY");
    const location = pickIcsField(part, "LOCATION");
    const dtStart = pickIcsField(part, "DTSTART");
    const byDay = /BYDAY=([A-Z,]+)/.exec(part)?.[1];

    if (!summary || !dtStart) return;

    const date = parseIcsDate(dtStart);
    const dayOfWeek = byDay ? byDayTokenToDay(byDay.split(",")[0]) : jsDayToCourseDay(date.getDay());
    const startPeriod = timeToNearestPeriod(date);
    const endPeriod = Math.min(startPeriod + 1, 10);

    courses.push(
      normalizeCourse({
        id: `ics-${index}`,
        name: summary,
        room: location || "鏈爣娉ㄥ湴鐐?,
        dayOfWeek,
        startPeriod,
        endPeriod,
        weeks: [getWeekNumber(new Date())],
      })
    );
  });
  return courses.filter(Boolean);
}

function parseOcrTextCourses(text) {
  const lines = text
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const courses = [];
  lines.forEach((line, index) => {
    const dayMatch = /鍛?[涓€浜屼笁鍥涗簲鍏棩澶)/.exec(line);
    const periodMatch = /绗?\d+)(?:-(\d+))?鑺?.exec(line);
    const sections = line.split("锝?).map((x) => x.trim());
    if (!dayMatch || !periodMatch || sections.length < 3) return;

    const dayOfWeek = cnDayToNum(dayMatch[1]);
    const startPeriod = Number(periodMatch[1]);
    const endPeriod = Number(periodMatch[2] || periodMatch[1]);

    const namePart = sections[0].replace(/鍛╗涓€浜屼笁鍥涗簲鍏棩澶\s*/, "").replace(/绗琝d+(?:-\d+)?鑺俓s*/, "").trim();
    courses.push(
      normalizeCourse({
        id: `ocr-${index}`,
        name: namePart,
        className: sections[1],
        room: sections[2],
        teacher: sections[3] || "",
        dayOfWeek,
        startPeriod,
        endPeriod,
        weeks: [getWeekNumber(new Date())],
      })
    );
  });
  return courses.filter(Boolean);
}

async function parseXlsxCourses(file) {
  if (!file) throw new Error("璇峰厛閫夋嫨 xlsx 鏂囦欢");
  if (typeof XLSX === "undefined") throw new Error("xlsx 瑙ｆ瀽搴撴湭鍔犺浇");

  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: "array" });
  const rows = [];

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    json.forEach((r) => rows.push(normalizeXlsxRow(r)));
  });

  const courses = [];
  rows.forEach((row, rowIndex) => {
    const scheduleRaw = String(
      row.scheduleRaw || row.schedule || row.timePlace || row.time || ""
    ).trim();
    if (!scheduleRaw) return;

    const courseName = row.courseName || row.course || row.teachClass || "鏈懡鍚嶈绋?;
    const teacher = row.teacher || "";
    const className = extractClassName(row.teachClass || "");
    const slots = extractSlotsFromRawSchedule(scheduleRaw);

    slots.forEach((slot, slotIndex) => {
      courses.push(
        normalizeCourse({
          id: `xlsx-${rowIndex}-${slotIndex}`,
          name: cleanCourseName(courseName),
          teacher,
          className,
          room: slot.room,
          dayOfWeek: slot.dayOfWeek,
          startPeriod: slot.startPeriod,
          endPeriod: slot.endPeriod,
          weeks: slot.weeks,
        })
      );
    });
  });

  return courses.filter(Boolean);
}

function normalizeXlsxRow(row) {
  const normalized = {};
  Object.keys(row || {}).forEach((key) => {
    const k = String(key).trim();
    const v = row[key];
    if (/瀛﹀勾瀛︽湡|xnxq|term/i.test(k)) normalized.term = v;
    if (/璇剧▼鍚嶇О|璇剧▼鍚峾kcmc|course/i.test(k)) normalized.courseName = v;
    if (/璇剧▼缂栫爜|kcbh|code/i.test(k)) normalized.courseCode = v;
    if (/鏁欏鐝瓅teach|class/i.test(k)) normalized.teachClass = v;
    if (/浠昏鏁欏笀|鏁欏笀|js|teacher/i.test(k)) normalized.teacher = v;
    if (/涓婅鏃堕棿鍦扮偣.*鍘熷|鏃堕棿鍦扮偣|schedule|time/i.test(k)) normalized.scheduleRaw = v;
    if (/瀛﹀垎|credit/i.test(k)) normalized.credit = v;
  });
  return normalized;
}

function extractClassName(teachClass) {
  const text = String(teachClass || "");
  const m = text.match(/(\d{3}涓彮|\d{3}鐝瓅鐞嗚\d{3}|[A-Za-z0-9-]+鐝?/);
  return m ? m[1] : text;
}

function cleanCourseName(name) {
  return String(name || "")
    .replace(/\(鐞嗚\)-[^\s;锛沒+/g, "")
    .replace(/\(鐞嗚\)-?/g, "(鐞嗚)")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSlotsFromRawSchedule(raw) {
  const parts = String(raw)
    .replace(/[锛?]/g, "锛?)
    .split("锛?)
    .map((x) => x.trim())
    .filter(Boolean);

  const slots = [];
  parts.forEach((part) => {
    const weeks = parseWeeksFromText(part);
    const dayOfWeek = parseDayFromText(part);
    const periodRange = parsePeriodFromText(part);
    const room = parseRoomFromText(part);
    if (!dayOfWeek || !periodRange) return;

    slots.push({
      weeks,
      dayOfWeek,
      startPeriod: periodRange[0],
      endPeriod: periodRange[1],
      room,
    });
  });
  return slots;
}

function parseWeeksFromText(text) {
  const source = String(text || "").replace(/\s+/g, "");
  const hit = source.match(/绗?[0-9,锛孿-]+)鍛?);
  if (!hit) return [getWeekNumber(new Date())];
  const payload = hit[1].replace(/锛?g, ",");
  const weeks = [];
  payload.split(",").forEach((chunk) => {
    const c = chunk.trim();
    if (!c) return;
    const r = c.match(/^(\d+)-(\d+)$/);
    if (r) {
      const start = Number(r[1]);
      const end = Number(r[2]);
      for (let i = start; i <= end; i += 1) weeks.push(i);
      return;
    }
    if (/^\d+$/.test(c)) weeks.push(Number(c));
  });
  return [...new Set(weeks)].filter((x) => x >= 1 && x <= 30);
}

function parseDayFromText(text) {
  const m = String(text || "").match(/(?:鍛▅鏄熸湡)([涓€浜屼笁鍥涗簲鍏棩澶)/);
  return m ? cnDayToNum(m[1]) : null;
}

function parsePeriodFromText(text) {
  const m = String(text || "").match(/(\d+)(?:-(\d+))?鑺?);
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2] || m[1]);
  if (start < 1 || end > 10 || end < start) return null;
  return [start, end];
}

function parseRoomFromText(text) {
  const source = String(text || "");
  
  // Try 銆?..銆?format first (瀛︿範閫?xlsx)
  const bracketMatch = source.match(/銆?[^銆慮+)銆?);
  if (bracketMatch) {
    const inner = bracketMatch[1].trim();
    // Format: "318涓彮锛堣搲姹燂細涓€鏁欙級" -> "钃夋睙涓€鏁?318涓彮"
    // Format: "杩愬姩鍦?钃夋睙)1" -> "杩愬姩鍦?钃夋睙)1"
    // Format: "408璇煶瀹?钃夋睙锛氫竴鏁?" -> "钃夋睙涓€鏁?408璇煶瀹?
    
    // Check if contains Chinese brackets 锛堬級
    const cnBracket = inner.match(/锛?[^锛塢+)锛?);
    if (cnBracket) {
      const location = cnBracket[1].replace(/[锛?]/g, "").trim();
      const roomNum = inner.replace(/锛圼^锛塢+锛?g, "").trim();
      return roomNum ? `${location} ${roomNum}` : location;
    }
    
    // Check if contains English brackets ()
    const enBracket = inner.match(/\(([^)]+)\)/);
    if (enBracket) {
      // "杩愬姩鍦?钃夋睙)1" -> keep full string as room
      return inner;
    }
    
    return inner;
  }
  
  // Fallback: strip known tokens and try to find room
  const kept = source
    .replace(/绗琜0-9,锛孿-]+鍛?g, "")
    .replace(/(?:鍛▅鏄熸湡)[涓€浜屼笁鍥涗簲鍏棩澶/g, "")
    .replace(/\d+(?:-\d+)?鑺?g, "")
    .replace(/[锛?].*?[锛?]/g, "")
    .replace(/[銆?锛宂+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!kept) return "鏈～鏁欏";

  const roomMatch = kept.match(/([A-Za-z0-9涓€-榫?]*?(鏁檤妤紎瀹棣唡鍦?[A-Za-z0-9涓€-榫?]*)/);
  return roomMatch ? roomMatch[1] : kept;
}

function mergeDuplicateCourses(courses) {
  const map = new Map();
  courses.forEach((course) => {
    if (!course) return;
    const key = [course.name, course.teacher, course.className, course.room, course.dayOfWeek, course.startPeriod, course.endPeriod].join("|");
    if (!map.has(key)) {
      map.set(key, { ...course, weeks: [...(course.weeks || [])] });
      return;
    }
    const existing = map.get(key);
    existing.weeks = [...new Set([...(existing.weeks || []), ...(course.weeks || [])])].sort((a, b) => a - b);
  });
  return [...map.values()];
}

function normalizeCourse(input) {
  const c = { ...input };
  const day = Number(c.dayOfWeek);
  const start = Number(c.startPeriod);
  const end = Number(c.endPeriod);
  if (!c.name || day < 1 || day > 7 || start < 1 || start > 10 || end < start || end > 10) return null;
  return {
    id: c.id || `c-${Math.random().toString(36).slice(2)}`,
    name: String(c.name),
    teacher: String(c.teacher || ""),
    className: String(c.className || ""),
    room: String(c.room || ""),
    dayOfWeek: day,
    startPeriod: start,
    endPeriod: end,
    weeks: Array.isArray(c.weeks) && c.weeks.length ? c.weeks.map(Number) : [getWeekNumber(new Date())],
    remindEnabled: c.remindEnabled !== false,
  };
}

function simulateTodayReminders(baseNow) {
  const todayIso = toISODate(baseNow);
  if (state.settings.holidayDates.includes(todayIso)) {
    return ["浠婃棩宸叉爣璁板仠璇撅紝鑷姩璺宠繃鎻愰啋"]; 
  }

  const week = getWeekNumber(baseNow);
  const dayOfWeek = jsDayToCourseDay(baseNow.getDay());

  const todayCourses = state.courses
    .filter(
      (c) =>
        c.dayOfWeek === dayOfWeek &&
        c.remindEnabled !== false &&
        Array.isArray(c.weeks) &&
        c.weeks.includes(week)
    )
    .sort((a, b) => a.startPeriod - b.startPeriod);

  if (!todayCourses.length) return ["浠婃棩鏃犺锛屾棤闇€鎻愰啋"]; 

  const morning = todayCourses.filter((c) => c.startPeriod <= 4);
  const afternoon = todayCourses.filter((c) => c.startPeriod >= 5 && c.startPeriod <= 8);

  const logs = [];
  if (morning.length) logs.push(formatSummary("涓婂崍璇剧▼鎻愰啋", morning));
  if (afternoon.length) logs.push(formatSummary("涓嬪崍璇剧▼鎻愰啋", afternoon));

  const threshold = Number(state.settings.gapThresholdMinutes);
  const beforeMin = Number(state.settings.beforeMinutes);

  for (let i = 0; i < todayCourses.length - 1; i += 1) {
    const current = todayCourses[i];
    const next = todayCourses[i + 1];
    const currentEnd = periodEndDate(baseNow, current.endPeriod);
    const nextStart = periodStartDate(baseNow, next.startPeriod);
    const diff = (nextStart.getTime() - currentEnd.getTime()) / 60000;
    if (diff <= threshold) {
      logs.push(
        `涓嬭妭璇炬彁閱抃n${periodToStartTime(next.startPeriod)} 绗?{next.startPeriod}鑺傦綔${next.name}锝?{next.room}\n锛堜笅璇惧墠${beforeMin}鍒嗛挓瑙﹀彂锛岄棿闅?{Math.round(diff)}鍒嗛挓锛塦
      );
    }
  }

  return logs;
}

function formatSummary(title, courses) {
  const lines = courses.map((c) => {
    const classPart = c.className ? `锝?{c.className}` : "";
    return `绗?{c.startPeriod}-${c.endPeriod}鑺?${c.name}${classPart}锝?{c.room || "鏈～鏁欏"}`;
  });
  return `${title}\n${lines.join("\n")}`;
}

function isWithinMinute(now, hhmm) {
  return toHHMM(now) === hhmm;
}

function sameMinute(a, b) {
  return toISODate(a) === toISODate(b) && toHHMM(a) === toHHMM(b);
}

function toHHMM(d) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function getAnchorDate() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  today.setDate(today.getDate() + state.selectedWeekOffset * 7);
  return today;
}

function getWeekNumber(date) {
  const start = new Date(state.settings.termStartDate);
  start.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const deltaDays = Math.floor((d.getTime() - start.getTime()) / 86400000);
  return Math.max(1, Math.floor(deltaDays / 7) + 1);
}

function getWeekDates(anchorDate) {
  const d = new Date(anchorDate);
  const jsDay = d.getDay() || 7;
  d.setDate(d.getDate() - jsDay + 1);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x;
  });
}

function periodStartDate(baseDay, period) {
  const [hh, mm] = PERIOD_TIMES[period]?.[0]?.split(":") || ["08", "30"];
  const d = new Date(baseDay);
  d.setHours(Number(hh), Number(mm), 0, 0);
  return d;
}

function periodEndDate(baseDay, period) {
  const [hh, mm] = PERIOD_TIMES[period]?.[1]?.split(":") || ["09", "10"];
  const d = new Date(baseDay);
  d.setHours(Number(hh), Number(mm), 0, 0);
  return d;
}

function periodToStartTime(period) {
  return PERIOD_TIMES[period]?.[0] || "08:30";
}

function timeToNearestPeriod(date) {
  const value = date.getHours() * 60 + date.getMinutes();
  let best = 1;
  let bestDiff = Infinity;
  for (let p = 1; p <= 10; p += 1) {
    const [hh, mm] = PERIOD_TIMES[p][0].split(":").map(Number);
    const pv = hh * 60 + mm;
    const diff = Math.abs(pv - value);
    if (diff < bestDiff) {
      best = p;
      bestDiff = diff;
    }
  }
  return best;
}

function parseIcsDate(raw) {
  const cleaned = raw.replace(/[^0-9T]/g, "");
  if (cleaned.length < 8) return new Date();
  const year = Number(cleaned.slice(0, 4));
  const month = Number(cleaned.slice(4, 6)) - 1;
  const day = Number(cleaned.slice(6, 8));
  const hour = Number(cleaned.slice(9, 11) || 8);
  const minute = Number(cleaned.slice(11, 13) || 30);
  return new Date(year, month, day, hour, minute);
}

function pickIcsField(block, key) {
  const regex = new RegExp(`^${key}(?:;[^:]+)?:\\s*(.+)$`, "m");
  return regex.exec(block)?.[1]?.trim() || "";
}

function jsDayToCourseDay(jsDay) {
  return jsDay === 0 ? 7 : jsDay;
}

function byDayTokenToDay(token) {
  const map = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
  return map[token] || 1;
}

function cnDayToNum(ch) {
  const map = { 涓€: 1, 浜? 2, 涓? 3, 鍥? 4, 浜? 5, 鍏? 6, 鏃? 7, 澶? 7 };
  return map[ch] || 1;
}

function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
