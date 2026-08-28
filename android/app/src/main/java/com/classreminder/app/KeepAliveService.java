package com.classreminder.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.util.Calendar;
import java.util.concurrent.TimeUnit;

/**
 * 前台服务 - 保持应用在后台运行
 * 仅在强活跃模式下启动，显示实时课程状态通知
 */
public class KeepAliveService extends Service {
    private static final String TAG = "KeepAliveService";
    private static final String CHANNEL_ID = "classbell_foreground";
    private static final int NOTIFICATION_ID = 10001;

    private static final String EXTRA_COURSE_NAME = "course_name";
    private static final String EXTRA_COURSE_TIME = "course_time";
    private static final String EXTRA_COURSE_ROOM = "course_room";

    private Handler handler;
    private Runnable updateRunnable;
    private String courseName;
    private String courseTime;
    private String courseRoom;

    public static void start(Context context, String courseName, String courseTime, String courseRoom) {
        Intent intent = new Intent(context, KeepAliveService.class);
        intent.putExtra(EXTRA_COURSE_NAME, courseName);
        intent.putExtra(EXTRA_COURSE_TIME, courseTime);
        intent.putExtra(EXTRA_COURSE_ROOM, courseRoom);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    public static void stop(Context context) {
        Intent intent = new Intent(context, KeepAliveService.class);
        context.stopService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        handler = new Handler(Looper.getMainLooper());
        createNotificationChannel();
        Log.d(TAG, "Service created");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            courseName = intent.getStringExtra(EXTRA_COURSE_NAME);
            courseTime = intent.getStringExtra(EXTRA_COURSE_TIME);
            courseRoom = intent.getStringExtra(EXTRA_COURSE_ROOM);
        }

        // 启动前台服务
        Notification notification = buildNotification();
        startForeground(NOTIFICATION_ID, notification);

        // 启动定时更新
        startPeriodicUpdate();

        Log.d(TAG, "Service started: " + courseName + " at " + courseTime);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopPeriodicUpdate();
        Log.d(TAG, "Service destroyed");
    }

    /**
     * 创建通知渠道
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "课程提醒服务",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("保持课程提醒服务运行");
            channel.setShowBadge(false);

            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    /**
     * 构建通知
     */
    private Notification buildNotification() {
        // 点击通知打开应用
        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // 计算剩余时间
        String remainingText = calculateRemainingTime();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("下一节课: " + (courseName != null ? courseName : ""))
            .setContentText((courseTime != null ? courseTime : "") + " | " + (courseRoom != null ? courseRoom : ""))
            .setSubText(remainingText)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        return builder.build();
    }

    /**
     * 计算剩余时间
     */
    private String calculateRemainingTime() {
        if (courseTime == null || courseTime.isEmpty()) {
            return "";
        }

        try {
            String[] parts = courseTime.split(":");
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
                return "距离上课 " + diffMinutes + " 分钟";
            } else {
                long hours = diffMinutes / 60;
                long mins = diffMinutes % 60;
                return "距离上课 " + hours + " 小时 " + mins + " 分钟";
            }
        } catch (Exception e) {
            Log.e(TAG, "Error calculating remaining time", e);
            return "";
        }
    }

    /**
     * 启动定时更新
     */
    private void startPeriodicUpdate() {
        updateRunnable = new Runnable() {
            @Override
            public void run() {
                // 更新通知
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null) {
                    nm.notify(NOTIFICATION_ID, buildNotification());
                }

                // 检查是否需要停止服务（课程已开始）
                if (isClassStarted()) {
                    Log.d(TAG, "Class started, stopping service");
                    stopSelf();
                    return;
                }

                // 每分钟更新一次
                handler.postDelayed(this, 60000);
            }
        };
        handler.post(updateRunnable);
    }

    /**
     * 停止定时更新
     */
    private void stopPeriodicUpdate() {
        if (updateRunnable != null) {
            handler.removeCallbacks(updateRunnable);
        }
    }

    /**
     * 检查课程是否已开始
     */
    private boolean isClassStarted() {
        if (courseTime == null || courseTime.isEmpty()) {
            return false;
        }

        try {
            String[] parts = courseTime.split(":");
            int hour = Integer.parseInt(parts[0]);
            int minute = Integer.parseInt(parts[1]);

            Calendar now = Calendar.getInstance();
            Calendar classTime = Calendar.getInstance();
            classTime.set(Calendar.HOUR_OF_DAY, hour);
            classTime.set(Calendar.MINUTE, minute);

            return now.after(classTime);
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * 更新课程信息
     */
    public void updateCourseInfo(String name, String time, String room) {
        this.courseName = name;
        this.courseTime = time;
        this.courseRoom = room;

        // 更新通知
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, buildNotification());
        }
    }
}