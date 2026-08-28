package com.classreminder.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import androidx.core.app.NotificationCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeNotification")
public class NativeNotificationPlugin extends Plugin {

    private static final String CHANNEL_ID = "classbell_alert";

    private ModeManager modeManager;
    private VendorAdapter vendorAdapter;

    @Override
    public void load() {
        createChannel();
        modeManager = new ModeManager(getContext());
        vendorAdapter = new VendorAdapter(getContext());
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getContext().getSystemService(NotificationManager.class);
            if (nm != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "课程提醒",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("课程提醒弹窗通知");
                channel.enableVibration(true);
                channel.setShowBadge(true);
                nm.createNotificationChannel(channel);
            }
        }
    }

    private PendingIntent buildFullScreenIntent(String title, String body, int id) {
        Intent fullScreenIntent = new Intent(getContext(), ReminderAlertActivity.class);
        fullScreenIntent.putExtra("title", title);
        fullScreenIntent.putExtra("body", body);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        return PendingIntent.getActivity(
            getContext(),
            id + 100000,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    // ==================== 原有通知方法 ====================

    @PluginMethod
    public void schedule(PluginCall call) {
        String title = call.getString("title", "通知");
        String body = call.getString("body", "");
        int id = call.getInt("id", (int) (System.currentTimeMillis() % 100000));
        int delayMs = call.getInt("delayMs", 3000);

        Context ctx = getContext();
        Intent intent = new Intent(ctx, AlarmReceiver.class);
        intent.putExtra("title", title);
        intent.putExtra("body", body);
        intent.putExtra("id", id);

        PendingIntent pending = PendingIntent.getBroadcast(
            ctx,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            long triggerAt = System.currentTimeMillis() + delayMs;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pending);
            }
        }

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("id", id);
        result.put("triggerAt", System.currentTimeMillis() + delayMs);
        call.resolve(result);
    }

    @PluginMethod
    public void notify(PluginCall call) {
        String title = call.getString("title", "通知");
        String body = call.getString("body", "");
        int id = call.getInt("id", (int) (System.currentTimeMillis() % 100000));

        NotificationManager nm = getContext().getSystemService(NotificationManager.class);
        if (nm == null) {
            call.reject("NotificationManager not available");
            return;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(buildFullScreenIntent(title, body, id), true);

        nm.notify(id, builder.build());

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("id", id);
        call.resolve(result);
    }

    // ==================== 保活引擎控制方法 ====================

    /**
     * 初始化保活引擎
     */
    @PluginMethod
    public void initKeepAliveEngine(PluginCall call) {
        String coursesJson = call.getString("coursesJson", "[]");
        String holidayDates = call.getString("holidayDates", "");
        String termStartDate = call.getString("termStartDate", "");

        modeManager.updateCourses(coursesJson);
        modeManager.updateHolidayDates(holidayDates);
        modeManager.updateTermStartDate(termStartDate);
        modeManager.checkAndSwitchMode();

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("mode", modeManager.getCurrentMode());
        result.put("modeName", modeManager.getCurrentModeName());
        call.resolve(result);
    }

    /**
     * 更新课表数据
     */
    @PluginMethod
    public void updateCourses(PluginCall call) {
        String coursesJson = call.getString("coursesJson", "[]");
        modeManager.updateCourses(coursesJson);

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("mode", modeManager.getCurrentMode());
        result.put("modeName", modeManager.getCurrentModeName());
        call.resolve(result);
    }

    /**
     * 获取当前保活模式
     */
    @PluginMethod
    public void getKeepAliveMode(PluginCall call) {
        modeManager.checkAndSwitchMode();

        JSObject result = new JSObject();
        result.put("mode", modeManager.getCurrentMode());
        result.put("modeName", modeManager.getCurrentModeName());
        call.resolve(result);
    }

    /**
     * 获取厂商信息
     */
    @PluginMethod
    public void getVendorInfo(PluginCall call) {
        JSObject result = new JSObject();
        result.put("vendor", vendorAdapter.getVendorName());
        result.put("needAutoStartGuide", vendorAdapter.needAutoStartGuide());
        result.put("needBatteryOptimizationGuide", vendorAdapter.needBatteryOptimizationGuide());
        result.put("isBackgroundRestricted", vendorAdapter.isBackgroundRestricted());
        result.put("guideText", vendorAdapter.getBackgroundGuideText());
        call.resolve(result);
    }

    /**
     * 打开自启动设置
     */
    @PluginMethod
    public void openAutoStartSettings(PluginCall call) {
        try {
            Intent intent = vendorAdapter.getAutoStartIntent();
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("无法打开自启动设置: " + e.getMessage());
        }
    }

    /**
     * 打开电池优化设置
     */
    @PluginMethod
    public void openBatteryOptimizationSettings(PluginCall call) {
        try {
            Intent intent = vendorAdapter.getBatteryOptimizationIntent();
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("无法打开电池优化设置: " + e.getMessage());
        }
    }

    /**
     * 打开通知设置
     */
    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        try {
            Intent intent = vendorAdapter.getNotificationSettingsIntent();
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("无法打开通知设置: " + e.getMessage());
        }
    }

    /**
     * 刷新桌面小组件
     */
    @PluginMethod
    public void refreshWidget(PluginCall call) {
        CourseWidgetProvider.refreshAllWidgets(getContext());
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    /**
     * 手动触发模式检查
     */
    @PluginMethod
    public void triggerModeCheck(PluginCall call) {
        modeManager.checkAndSwitchMode();

        // 同时刷新小组件
        CourseWidgetProvider.refreshAllWidgets(getContext());

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("mode", modeManager.getCurrentMode());
        result.put("modeName", modeManager.getCurrentModeName());
        call.resolve(result);
    }

    // ==================== 灵动岛通知 ====================

    /**
     * 发送灵动岛通知（小米超级岛）
     */
    @PluginMethod
    public void notifyWithIsland(PluginCall call) {
        String title = call.getString("title", "课程提醒");
        String body = call.getString("body", "");
        int id = call.getInt("id", (int) (System.currentTimeMillis() % 100000));
        String courseName = call.getString("courseName", title);
        String courseRoom = call.getString("courseRoom", "");
        String courseTime = call.getString("courseTime", "");
        String countdown = call.getString("countdown", "");

        NotificationManager nm = getContext().getSystemService(NotificationManager.class);
        if (nm == null) {
            call.reject("NotificationManager not available");
            return;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(buildFullScreenIntent(title, body, id), true);

        // 构建小米超级岛参数
        try {
            String islandParams = buildIslandParams(courseName, courseRoom, courseTime, countdown);
            Notification notification = builder.build();
            notification.extras.putString("miui.focus.param", islandParams);
            nm.notify(id, notification);
        } catch (Exception e) {
            // 降级为普通通知
            nm.notify(id, builder.build());
        }

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("id", id);
        call.resolve(result);
    }

    /**
     * 构建灵动岛参数JSON
     */
    private String buildIslandParams(String courseName, String courseRoom, String courseTime, String countdown) {
        // 大岛内容 - 展开态
        String bigIsland = String.format(
            "\"bigIsland\": {" +
            "  \"title\": \"%s\"," +
            "  \"subTitle\": \"%s\"," +
            "  \"desc\": \"%s\"" +
            "}",
            escapeJson(courseName),
            escapeJson(courseTime + " | " + courseRoom),
            escapeJson(countdown.isEmpty() ? "课程提醒" : countdown)
        );

        // 小岛内容 - 摘要态
        String smallIsland = String.format(
            "\"smallIsland\": {" +
            "  \"title\": \"%s\"," +
            "  \"subTitle\": \"%s\"" +
            "}",
            escapeJson(courseName),
            escapeJson(courseRoom)
        );

        // 完整参数
        return String.format(
            "{\"param_v2\": {%s, %s, \"islandProperty\": 1, \"islandTimeout\": 300}}",
            bigIsland,
            smallIsland
        );
    }

    private String escapeJson(String str) {
        if (str == null) return "";
        return str.replace("\\", "\\\\")
                  .replace("\"", "\\\"")
                  .replace("\n", "\\n")
                  .replace("\r", "\\r")
                  .replace("\t", "\\t");
    }
}