const STORAGE_KEY = "class-reminder-state-v1";

// Capacitor plugins (lazy loaded)
let Preferences = null;
let ForegroundService = null;

async function initCapacitorPlugins() {
  try {
    if (window.Capacitor?.Plugins?.Preferences) {
      Preferences = window.Capacitor.Plugins.Preferences;
    }
    if (window.Capacitor?.Plugins?.ForegroundService) {
      ForegroundService = window.Capacitor.Plugins.ForegroundService;
    }
  } catch (e) {
    console.warn('Capacitor plugin init error:', e);
  }
}

// Persistence: use Preferences if available, fallback to localStorage
async function saveState() {
  const data = JSON.stringify(state);
  if (Preferences) {
    try {
      await Preferences.set({ key: STORAGE_KEY, value: data });
      return;
    } catch (e) {
      console.warn('Preferences save error:', e);
    }
  }
  localStorage.setItem(STORAGE_KEY, data);
}

async function loadStateFromStorage() {
  if (Preferences) {
    try {
      const result = await Preferences.get({ key: STORAGE_KEY });
      if (result.value) return JSON.parse(result.value);
    } catch (e) {
      console.warn('Preferences load error:', e);
    }
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

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

const WEEKDAY_CN = ["一", "二", "三", "四", "五", "六", "日"];

const SAMPLE_COURSES = [
  {
    id: "c1",
    name: "内科护理学（理论）",
    teacher: "谢全胜",
    className: "301中班",
    room: "蓉江一教",
    dayOfWeek: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeks: [1, 2, 3, 4, 5],
    remindEnabled: true,
  },
  {
    id: "c2",
    name: "英语（理论）",
    teacher: "刘振优",
    className: "315中班",
    room: "蓉江一教",
    dayOfWeek: 2,
    startPeriod: 3,
    endPeriod: 4,
    weeks: [1, 2, 3, 4, 5],
    remindEnabled: true,
  },
  {
    id: "c3",
    name: "预防医学实验",
    teacher: "张老师",
    className: "sps5-8",
    room: "实验室组2",
    dayOfWeek: 1,
    startPeriod: 5,
    endPeriod: 6,
    weeks: [1, 2, 3, 4],
    remindEnabled: true,
  },
  {
    id: "c4",
    name: "习近平新时代中国特色社会主义思想概论",
    teacher: "王老师",
    className: "理论001",
    room: "蓉江二教",
    dayOfWeek: 4,
    startPeriod: 5,
    endPeriod: 6,
    weeks: [1, 2, 3, 4, 5],
    remindEnabled: true,
  },
  {
    id: "c5",
    name: "体育",
    teacher: "赵老师",
    className: "第四组",
    room: "A-02",
    dayOfWeek: 3,
    startPeriod: 7,
    endPeriod: 8,
    weeks: [1, 3, 5],
    remindEnabled: true,
  },
];

const defaultState = {
  settings: {
    morningTime: "08:00",
    afternoonTime: "13:40",
    beforeMinutes: 3,
    gapThresholdMinutes: 60,
    termName: "2026-2027-1学期",
    termStartDate: "2026-08-31",
    holidayDates: [],
  },
  selectedWeekOffset: 0,
  liveReminderEnabled: false,
  courses: SAMPLE_COURSES,
};

let state = JSON.parse(JSON.stringify(defaultState));
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
  staleTermNotice: document.getElementById("staleTermNotice"),
};

bindEvents();
initApp();

async function initApp() {
  await initCapacitorPlugins();

  // Initialize notification channel and permission on startup
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (LN) {
    try {
      // Create channel first
      await LN.createChannel({
        id: 'classbell_reminder',
        name: '课程提醒',
        description: '课程提醒弹窗通知',
        importance: 4, // HIGH
        visibility: 1, // PUBLIC
        vibration: true,
      });
      appendLog("通知渠道已创建");

      // Check permission status
      const status = await LN.checkPermissions();
      appendLog("通知权限状态: " + JSON.stringify(status));

      // Request if not granted
      if (status.display !== 'granted') {
        const result = await LN.requestPermissions();
        appendLog("权限请求结果: " + JSON.stringify(result));
      }
    } catch (e) {
      appendLog("通知初始化失败: " + e.message);
    }
  } else {
    appendLog("LocalNotifications 插件不可用");
  }

  // Load persisted state
  const saved = await loadStateFromStorage();
  if (saved) {
    state = {
      settings: { ...defaultState.settings, ...(saved.settings || {}) },
      selectedWeekOffset: Number.isFinite(saved.selectedWeekOffset) ? saved.selectedWeekOffset : 0,
      liveReminderEnabled: saved.liveReminderEnabled === true,
      courses: Array.isArray(saved.courses) ? saved.courses : JSON.parse(JSON.stringify(defaultState.courses)),
    };
  }

  liveReminderEnabled = state.liveReminderEnabled || false;

  await autoImportOnFirstRun();

  // Auto-restore live reminder if it was enabled before
  if (liveReminderEnabled) {
    els.toggleLiveReminderBtn.textContent = "关闭实时提醒";
    appendLog("已自动恢复提醒");
    scheduleTodayReminders();
  }

  // Initialize keep-alive engine (only if there are upcoming classes)
  await initKeepAliveEngine();
}

// ==================== 保活引擎 JS 桥接 ====================

async function initKeepAliveEngine() {
  const NN = window.Capacitor?.Plugins?.NativeNotification;
  if (!NN) {
    appendLog("保活引擎不可用（非原生环境）");
    return;
  }

  try {
    // 检查是否有即将到来的课程（12小时内）
    const now = new Date();
    const hasUpcomingClass = checkHasUpcomingClass(now, 12);

    if (!hasUpcomingClass) {
      appendLog("12小时内无课程，保活引擎暂不启动");
      return;
    }

    // Prepare courses data for native engine
    const coursesJson = JSON.stringify(state.courses || []);
    const holidayDates = (state.settings?.holidayDates || []).join(",");
    const termStartDate = state.settings?.termStartDate || "";

    const result = await NN.initKeepAliveEngine({
      coursesJson,
      holidayDates,
      termStartDate,
    });

    appendLog(`保活引擎已启动，当前模式：${result.modeName}`);

    // Get vendor info
    const vendorInfo = await NN.getVendorInfo();
    if (vendorInfo.needAutoStartGuide || vendorInfo.needBatteryOptimizationGuide) {
      appendLog(`检测到${vendorInfo.vendor}设备，建议开启自启动和电池优化白名单`);
    }
  } catch (e) {
    console.warn("initKeepAliveEngine error:", e);
    appendLog("保活引擎初始化失败: " + (e?.message || e));
  }
}

async function syncCoursesToNative() {
  const NN = window.Capacitor?.Plugins?.NativeNotification;
  if (!NN) return;

  try {
    const coursesJson = JSON.stringify(state.courses || []);
    const result = await NN.updateCourses({ coursesJson });
    // Refresh widget after course update
    await NN.refreshWidget();
    return result;
  } catch (e) {
    console.warn("syncCoursesToNative error:", e);
  }
}

async function triggerModeCheck() {
  const NN = window.Capacitor?.Plugins?.NativeNotification;
  if (!NN) return;

  try {
    const result = await NN.triggerModeCheck();
    appendLog(`模式检查：${result.modeName}`);
    return result;
  } catch (e) {
    console.warn("triggerModeCheck error:", e);
  }
}

async function openAutoStartSettings() {
  const NN = window.Capacitor?.Plugins?.NativeNotification;
  if (!NN) return;
  try {
    await NN.openAutoStartSettings();
  } catch (e) {
    console.warn("openAutoStartSettings error:", e);
  }
}

async function openBatteryOptimizationSettings() {
  const NN = window.Capacitor?.Plugins?.NativeNotification;
  if (!NN) return;
  try {
    await NN.openBatteryOptimizationSettings();
  } catch (e) {
    console.warn("openBatteryOptimizationSettings error:", e);
  }
}

async function openNotificationSettings() {
  const NN = window.Capacitor?.Plugins?.NativeNotification;
  if (!NN) return;
  try {
    await NN.openNotificationSettings();
  } catch (e) {
    console.warn("openNotificationSettings error:", e);
  }
}

// 兼容 assets 里的两种字段风格：
//   A. 每周一条（老格式）：{ week, day, name, teacher, room, startPeriod, endPeriod }
//   B. 已带周次数组（新格式）：{ weeks, dayOfWeek, name, teacher, room, startPeriod, endPeriod }
function normalizeAssetRows(data) {
  return data.map((c, i) => ({
    id: `asset-${i}`,
    name: c.name,
    teacher: c.teacher || "",
    className: c.className || "",
    room: c.room || "",
    dayOfWeek: c.dayOfWeek !== undefined ? c.dayOfWeek : c.day,
    startPeriod: c.startPeriod,
    endPeriod: c.endPeriod,
    weeks: Array.isArray(c.weeks) ? c.weeks : c.week !== undefined ? [c.week] : undefined,
  }));
}

async function autoImportOnFirstRun() {
  const existing = await loadStateFromStorage();
  if (existing && existing.courses && existing.courses.length > 0) {
    renderAll();
    return;
  }
  try {
    const resp = await fetch("courses-final.json");
    if (!resp.ok) {
      renderAll();
      return;
    }
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) {
      renderAll();
      return;
    }

    // 关键：先走 normalizeCourse 补全 id / className / remindEnabled，
    // 再用 mergeDuplicateCourses 按「课程+时间+教室」合并周次。
    // 以前这里手写分组把 teacher 也算进 key，多位教师轮班上课时同一节课会被切成几十条碎片。
    const parsed = normalizeAssetRows(data).map(normalizeCourse).filter(Boolean);
    if (!parsed.length) {
      renderAll();
      return;
    }

    state.courses = mergeDuplicateCourses(parsed).map((c, idx) => ({
      ...c,
      id: c.id || `asset-${idx}`,
      remindEnabled: c.remindEnabled !== false,
    }));
    persistAndRender();
    appendLog(`已自动导入课表数据（${state.courses.length} 条）`);
  } catch {
    renderAll();
  }
}

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
    state.courses = JSON.parse(JSON.stringify(SAMPLE_COURSES));
    persistAndRender();
    appendLog("已加载示例课表");
  });

  document.getElementById("simulateReminderBtn").addEventListener("click", async () => {
    const NN = window.Capacitor?.Plugins?.NativeNotification;
    const delayMs = 3000;

    // 立即展示应用内横幅
    showAppNotification("课程提醒", "这是一条测试通知，确认提醒功能正常");
    appendLog("已展示应用内提醒");

    // 安排3秒后弹窗（切后台后生效）
    if (NN) {
      try {
        await NN.schedule({
          title: '课程提醒',
          body: '这是一条后台系统通知，确认提醒功能正常',
          id: 99999,
          delayMs,
        });
        appendLog(`已安排${Math.floor(delayMs / 1000)}秒后弹窗，请切到后台测试`);
      } catch (e) {
        appendLog('测试提醒调度失败: ' + (e?.message || e));
      }
    }

    renderTodayCourses();
  });

  els.toggleLiveReminderBtn.addEventListener("click", toggleLiveReminder);
}

function persistAndRender() {
  saveState();
  firedReminderKeys.clear();
  renderAll();
}

function renderAll() {
  renderHeader();
  renderGrid();
  renderReminderSnapshot();
  updateStaleTermNotice();
}

// ==================== 学期过期检测 / 周次校准 ====================
// 这是最容易踩的坑：学期开始日期还停留在上一学期时，
// 算出来的周次远超课表范围，课表一片空白，而界面上毫无提示，用户只会以为「导入失败」。
function getMaxCourseWeek() {
  let max = 0;
  state.courses.forEach((c) => {
    if (!Array.isArray(c.weeks)) return;
    c.weeks.forEach((w) => {
      if (Number.isFinite(w) && w > max) max = w;
    });
  });
  return max;
}

let lastStaleNoticeSig = null;

function updateStaleTermNotice() {
  const el = els.staleTermNotice;
  if (!el) return;

  const currentWeek = getWeekNumber(new Date());
  const maxWeek = getMaxCourseWeek();
  const isStale = maxWeek > 0 && currentWeek > maxWeek;

  if (!isStale) {
    if (!el.hidden) {
      el.hidden = true;
      el.innerHTML = "";
      lastStaleNoticeSig = null;
    }
    return;
  }

  // 内容没变化就不重建 DOM，避免每次渲染都闪一下
  const sig = `${currentWeek}|${maxWeek}|${state.settings.termStartDate}`;
  if (sig === lastStaleNoticeSig) return;
  lastStaleNoticeSig = sig;

  el.hidden = false;
  el.innerHTML = `
    <div class="stale-term-text">
      当前算出是第 <b>${currentWeek}</b> 周，但课表只到第 <b>${maxWeek}</b> 周。<br />
      多半是「学期开始日期」还停在上一学期（当前：${state.settings.termStartDate}）。
    </div>
    <button id="calibrateWeekBtn" class="warn-btn">校准周次</button>
  `;
  const btn = document.getElementById("calibrateWeekBtn");
  if (btn) btn.addEventListener("click", calibrateTermStart);
}

// 让用户用「今天是我这学期第几周」来反推学期开始日期 —— 比让他去翻校历算日期可靠得多
function calibrateTermStart() {
  const answer = prompt("今天是你本学期第几周？（填数字，例如今天刚开始第三周就填 3）", "1");
  if (answer === null) return;

  const week = Number(String(answer).trim());
  if (!Number.isInteger(week) || week < 1 || week > 30) {
    alert("请输入 1 到 30 之间的周次");
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const jsDay = today.getDay() || 7;
  const monday = new Date(today);
  monday.setDate(monday.getDate() - jsDay + 1); // 本周周一
  const termStart = new Date(monday);
  termStart.setDate(termStart.getDate() - (week - 1) * 7); // 第 1 周的周一

  state.settings.termStartDate = toISODate(termStart);
  persistAndRender();
  appendLog(`学期开始日期已设为 ${state.settings.termStartDate}（今天 = 第 ${week} 周）`);
}

function renderHeader() {
  const anchorDate = getAnchorDate();
  const currentWeek = getWeekNumber(anchorDate);
  els.termName.textContent = state.settings.termName;
  els.weekLabel.textContent = `第${currentWeek}周课表`;

  const weekDates = getWeekDates(anchorDate);
  const todayISO = toISODate(new Date());
  els.weekdayHeader.innerHTML = "";

  const corner = document.createElement("div");
  corner.className = "period-head";
  corner.textContent = "节次";
  els.weekdayHeader.appendChild(corner);

  weekDates.forEach((d, index) => {
    const node = document.createElement("div");
    node.className = "weekday-head";
    if (toISODate(d) === todayISO) node.classList.add("today");
    node.innerHTML = `<div>${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}</div><div>周${WEEKDAY_CN[index]}</div>`;
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
    card.innerHTML = `<div class="course-name">${escapeHtml(course.name)}</div><div class="course-room">${escapeHtml(course.room || "未填写教室")}</div>`;
    card.addEventListener("click", () => {
      const timeFrom = PERIOD_TIMES[course.startPeriod]?.[0] || "";
      const timeTo = PERIOD_TIMES[course.endPeriod]?.[1] || "";
      alert(
        [
          `${course.name}`,
          `教师：${course.teacher || "-"}`,
          `班级：${course.className || "-"}`,
          `地点：${course.room || "-"}`,
          `节次：第${course.startPeriod}-${course.endPeriod}节`,
          `时间：${timeFrom} - ${timeTo}`,
          `周次：${(course.weeks || []).join(",")}`,
          `提醒：${course.remindEnabled === false ? "关闭" : "开启"}`,
        ].join("\n")
      );
    });
    els.timetableGrid.appendChild(card);
  });

  els.emptyNotice.hidden = displayCourses.length > 0;
}

function renderReminderSnapshot() {
  renderTodayCourses();
}

// ==================== 灵动岛辅助函数 ====================

function getNextClassInfo() {
  const now = new Date();
  const week = getWeekNumber(now);
  const dayOfWeek = jsDayToCourseDay(now.getDay());
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeMinutes = currentHour * 60 + currentMinute;

  // 获取今天的课程
  const todayCourses = state.courses
    .filter(c => c.dayOfWeek === dayOfWeek && c.remindEnabled !== false &&
      Array.isArray(c.weeks) && c.weeks.includes(week))
    .sort((a, b) => a.startPeriod - b.startPeriod);

  // 找到下一节课
  for (const course of todayCourses) {
    const classStartTime = getPeriodStartTimeMinutes(course.startPeriod);
    if (classStartTime > currentTimeMinutes) {
      return course;
    }
  }

  // 如果今天没有更多课程，返回明天的第一节
  const tomorrowDayOfWeek = dayOfWeek === 7 ? 1 : dayOfWeek + 1;
  const tomorrowCourses = state.courses
    .filter(c => c.dayOfWeek === tomorrowDayOfWeek && c.remindEnabled !== false &&
      Array.isArray(c.weeks) && c.weeks.includes(week))
    .sort((a, b) => a.startPeriod - b.startPeriod);

  return tomorrowCourses.length > 0 ? tomorrowCourses[0] : null;
}

function getPeriodStartTimeMinutes(period) {
  const times = {
    1: 8 * 60 + 30,   // 08:30
    2: 9 * 60 + 20,   // 09:20
    3: 10 * 60 + 20,  // 10:20
    4: 11 * 60 + 10,  // 11:10
    5: 14 * 60,       // 14:00
    6: 14 * 60 + 50,  // 14:50
    7: 15 * 60 + 50,  // 15:50
    8: 16 * 60 + 40,  // 16:40
    9: 19 * 60,       // 19:00
    10: 19 * 60 + 50, // 19:50
  };
  return times[period] || 8 * 60 + 30;
}

function formatPeriodTime(period) {
  const times = {
    1: "08:30",
    2: "09:20",
    3: "10:20",
    4: "11:10",
    5: "14:00",
    6: "14:50",
    7: "15:50",
    8: "16:40",
    9: "19:00",
    10: "19:50",
  };
  return times[period] || "08:30";
}

function calculateCountdown(period) {
  const now = new Date();
  const classTimeMinutes = getPeriodStartTimeMinutes(period);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const diffMinutes = classTimeMinutes - currentMinutes;

  if (diffMinutes < 0) {
    return "正在上课";
  } else if (diffMinutes < 60) {
    return diffMinutes + "分钟后";
  } else {
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    return mins > 0 ? `${hours}小时${mins}分钟后` : `${hours}小时后`;
  }
}

// 检查指定小时内是否有课程
function checkHasUpcomingClass(now, hoursAhead) {
  const week = getWeekNumber(now);
  const dayOfWeek = jsDayToCourseDay(now.getDay());
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const aheadMinutes = hoursAhead * 60;

  // 检查今天剩余课程
  const todayCourses = state.courses
    .filter(c => c.dayOfWeek === dayOfWeek && c.remindEnabled !== false &&
      Array.isArray(c.weeks) && c.weeks.includes(week))
    .sort((a, b) => a.startPeriod - b.startPeriod);

  for (const course of todayCourses) {
    const classStartTime = getPeriodStartTimeMinutes(course.startPeriod);
    const diff = classStartTime - currentMinutes;
    if (diff > 0 && diff <= aheadMinutes) {
      return true;
    }
  }

  // 检查明天课程（如果跨天）
  if (hoursAhead > 24 - now.getHours()) {
    const tomorrowDayOfWeek = dayOfWeek === 7 ? 1 : dayOfWeek + 1;
    const tomorrowCourses = state.courses
      .filter(c => c.dayOfWeek === tomorrowDayOfWeek && c.remindEnabled !== false &&
        Array.isArray(c.weeks) && c.weeks.includes(week));

    if (tomorrowCourses.length > 0) {
      return true;
    }
  }

  return false;
}

// ==================== 今日课程渲染 ====================

function renderTodayCourses() {
  const now = new Date();
  const todayIso = toISODate(now);
  const week = getWeekNumber(now);
  const dayOfWeek = jsDayToCourseDay(now.getDay());

  els.reminderLog.innerHTML = "";

  if (state.settings.holidayDates.includes(todayIso)) {
    appendLog("今日已标记停课");
    return;
  }

  const todayCourses = state.courses
    .filter(
      (c) =>
        c.dayOfWeek === dayOfWeek &&
        c.remindEnabled !== false &&
        Array.isArray(c.weeks) &&
        c.weeks.includes(week)
    )
    .sort((a, b) => a.startPeriod - b.startPeriod);

  if (!todayCourses.length) {
    appendLog("今日无课");
    return;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const remaining = todayCourses.filter((c) => {
    const [, endH, endM] = (PERIOD_TIMES[c.endPeriod]?.[1] || "20:30").match(/(\d+):(\d+)/).map(Number);
    return endH * 60 + endM > nowMinutes;
  });

  if (!remaining.length) {
    appendLog("今日课程已全部结束");
    return;
  }

  appendLog(`今日剩余 ${remaining.length} 节课：`);
  remaining.forEach((c) => {
    const timeFrom = PERIOD_TIMES[c.startPeriod]?.[0] || "";
    const timeTo = PERIOD_TIMES[c.endPeriod]?.[1] || "";
    appendLogBottom(`${timeFrom}-${timeTo} 第${c.startPeriod}-${c.endPeriod}节 ${c.name}｜${c.room || "未填教室"}`);
  });
}

function appendLog(text) {
  const latest = els.reminderLog.firstElementChild?.textContent;
  if (latest === text) return;
  const div = document.createElement("div");
  div.className = "log-item";
  div.textContent = text;
  els.reminderLog.prepend(div);
}

function appendLogBottom(text) {
  const div = document.createElement("div");
  div.className = "log-item";
  div.textContent = text;
  els.reminderLog.appendChild(div);
}

async function toggleLiveReminder() {
  if (!liveReminderEnabled) {
    const ok = await requestNotificationPermission();
    if (!ok) {
      appendLog("通知权限未开启，请在系统设置中允许通知");
    } else {
      appendLog("通知权限已开启");
    }
    startLiveReminderLoop();
    liveReminderEnabled = true;
    state.liveReminderEnabled = true;
    saveState();
    els.toggleLiveReminderBtn.textContent = "关闭实时提醒";
    appendLog("已开启提醒");
    return;
  }

  stopLiveReminderLoop();
  liveReminderEnabled = false;
  state.liveReminderEnabled = false;
  saveState();
  els.toggleLiveReminderBtn.textContent = "开启实时提醒";
  appendLog("已关闭提醒");
}

function startLiveReminderLoop() {
  stopLiveReminderLoop();
  scheduleTodayReminders();
}

function stopLiveReminderLoop() {
  cancelScheduledNotifications();
}

// Schedule all of today's remaining reminders as timed notifications
// These survive app kill — Android AlarmManager fires them
async function scheduleTodayReminders() {
  const now = new Date();
  const items = collectScheduledReminders(now);
  const futureItems = items.filter((item) => item.at.getTime() > now.getTime());

  if (!futureItems.length) {
    appendLog("今日剩余课程时间已过");
    return;
  }

  const NN = window.Capacitor?.Plugins?.NativeNotification;
  if (!NN) {
    appendLog("定时通知不可用");
    return;
  }

  try {
    // Schedule each reminder via AlarmManager (survives app kill)
    for (const item of futureItems) {
      const delayMs = item.at.getTime() - now.getTime();
      if (delayMs <= 0) continue;

      await NN.schedule({
        title: item.title || "课程提醒",
        body: item.body || "",
        id: Math.floor(item.at.getTime() / 1000) % 100000,
        delayMs: delayMs,
      });
    }

    appendLog(`已安排 ${futureItems.length} 条提醒`);
  } catch (e) {
    console.warn('schedule error:', e);
    appendLog("安排失败: " + e.message);
  }
}

async function cancelScheduledNotifications() {
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (LN) {
    try {
      const pending = await LN.getPending();
      if (pending.notifications.length) {
        await LN.cancel({ notifications: pending.notifications });
      }
    } catch (e) { /* ignore */ }
  }
}

// Build today's reminders with exact fire times
function collectScheduledReminders(now) {
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

  const items = [];
  const [todayY, todayM, todayD] = todayIso.split("-").map(Number);

  // Morning summary
  const morning = todayCourses.filter((c) => c.startPeriod <= 4);
  if (morning.length) {
    const [h, m] = state.settings.morningTime.split(":").map(Number);
    items.push({
      type: "morning",
      title: "上午课程提醒",
      body: formatSummary("上午课程提醒", morning),
      at: new Date(todayY, todayM - 1, todayD, h, m, 0),
    });
  }

  // Afternoon summary
  const afternoon = todayCourses.filter((c) => c.startPeriod >= 5 && c.startPeriod <= 8);
  if (afternoon.length) {
    const [h, m] = state.settings.afternoonTime.split(":").map(Number);
    items.push({
      type: "afternoon",
      title: "下午课程提醒",
      body: formatSummary("下午课程提醒", afternoon),
      at: new Date(todayY, todayM - 1, todayD, h, m, 0),
    });
  }

  // Before-class reminders (room change)
  const beforeMin = Number(state.settings.beforeMinutes);
  const threshold = Number(state.settings.gapThresholdMinutes);

  for (let i = 0; i < todayCourses.length - 1; i += 1) {
    const current = todayCourses[i];
    const next = todayCourses[i + 1];
    const currentEnd = periodEndDate(now, current.endPeriod);
    const nextStart = periodStartDate(now, next.startPeriod);

    const gap = (nextStart.getTime() - currentEnd.getTime()) / 60000;
    if (gap > threshold) continue;
    if (current.room === next.room) continue;

    const remindAt = new Date(currentEnd.getTime() - beforeMin * 60000);
    const body = `${periodToStartTime(next.startPeriod)} 第${next.startPeriod}节｜${next.name || "未命名课程"}｜${next.room || "未填写教室"}`;
    items.push({
      type: "next",
      title: "下节课提醒",
      body,
      at: remindAt,
    });
  }

  // Individual course reminders (课前N分钟提醒)
  for (const course of todayCourses) {
    const classStartTime = periodStartDate(now, course.startPeriod);
    const remindAt = new Date(classStartTime.getTime() - beforeMin * 60000);

    // 只安排未来的提醒
    if (remindAt.getTime() <= now.getTime()) continue;

    const timeStr = periodToStartTime(course.startPeriod);
    const name = course.name || "未命名课程";
    const room = course.room || "未填写教室";
    const teacher = course.teacher || "";

    const body = teacher
      ? `${timeStr} 第${course.startPeriod}节｜${name}｜${room}｜${teacher}`
      : `${timeStr} 第${course.startPeriod}节｜${name}｜${room}`;

    items.push({
      type: "course",
      title: `课程提醒：${name}`,
      body,
      at: remindAt,
    });
  }

  return items;
}

function runLiveReminderCheck() {}

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
    const msg = formatSummary("上午课程提醒", morning);
    due.push({ type: "morning", title: "上午课程提醒", body: msg, message: msg, slot: state.settings.morningTime });
  }

  if (isWithinMinute(now, state.settings.afternoonTime) && afternoon.length) {
    const msg = formatSummary("下午课程提醒", afternoon);
    due.push({ type: "afternoon", title: "下午课程提醒", body: msg, message: msg, slot: state.settings.afternoonTime });
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

    // Skip reminder if same room (no need to change classroom)
    if (current.room === next.room) continue;

    const remindAt = new Date(currentEnd.getTime() - beforeMin * 60000);
    if (!sameMinute(now, remindAt)) continue;

    const body = `${periodToStartTime(next.startPeriod)} 第${next.startPeriod}节｜${next.name}｜${next.room}`;
    due.push({
      type: "next",
      title: "下节课提醒",
      body,
      message: `下节课提醒\n${body}`,
      courseId: next.id,
      slot: toHHMM(remindAt),
    });
  }

  return due;
}

async function requestNotificationPermission() {
  // Capacitor LocalNotifications on native
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
    try {
      const perm = await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
      return perm.display === 'granted';
    } catch (e) {
      console.warn('LocalNotifications permission error:', e);
      return false;
    }
  }
  // Fallback: Web Notification API (browser)
  if ("Notification" in window) {
    if (Notification.permission === "granted") return true;
    const p = await Notification.requestPermission();
    return p === "granted";
  }
  return false;
}

// Show in-app notification banner (slides down from top)
function showAppNotification(title, body) {
  // Remove existing banner if any
  const existing = document.querySelector('.app-notification');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = 'app-notification';
  el.innerHTML = `<div class="app-notification-title">${escapeHtml(title)}</div><div class="app-notification-body">${escapeHtml(body)}</div>`;
  document.body.appendChild(el);

  // Trigger animation
  requestAnimationFrame(() => {
    el.classList.add('show');
  });

  // Auto dismiss after 4 seconds
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 4000);

  // Tap to dismiss
  el.addEventListener('click', () => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  });
}

async function pushNotification(title, body) {
  // Try native plugin first (PRIORITY_HIGH, works on Xiaomi)
  const NN = window.Capacitor?.Plugins?.NativeNotification;
  if (NN) {
    try {
      await NN.notify({ title, body, id: Math.floor(Date.now() / 1000) });
      return;
    } catch (e) {
      console.warn('NativeNotification error:', e);
    }
  }
  // Fallback to Capacitor LocalNotifications
  const LN = window.Capacitor?.Plugins?.LocalNotifications;
  if (LN) {
    try {
      await LN.createChannel({
        id: 'classbell_reminder',
        name: '课程提醒',
        description: '课程提醒弹窗通知',
        importance: 4,
        visibility: 1,
        vibration: true,
      }).catch(() => {});
      await LN.schedule({
        notifications: [{
          title,
          body,
          id: Math.floor(Date.now() / 1000),
          smallIcon: 'ic_launcher',
          channelId: 'classbell_reminder',
          schedule: { at: new Date(Date.now() + 1000) },
        }]
      });
      return;
    } catch (e) {
      console.warn('LocalNotifications error:', e);
    }
  }
  // Fallback: Web Notification API
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
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
        alert("请先上传文件或粘贴内容");
        return;
      }
      if (type === "json") importedCourses = parseJsonCourses(text);
      if (type === "ical") importedCourses = parseIcsCourses(text);
      if (type === "ocr") importedCourses = parseOcrTextCourses(text);
    }

    if (!importedCourses.length) {
      alert("未识别到课程，请检查格式");
      return;
    }

    state.courses = mergeDuplicateCourses(importedCourses).map((c, idx) => ({
      id: c.id || `import-${Date.now()}-${idx}`,
      remindEnabled: c.remindEnabled !== false,
      ...c,
    }));
    state.selectedWeekOffset = 0;
    persistAndRender();
    appendLog(`导入成功：${state.courses.length} 条课程`);
  } catch (error) {
    alert(`导入失败：${error.message}`);
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
  if (!Array.isArray(arr)) throw new Error("JSON 必须是数组或 { courses: [] }");
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
        room: location || "未标注地点",
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
    const dayMatch = /周([一二三四五六日天])/.exec(line);
    const periodMatch = /第(\d+)(?:-(\d+))?节/.exec(line);
    const sections = line.split("｜").map((x) => x.trim());
    if (!dayMatch || !periodMatch || sections.length < 3) return;

    const dayOfWeek = cnDayToNum(dayMatch[1]);
    const startPeriod = Number(periodMatch[1]);
    const endPeriod = Number(periodMatch[2] || periodMatch[1]);

    const namePart = sections[0].replace(/周[一二三四五六日天]\s*/, "").replace(/第\d+(?:-\d+)?节\s*/, "").trim();
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

// xlsx 解析库：优先用打包进 APK 的本地副本（离线可用、校园网访问不到 CDN 也不受影响），
// 本地缺失时再临时回退到 CDN。以前直接把 CDN 写在 <script> 里，CDN 一不可达就抛
// “xlsx 解析库未加载”，而用户完全不知道发生了什么。
async function ensureXlsx() {
  if (typeof XLSX !== "undefined") return true;
  const sources = [
    "./vendor/xlsx.full.min.js",
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
  ];
  for (const src of sources) {
    try {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("加载失败 " + src));
        setTimeout(() => reject(new Error("加载超时 " + src)), 15000);
        document.head.appendChild(script);
      });
      if (typeof XLSX !== "undefined") return true;
    } catch (e) {
      console.warn("xlsx loader:", e.message);
    }
  }
  return false;
}

async function parseXlsxCourses(file) {
  if (!file) throw new Error("请先选择 xlsx 文件");
  if (typeof XLSX === "undefined") {
    const ok = await ensureXlsx();
    if (!ok) throw new Error("xlsx 解析库加载失败：本地副本缺失，且无法访问 CDN（请检查网络）");
  }

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

    const courseName = row.courseName || row.course || row.teachClass || "未命名课程";
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
    if (/学年学期|xnxq|term/i.test(k)) normalized.term = v;
    if (/课程名称|课程名|kcmc|course/i.test(k)) normalized.courseName = v;
    if (/课程编码|kcbh|code/i.test(k)) normalized.courseCode = v;
    if (/教学班|teach|class/i.test(k)) normalized.teachClass = v;
    if (/任课教师|教师|js|teacher/i.test(k)) normalized.teacher = v;
    if (/上课时间地点.*原始|时间地点|schedule|time/i.test(k)) normalized.scheduleRaw = v;
    if (/学分|credit/i.test(k)) normalized.credit = v;
  });
  return normalized;
}

function extractClassName(teachClass) {
  const text = String(teachClass || "");
  // 从具体到宽泛逐个尝试：既有 301中班 这类老格式，也要支持 24级护理4班 这类新格式
  const patterns = [
    /(\d{3}(?:中班|大班|合班))/,
    /(\d{2}级[^\s,，、;；()（）]{0,12}?\d+班)/,
    /(理论\d{3})/,
    /([A-Za-z0-9-]+班)/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return text;
}

function cleanCourseName(name) {
  return String(name || "")
    .replace(/\(理论\)-[^\s;；]+/g, "")
    .replace(/\(理论\)-?/g, "(理论)")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSlotsFromRawSchedule(raw) {
  // CRITICAL: Protect commas inside week lists like "第11,16周" before splitting
  // Strategy: Replace commas that are between digits and 周 with a placeholder
  let protected = String(raw)
    .replace(/(\d),(\d)/g, "$1§COMMA§$2")  // protect digit,digit
    .replace(/(\d)，(\d)/g, "$1§COMMA§$2"); // protect digit，digit
  
  // Now split by explicit separators: ; , ；
  let parts = protected
    .replace(/[；;,，]/g, "；")
    .split("；")
    .map((x) => x.trim().replace(/§COMMA§/g, ","))  // restore protected commas
    .filter(Boolean);

  // Further split parts that contain multiple "第X周" patterns without separator
  // Also handle "第4周 星期五 3-4节 第14-15周 星期五 5-6节【教室】"
  const expanded = [];
  parts.forEach((part) => {
    // Split by "第X周" or "第X-Y周" or "第X,Y周" when followed by another "第" pattern
    const subParts = part.split(/(?=第\d[\d,\-]*周)/).filter(Boolean);
    if (subParts.length <= 1) {
      expanded.push(part);
    } else {
      subParts.forEach((sp) => {
        if (/第\d[\d,\-]*周/.test(sp)) expanded.push(sp.trim());
      });
    }
  });

  const slots = [];
  expanded.forEach((part) => {
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
  // Match all "第X周" or "第X-Y周" or "第X,Y,Z周" patterns
  const allMatches = source.match(/第([0-9,，\-]+)周/g);
  if (!allMatches) return [getWeekNumber(new Date())];
  
  const weeks = [];
  allMatches.forEach((match) => {
    const hit = match.match(/第([0-9,，\-]+)周/);
    if (!hit) return;
    const payload = hit[1].replace(/，/g, ",");
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
  });
  return [...new Set(weeks)].filter((x) => x >= 1 && x <= 30);
}

function parseDayFromText(text) {
  const m = String(text || "").match(/(?:周|星期)([一二三四五六日天])/);
  return m ? cnDayToNum(m[1]) : null;
}

function parsePeriodFromText(text) {
  const m = String(text || "").match(/(\d+)(?:-(\d+))?节/);
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2] || m[1]);
  if (start < 1 || end > 10 || end < start) return null;
  return [start, end];
}

function parseRoomFromText(text) {
  const source = String(text || "");
  
  // Try 【...】 format first (学习通 xlsx)
  const bracketMatch = source.match(/【([^】]+)】/);
  if (bracketMatch) {
    const inner = bracketMatch[1].trim();
    // Format: "318中班（蓉江：一教）" -> "蓉江一教 318中班"
    // Format: "运动场(蓉江)1" -> "运动场(蓉江)1"
    // Format: "408语音室(蓉江：一教)" -> "蓉江一教 408语音室"
    
    // Check if contains Chinese brackets （）
    const cnBracket = inner.match(/（([^）]+)）/);
    if (cnBracket) {
      const location = cnBracket[1].replace(/[：:]/g, "").trim();
      const roomNum = inner.replace(/（[^）]+）/g, "").trim();
      return roomNum ? `${location} ${roomNum}` : location;
    }
    
    // Check if contains English brackets ()
    const enBracket = inner.match(/\(([^)]+)\)/);
    if (enBracket) {
      // "运动场(蓉江)1" -> keep full string as room
      return inner;
    }
    
    return inner;
  }
  
  // Fallback: strip known tokens and try to find room
  const kept = source
    .replace(/第[0-9,，\-]+周/g, "")
    .replace(/(?:周|星期)[一二三四五六日天]/g, "")
    .replace(/\d+(?:-\d+)?节/g, "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[、,，]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!kept) return "未填教室";

  const roomMatch = kept.match(/([A-Za-z0-9一-龥-]*?(教|楼|室|馆|场)[A-Za-z0-9一-龥-]*)/);
  return roomMatch ? roomMatch[1] : kept;
}

function mergeDuplicateCourses(courses) {
  const map = new Map();
  courses.forEach((course) => {
    if (!course) return;
    // 只有「同一门课 + 同一时间 + 同一教室」才合并周次。
    // 不要把 teacher 放进 key：多位教师轮班上课时每周 teacher 不同，
    // 会导致同一节课被切成几十条碎片（原先 200 条原始数据合成 176 条就是这个原因）。
    const key = [course.name, course.className, course.dayOfWeek, course.startPeriod, course.endPeriod, course.room].join("|");
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...course, weeks: [...(course.weeks || [])] });
      return;
    }
    existing.weeks = [...new Set([...(existing.weeks || []), ...(course.weeks || [])])].sort((a, b) => a - b);

    // 合并教师名单（去重，保留顺序）
    const teachers = [];
    [existing.teacher, course.teacher].forEach((t) => {
      String(t || "")
        .split(/[,，、;；]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((x) => {
          if (!teachers.includes(x)) teachers.push(x);
        });
    });
    if (teachers.length) existing.teacher = teachers.join(",");

    // 教室缺失时用有值的那条补全
    if (!existing.room && course.room) existing.room = course.room;
  });
  return [...map.values()];
}

function normalizeCourse(input) {
  const c = { ...input };
  const day = Number(c.dayOfWeek);
  const start = Number(c.startPeriod);
  const end = Number(c.endPeriod);
  // 必须显式校验 NaN：Number(undefined) 得到 NaN，而任何和 NaN 的比较都是 false，
  // 字段名写错（比如用 day 而不是 dayOfWeek）的数据会静默通过校验、混进课表。
  const valid = (n) => Number.isFinite(n);
  if (
    !c.name ||
    !valid(day) || day < 1 || day > 7 ||
    !valid(start) || start < 1 || start > 10 ||
    !valid(end) || end < start || end > 10
  ) {
    return null;
  }
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
    return ["今日已标记停课，自动跳过提醒"]; 
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

  if (!todayCourses.length) return ["今日无课，无需提醒"]; 

  const morning = todayCourses.filter((c) => c.startPeriod <= 4);
  const afternoon = todayCourses.filter((c) => c.startPeriod >= 5 && c.startPeriod <= 8);

  const logs = [];
  if (morning.length) logs.push(formatSummary("上午课程提醒", morning));
  if (afternoon.length) logs.push(formatSummary("下午课程提醒", afternoon));

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
        `下节课提醒\n${periodToStartTime(next.startPeriod)} 第${next.startPeriod}节｜${next.name}｜${next.room}\n（下课前${beforeMin}分钟触发，间隔${Math.round(diff)}分钟）`
      );
    }
  }

  return logs;
}

function formatSummary(title, courses) {
  const lines = courses.map((c) => {
    const classPart = c.className ? `｜${c.className}` : "";
    return `第${c.startPeriod}-${c.endPeriod}节 ${c.name}${classPart}｜${c.room || "未填教室"}`;
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
  const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
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
