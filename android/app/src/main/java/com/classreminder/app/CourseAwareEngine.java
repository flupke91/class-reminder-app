package com.classreminder.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 课程感知保活引擎 - 核心调度器
 * 根据课表数据自动决定后台活跃等级
 */
public class CourseAwareEngine {
    private static final String TAG = "CourseAwareEngine";
    private static final String PREFS_NAME = "course_aware_engine";
    private static final String KEY_COURSES = "courses_json";
    private static final String KEY_HOLIDAY_DATES = "holiday_dates";
    private static final String KEY_TERM_START_DATE = "term_start_date";

    // 模式定义
    public static final int MODE_HIBERNATE = 0;    // 休眠模式
    public static final int MODE_WARM_UP = 1;      // 预热模式
    public static final int MODE_ACTIVE = 2;        // 活跃模式
    public static final int MODE_SUPER_ACTIVE = 3;  // 强活跃模式

    // 时间阈值（毫秒）
    private static final long THRESHOLD_SUPER_ACTIVE = TimeUnit.MINUTES.toMillis(30);
    private static final long THRESHOLD_WARM_UP = TimeUnit.HOURS.toMillis(12);
    private static final long THRESHOLD_HIBERNATE = TimeUnit.HOURS.toMillis(48);

    private final Context context;
    private final SharedPreferences prefs;
    private List<Course> courses;
    private List<String> holidayDates;
    private String termStartDate;

    public CourseAwareEngine(Context context) {
        this.context = context;
        this.prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        this.courses = new ArrayList<>();
        this.holidayDates = new ArrayList<>();
        loadCourses();
    }

    /**
     * 课程数据类
     */
    public static class Course {
        public String name;
        public String teacher;
        public String room;
        public int dayOfWeek; // 1=周一, 7=周日
        public int startPeriod;
        public int endPeriod;
        public List<Integer> weeks;
        public boolean remindEnabled;

        public Course(JSONObject json) throws JSONException {
            this.name = json.optString("name", "");
            this.teacher = json.optString("teacher", "");
            this.room = json.optString("room", "");
            this.dayOfWeek = json.optInt("dayOfWeek", 1);
            this.startPeriod = json.optInt("startPeriod", 1);
            this.endPeriod = json.optInt("endPeriod", 1);
            this.remindEnabled = json.optBoolean("remindEnabled", true);

            this.weeks = new ArrayList<>();
            JSONArray weeksArray = json.optJSONArray("weeks");
            if (weeksArray != null) {
                for (int i = 0; i < weeksArray.length(); i++) {
                    this.weeks.add(weeksArray.getInt(i));
                }
            }
        }
    }

    /**
     * 从SharedPreferences加载课程数据
     */
    private void loadCourses() {
        try {
            String coursesJson = prefs.getString(KEY_COURSES, "[]");
            JSONArray array = new JSONArray(coursesJson);
            courses.clear();
            for (int i = 0; i < array.length(); i++) {
                courses.add(new Course(array.getJSONObject(i)));
            }

            String holidaysStr = prefs.getString(KEY_HOLIDAY_DATES, "");
            holidayDates.clear();
            if (!holidaysStr.isEmpty()) {
                String[] parts = holidaysStr.split(",");
                for (String part : parts) {
                    if (!part.trim().isEmpty()) {
                        holidayDates.add(part.trim());
                    }
                }
            }

            termStartDate = prefs.getString(KEY_TERM_START_DATE, "");
            Log.d(TAG, "Loaded " + courses.size() + " courses");
        } catch (Exception e) {
            Log.e(TAG, "Error loading courses", e);
        }
    }

    /**
     * 更新课程数据
     */
    public void updateCourses(String coursesJson) {
        try {
            prefs.edit().putString(KEY_COURSES, coursesJson).apply();
            loadCourses();
        } catch (Exception e) {
            Log.e(TAG, "Error updating courses", e);
        }
    }

    /**
     * 更新假期日期
     */
    public void updateHolidayDates(String holidayDatesStr) {
        prefs.edit().putString(KEY_HOLIDAY_DATES, holidayDatesStr).apply();
        holidayDates.clear();
        if (holidayDatesStr != null && !holidayDatesStr.isEmpty()) {
            String[] parts = holidayDatesStr.split(",");
            for (String part : parts) {
                if (!part.trim().isEmpty()) {
                    holidayDates.add(part.trim());
                }
            }
        }
    }

    /**
     * 更新学期开始日期
     */
    public void updateTermStartDate(String startDate) {
        prefs.edit().putString(KEY_TERM_START_DATE, startDate).apply();
        this.termStartDate = startDate;
    }

    /**
     * 获取当前应该处于的模式
     */
    public int getCurrentMode() {
        Calendar now = Calendar.getInstance();
        String todayStr = formatDate(now);

        // 检查是否是假期
        if (holidayDates.contains(todayStr)) {
            Log.d(TAG, "Today is holiday, mode: HIBERNATE");
            return MODE_HIBERNATE;
        }

        // 检查今天是否有课
        boolean hasClassToday = hasClassOnDate(now);
        if (!hasClassToday) {
            // 今天无课，检查距离下节课的时间
            long timeToNextClass = getTimeToNextClass(now);
            if (timeToNextClass > THRESHOLD_HIBERNATE) {
                Log.d(TAG, "No class today, next class > 48h, mode: HIBERNATE");
                return MODE_HIBERNATE;
            } else if (timeToNextClass > THRESHOLD_WARM_UP) {
                Log.d(TAG, "No class today, next class > 12h, mode: HIBERNATE");
                return MODE_HIBERNATE;
            } else {
                Log.d(TAG, "No class today, next class <= 12h, mode: WARM_UP");
                return MODE_WARM_UP;
            }
        }

        // 今天有课，检查距离下一节课的时间
        long timeToNextClass = getTimeToNextClass(now);
        if (timeToNextClass <= THRESHOLD_SUPER_ACTIVE) {
            Log.d(TAG, "Has class today, next class <= 30min, mode: SUPER_ACTIVE");
            return MODE_SUPER_ACTIVE;
        } else {
            Log.d(TAG, "Has class today, next class > 30min, mode: ACTIVE");
            return MODE_ACTIVE;
        }
    }

    /**
     * 获取下一节课信息
     */
    public Course getNextClass() {
        Calendar now = Calendar.getInstance();
        int currentWeek = getCurrentWeek(now);
        int currentDayOfWeek = now.get(Calendar.DAY_OF_WEEK);
        // 转换为 1=周一 格式
        currentDayOfWeek = currentDayOfWeek == Calendar.SUNDAY ? 7 : currentDayOfWeek - 1;
        int currentHour = now.get(Calendar.HOUR_OF_DAY);
        int currentMinute = now.get(Calendar.MINUTE);
        int currentTimeMinutes = currentHour * 60 + currentMinute;

        Course nextClass = null;
        long minTimeDiff = Long.MAX_VALUE;

        for (Course course : courses) {
            if (!course.remindEnabled) continue;
            if (course.dayOfWeek != currentDayOfWeek) continue;
            if (!course.weeks.contains(currentWeek)) continue;

            // 计算课程开始时间（分钟）
            int classStartTime = getPeriodStartTime(course.startPeriod);
            long timeDiff = classStartTime - currentTimeMinutes;

            if (timeDiff > 0 && timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                nextClass = course;
            }
        }

        return nextClass;
    }

    /**
     * 获取当前周次
     */
    private int getCurrentWeek(Calendar date) {
        if (termStartDate == null || termStartDate.isEmpty()) {
            return 1;
        }

        try {
            String[] parts = termStartDate.split("-");
            Calendar termStart = Calendar.getInstance();
            termStart.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, Integer.parseInt(parts[2]), 0, 0, 0);
            termStart.set(Calendar.MILLISECOND, 0);

            long diffMillis = date.getTimeInMillis() - termStart.getTimeInMillis();
            long diffDays = TimeUnit.MILLISECONDS.toDays(diffMillis);
            return (int) (diffDays / 7) + 1;
        } catch (Exception e) {
            Log.e(TAG, "Error calculating week", e);
            return 1;
        }
    }

    /**
     * 检查指定日期是否有课
     */
    private boolean hasClassOnDate(Calendar date) {
        int week = getCurrentWeek(date);
        int dayOfWeek = date.get(Calendar.DAY_OF_WEEK);
        // 转换为 1=周一 格式
        dayOfWeek = dayOfWeek == Calendar.SUNDAY ? 7 : dayOfWeek - 1;

        for (Course course : courses) {
            if (!course.remindEnabled) continue;
            if (course.dayOfWeek == dayOfWeek && course.weeks.contains(week)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 获取距离下一节课的时间（毫秒）
     */
    private long getTimeToNextClass(Calendar now) {
        Course nextClass = getNextClass();
        if (nextClass == null) {
            // 没有找到下一节课，返回最大值
            return Long.MAX_VALUE;
        }

        int currentDayOfWeek = now.get(Calendar.DAY_OF_WEEK);
        currentDayOfWeek = currentDayOfWeek == Calendar.SUNDAY ? 7 : currentDayOfWeek - 1;
        int currentHour = now.get(Calendar.HOUR_OF_DAY);
        int currentMinute = now.get(Calendar.MINUTE);
        int currentTimeMinutes = currentHour * 60 + currentMinute;

        int classStartTime = getPeriodStartTime(nextClass.startPeriod);
        int dayDiff = nextClass.dayOfWeek - currentDayOfWeek;
        if (dayDiff < 0) dayDiff += 7;

        long timeDiffMinutes = dayDiff * 24 * 60 + (classStartTime - currentTimeMinutes);
        return TimeUnit.MINUTES.toMillis(timeDiffMinutes);
    }

    /**
     * 获取节次对应的开始时间（分钟）
     */
    private int getPeriodStartTime(int period) {
        switch (period) {
            case 1: return 8 * 60 + 30;   // 08:30
            case 2: return 9 * 60 + 20;   // 09:20
            case 3: return 10 * 60 + 20;  // 10:20
            case 4: return 11 * 60 + 10;  // 11:10
            case 5: return 14 * 60;       // 14:00
            case 6: return 14 * 60 + 50;  // 14:50
            case 7: return 15 * 60 + 50;  // 15:50
            case 8: return 16 * 60 + 40;  // 16:40
            case 9: return 19 * 60;       // 19:00
            case 10: return 19 * 60 + 50; // 19:50
            default: return 8 * 60 + 30;
        }
    }

    /**
     * 格式化日期为字符串
     */
    private String formatDate(Calendar date) {
        return String.format("%04d-%02d-%02d",
            date.get(Calendar.YEAR),
            date.get(Calendar.MONTH) + 1,
            date.get(Calendar.DAY_OF_MONTH));
    }

    /**
     * 获取所有课程
     */
    public List<Course> getCourses() {
        return courses;
    }

    /**
     * 检查是否是假期
     */
    public boolean isHoliday(Calendar date) {
        return holidayDates.contains(formatDate(date));
    }
}