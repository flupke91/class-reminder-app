package com.classreminder.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.widget.RemoteViews;

import com.classreminder.app.R;

import java.util.Calendar;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * 桌面小组件 - 显示下一节课信息
 * 支持自动刷新，无需打开APP即可查看
 */
public class CourseWidgetProvider extends AppWidgetProvider {
    private static final String TAG = "CourseWidgetProvider";
    private static final String ACTION_REFRESH = "com.classbell.app.ACTION_WIDGET_REFRESH";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);

        String action = intent.getAction();
        if (ACTION_REFRESH.equals(action)) {
            Log.d(TAG, "Widget refresh requested");
            refreshAllWidgets(context);
        }
    }

    @Override
    public void onEnabled(Context context) {
        super.onEnabled(context);
        Log.d(TAG, "First widget instance enabled");
    }

    @Override
    public void onDisabled(Context context) {
        super.onDisabled(context);
        Log.d(TAG, "Last widget instance disabled");
    }

    /**
     * 更新单个小组件
     */
    private void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        try {
            // 获取下一节课信息
            CourseAwareEngine engine = new CourseAwareEngine(context);
            CourseAwareEngine.Course nextClass = engine.getNextClass();

            // 创建RemoteViews
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_course);

            if (nextClass != null) {
                // 有下一节课
                views.setTextViewText(R.id.widget_course_name, nextClass.name);
                views.setTextViewText(R.id.widget_course_room, nextClass.room != null ? nextClass.room : "未填写教室");
                views.setTextViewText(R.id.widget_course_time, formatPeriodTime(nextClass.startPeriod));

                // 计算剩余时间
                String remaining = calculateRemainingTime(nextClass.startPeriod);
                views.setTextViewText(R.id.widget_remaining, remaining);

                // 设置图标颜色（根据时间紧急程度）
                int color = getRemainingTimeColor(nextClass.startPeriod);
                views.setInt(R.id.widget_icon, "setColorFilter", color);
            } else {
                // 没有下一节课
                views.setTextViewText(R.id.widget_course_name, "今日无课");
                views.setTextViewText(R.id.widget_course_room, "");
                views.setTextViewText(R.id.widget_course_time, "");
                views.setTextViewText(R.id.widget_remaining, "享受休息时光");
            }

            // 点击小组件打开应用
            Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launchIntent != null) {
                PendingIntent pendingIntent = PendingIntent.getActivity(
                    context,
                    0,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                views.setOnClickPendingIntent(R.id.widget_container, pendingIntent);
            }

            // 刷新按钮
            Intent refreshIntent = new Intent(context, CourseWidgetProvider.class);
            refreshIntent.setAction(ACTION_REFRESH);
            PendingIntent refreshPendingIntent = PendingIntent.getBroadcast(
                context,
                0,
                refreshIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            views.setOnClickPendingIntent(R.id.widget_refresh, refreshPendingIntent);

            appWidgetManager.updateAppWidget(appWidgetId, views);
            Log.d(TAG, "Widget updated: " + appWidgetId);
        } catch (Exception e) {
            Log.e(TAG, "Error updating widget", e);
        }
    }

    /**
     * 刷新所有小组件
     */
    public static void refreshAllWidgets(Context context) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        if (appWidgetManager == null) return;

        ComponentName widget = new ComponentName(context, CourseWidgetProvider.class);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(widget);

        for (int appWidgetId : appWidgetIds) {
            new CourseWidgetProvider().updateWidget(context, appWidgetManager, appWidgetId);
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
     * 计算剩余时间
     */
    private String calculateRemainingTime(int period) {
        String timeStr = formatPeriodTime(period);
        String[] parts = timeStr.split(":");
        int hour = Integer.parseInt(parts[0]);
        int minute = Integer.parseInt(parts[1]);

        Calendar now = Calendar.getInstance();
        Calendar classTime = Calendar.getInstance();
        classTime.set(Calendar.HOUR_OF_DAY, hour);
        classTime.set(Calendar.MINUTE, minute);
        classTime.set(Calendar.SECOND, 0);

        long diffMillis = classTime.getTimeInMillis() - now.getTimeInMillis();

        if (diffMillis < 0) {
            return "正在上课";
        }

        long diffMinutes = TimeUnit.MILLISECONDS.toMinutes(diffMillis);
        if (diffMinutes < 60) {
            return diffMinutes + "分钟后";
        } else {
            long hours = diffMinutes / 60;
            long mins = diffMinutes % 60;
            if (mins == 0) {
                return hours + "小时后";
            }
            return hours + "小时" + mins + "分钟后";
        }
    }

    /**
     * 根据剩余时间获取颜色
     */
    private int getRemainingTimeColor(int period) {
        String timeStr = formatPeriodTime(period);
        String[] parts = timeStr.split(":");
        int hour = Integer.parseInt(parts[0]);
        int minute = Integer.parseInt(parts[1]);

        Calendar now = Calendar.getInstance();
        Calendar classTime = Calendar.getInstance();
        classTime.set(Calendar.HOUR_OF_DAY, hour);
        classTime.set(Calendar.MINUTE, minute);

        long diffMillis = classTime.getTimeInMillis() - now.getTimeInMillis();
        long diffMinutes = TimeUnit.MILLISECONDS.toMinutes(diffMillis);

        if (diffMinutes <= 30) {
            return 0xFFFF4444; // 红色 - 紧急
        } else if (diffMinutes <= 60) {
            return 0xFFFF8800; // 橙色 - 即将
        } else {
            return 0xFF4CAF50; // 绿色 - 正常
        }
    }
}