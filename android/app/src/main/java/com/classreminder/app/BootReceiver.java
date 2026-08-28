package com.classreminder.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * 开机广播接收器 - 处理系统事件并恢复任务
 * 支持: 开机自启动、应用更新、系统升级、时间修改、时区变化
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        Log.d(TAG, "Received broadcast: " + action);

        if (action == null) return;

        switch (action) {
            case Intent.ACTION_BOOT_COMPLETED:
            case Intent.ACTION_MY_PACKAGE_REPLACED:
            case Intent.ACTION_TIME_CHANGED:
            case Intent.ACTION_TIMEZONE_CHANGED:
            case Intent.ACTION_LOCALE_CHANGED:
                Log.d(TAG, "System event detected, restoring keep-alive engine");
                restoreKeepAliveEngine(context);
                break;
        }
    }

    /**
     * 恢复保活引擎
     */
    private void restoreKeepAliveEngine(Context context) {
        try {
            // 检查是否已启用实时提醒
            SharedPreferences prefs = context.getSharedPreferences("class-reminder-state-v2", Context.MODE_PRIVATE);
            String stateJson = prefs.getString("state", null);

            if (stateJson == null) {
                Log.d(TAG, "No saved state found, skipping restore");
                return;
            }

            // 创建ModeManager并检查模式
            ModeManager modeManager = new ModeManager(context);
            modeManager.checkAndSwitchMode();

            Log.d(TAG, "Keep-alive engine restored successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error restoring keep-alive engine", e);
        }
    }
}