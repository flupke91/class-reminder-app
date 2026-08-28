package com.classreminder.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

public class AlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "AlarmReceiver";
    private static final String CHANNEL_ID = "classbell_alert";
    private static final String ACTION_MODE_CHECK = "com.classbell.app.ACTION_MODE_CHECK";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();

        // 模式检查广播 - 只触发模式切换，不显示通知
        if (ACTION_MODE_CHECK.equals(action)) {
            Log.d(TAG, "Mode check alarm fired, triggering mode check");
            try {
                ModeManager modeManager = new ModeManager(context);
                modeManager.checkAndSwitchMode();
            } catch (Exception e) {
                Log.e(TAG, "Mode check failed", e);
            }
            return;
        }

        // 普通课程提醒通知
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        int id = intent.getIntExtra("id", 1);

        // 没有标题的通知不显示（防止空通知）
        if (title == null || title.isEmpty()) {
            Log.d(TAG, "Skipping notification with empty title");
            return;
        }

        createChannel(context);

        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        Intent fullScreenIntent = new Intent(context, ReminderAlertActivity.class);
        fullScreenIntent.putExtra("title", title);
        fullScreenIntent.putExtra("body", body != null ? body : "");
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            id + 100000,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body != null ? body : "")
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setAutoCancel(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .build();

        nm.notify(id, notification);
        Log.d(TAG, "Notification posted: id=" + id + ", title=" + title);
    }

    private void createChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
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
}
