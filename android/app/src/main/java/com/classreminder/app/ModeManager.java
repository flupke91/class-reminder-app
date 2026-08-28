package com.classreminder.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

import java.util.Calendar;
import java.util.concurrent.TimeUnit;

/**
 * 模式管理器 - 管理4种后台模式的切换
 * 休眠模式 -> 预热模式 -> 活跃模式 -> 强活跃模式
 */
public class ModeManager {
    private static final String TAG = "ModeManager";
    private static final String PREFS_NAME = "mode_manager_prefs";
    private static final String KEY_CURRENT_MODE = "current_mode";
    private static final String KEY_LAST_MODE_CHECK = "last_mode_check";

    // 模式检查间隔（毫秒）
    private static final long CHECK_INTERVAL_HIBERNATE = TimeUnit.HOURS.toMillis(1);  // 休眠模式：1小时检查一次
    private static final long CHECK_INTERVAL_WARM_UP = TimeUnit.MINUTES.toMillis(30);  // 预热模式：30分钟检查一次
    private static final long CHECK_INTERVAL_ACTIVE = TimeUnit.MINUTES.toMillis(10);   // 活跃模式：10分钟检查一次
    private static final long CHECK_INTERVAL_SUPER_ACTIVE = TimeUnit.MINUTES.toMillis(1); // 强活跃模式：1分钟检查一次

    // AlarmManager请求码
    private static final int REQUEST_CODE_MODE_CHECK = 10001;
    private static final int REQUEST_CODE_CLASS_REMINDER = 10002;
    private static final int REQUEST_CODE_FOREGROUND_SERVICE = 10003;

    private final Context context;
    private final CourseAwareEngine engine;
    private final SharedPreferences prefs;
    private int currentMode;
    private ModeChangeListener listener;

    public interface ModeChangeListener {
        void onModeChanged(int oldMode, int newMode);
    }

    public ModeManager(Context context) {
        this.context = context;
        this.engine = new CourseAwareEngine(context);
        this.prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        this.currentMode = prefs.getInt(KEY_CURRENT_MODE, CourseAwareEngine.MODE_HIBERNATE);
    }

    public void setModeChangeListener(ModeChangeListener listener) {
        this.listener = listener;
    }

    /**
     * 获取当前模式
     */
    public int getCurrentMode() {
        return currentMode;
    }

    /**
     * 获取当前模式名称
     */
    public String getCurrentModeName() {
        switch (currentMode) {
            case CourseAwareEngine.MODE_HIBERNATE:
                return "休眠模式";
            case CourseAwareEngine.MODE_WARM_UP:
                return "预热模式";
            case CourseAwareEngine.MODE_ACTIVE:
                return "活跃模式";
            case CourseAwareEngine.MODE_SUPER_ACTIVE:
                return "强活跃模式";
            default:
                return "未知模式";
        }
    }

    /**
     * 更新课程数据
     */
    public void updateCourses(String coursesJson) {
        engine.updateCourses(coursesJson);
        checkAndSwitchMode();
    }

    /**
     * 更新假期日期
     */
    public void updateHolidayDates(String holidayDates) {
        engine.updateHolidayDates(holidayDates);
        checkAndSwitchMode();
    }

    /**
     * 更新学期开始日期
     */
    public void updateTermStartDate(String startDate) {
        engine.updateTermStartDate(startDate);
        checkAndSwitchMode();
    }

    /**
     * 检查并切换模式
     */
    public void checkAndSwitchMode() {
        int newMode = engine.getCurrentMode();
        long now = System.currentTimeMillis();
        prefs.edit().putLong(KEY_LAST_MODE_CHECK, now).apply();

        if (newMode != currentMode) {
            int oldMode = currentMode;
            Log.d(TAG, "Mode changed: " + getModeName(oldMode) + " -> " + getModeName(newMode));

            // 执行模式切换动作
            onModeTransition(oldMode, newMode);

            // 保存新模式
            currentMode = newMode;
            prefs.edit().putInt(KEY_CURRENT_MODE, currentMode).apply();

            // 通知监听器
            if (listener != null) {
                listener.onModeChanged(oldMode, newMode);
            }
        }

        // 根据当前模式设置下次检查时间
        scheduleNextCheck();
    }

    /**
     * 模式切换时的处理
     */
    private void onModeTransition(int oldMode, int newMode) {
        // 退出旧模式
        switch (oldMode) {
            case CourseAwareEngine.MODE_HIBERNATE:
                exitHibernateMode();
                break;
            case CourseAwareEngine.MODE_WARM_UP:
                exitWarmUpMode();
                break;
            case CourseAwareEngine.MODE_ACTIVE:
                exitActiveMode();
                break;
            case CourseAwareEngine.MODE_SUPER_ACTIVE:
                exitSuperActiveMode();
                break;
        }

        // 进入新模式
        switch (newMode) {
            case CourseAwareEngine.MODE_HIBERNATE:
                enterHibernateMode();
                break;
            case CourseAwareEngine.MODE_WARM_UP:
                enterWarmUpMode();
                break;
            case CourseAwareEngine.MODE_ACTIVE:
                enterActiveMode();
                break;
            case CourseAwareEngine.MODE_SUPER_ACTIVE:
                enterSuperActiveMode();
                break;
        }
    }

    /**
     * 进入休眠模式
     */
    private void enterHibernateMode() {
        Log.d(TAG, "Entering Hibernate Mode");
        // 停止前台服务
        KeepAliveService.stop(context);
        // 取消所有提醒
        cancelAllReminders();
    }

    /**
     * 退出休眠模式
     */
    private void exitHibernateMode() {
        Log.d(TAG, "Exiting Hibernate Mode");
    }

    /**
     * 进入预热模式
     */
    private void enterWarmUpMode() {
        Log.d(TAG, "Entering Warm-up Mode");
        // 重建未来24小时提醒
        rebuildReminders();
        // 检查通知权限
        checkNotificationPermission();
    }

    /**
     * 退出预热模式
     */
    private void exitWarmUpMode() {
        Log.d(TAG, "Exiting Warm-up Mode");
    }

    /**
     * 进入活跃模式
     */
    private void enterActiveMode() {
        Log.d(TAG, "Entering Active Mode");
        // 启用课程提醒引擎
        rebuildReminders();
    }

    /**
     * 退出活跃模式
     */
    private void exitActiveMode() {
        Log.d(TAG, "Exiting Active Mode");
    }

    /**
     * 进入强活跃模式
     */
    private void enterSuperActiveMode() {
        Log.d(TAG, "Entering Super-active Mode");
        // 启动前台服务
        CourseAwareEngine.Course nextClass = engine.getNextClass();
        if (nextClass != null) {
            String title = nextClass.name;
            String time = formatPeriodTime(nextClass.startPeriod);
            String room = nextClass.room;
            KeepAliveService.start(context, title, time, room);
        }
    }

    /**
     * 退出强活跃模式
     */
    private void exitSuperActiveMode() {
        Log.d(TAG, "Exiting Super-active Mode");
        // 停止前台服务
        KeepAliveService.stop(context);
    }

    /**
     * 设置下次模式检查
     */
    private void scheduleNextCheck() {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.setAction("com.classbell.app.ACTION_MODE_CHECK");
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_MODE_CHECK,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        long interval;
        switch (currentMode) {
            case CourseAwareEngine.MODE_HIBERNATE:
                interval = CHECK_INTERVAL_HIBERNATE;
                break;
            case CourseAwareEngine.MODE_WARM_UP:
                interval = CHECK_INTERVAL_WARM_UP;
                break;
            case CourseAwareEngine.MODE_ACTIVE:
                interval = CHECK_INTERVAL_ACTIVE;
                break;
            case CourseAwareEngine.MODE_SUPER_ACTIVE:
                interval = CHECK_INTERVAL_SUPER_ACTIVE;
                break;
            default:
                interval = CHECK_INTERVAL_HIBERNATE;
        }

        long triggerAt = System.currentTimeMillis() + interval;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
        }

        Log.d(TAG, "Next mode check scheduled in " + (interval / 1000) + "s");
    }

    /**
     * 重建提醒
     */
    private void rebuildReminders() {
        // 通过JS桥接通知前端重建提醒
        // 这里只是触发，实际逻辑在前端
        Log.d(TAG, "Rebuilding reminders...");
    }

    /**
     * 取消所有提醒
     */
    private void cancelAllReminders() {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        // 取消模式检查
        Intent intent = new Intent(context, AlarmReceiver.class);
        intent.setAction("ACTION_MODE_CHECK");
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_MODE_CHECK,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        am.cancel(pendingIntent);
    }

    /**
     * 检查通知权限
     */
    private void checkNotificationPermission() {
        // 这里可以触发权限检查UI
        Log.d(TAG, "Checking notification permission...");
    }

    /**
     * 获取模式名称
     */
    private String getModeName(int mode) {
        switch (mode) {
            case CourseAwareEngine.MODE_HIBERNATE:
                return "HIBERNATE";
            case CourseAwareEngine.MODE_WARM_UP:
                return "WARM_UP";
            case CourseAwareEngine.MODE_ACTIVE:
                return "ACTIVE";
            case CourseAwareEngine.MODE_SUPER_ACTIVE:
                return "SUPER_ACTIVE";
            default:
                return "UNKNOWN";
        }
    }

    /**
     * 格式化节次时间
     */
    private String formatPeriodTime(int period) {
        switch (period) {
            case 1: return "08:30";
            case 2: return "09:20";
            case 3: return "10:20";
            case 4: return "11:10";
            case 5: return "14:00";
            case 6: return "14:50";
            case 7: return "15:50";
            case 8: return "16:40";
            case 9: return "19:00";
            case 10: return "19:50";
            default: return "08:30";
        }
    }

    /**
     * 获取CourseAwareEngine实例
     */
    public CourseAwareEngine getEngine() {
        return engine;
    }
}