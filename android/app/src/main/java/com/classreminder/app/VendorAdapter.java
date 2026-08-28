package com.classreminder.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

/**
 * 厂商适配器 - 处理不同厂商的后台限制
 * 重点适配: HyperOS, OneUI, ColorOS, OriginOS, MagicOS
 */
public class VendorAdapter {
    private static final String TAG = "VendorAdapter";

    public enum Vendor {
        XIAOMI,     // HyperOS / MIUI
        SAMSUNG,    // OneUI
        OPPO,       // ColorOS
        VIVO,       // OriginOS / FuntouchOS
        HONOR,      // MagicOS
        HUAWEI,     // EMUI / HarmonyOS
        ONEPLUS,    // OxygenOS / ColorOS
        REALME,     // RealmeUI
        OTHER       // 其他厂商
    }

    private final Context context;
    private final Vendor vendor;

    public VendorAdapter(Context context) {
        this.context = context;
        this.vendor = detectVendor();
        Log.d(TAG, "Detected vendor: " + vendor);
    }

    /**
     * 检测当前设备厂商
     */
    private Vendor detectVendor() {
        String manufacturer = Build.MANUFACTURER.toLowerCase();
        String brand = Build.BRAND.toLowerCase();

        if (manufacturer.contains("xiaomi") || brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco")) {
            return Vendor.XIAOMI;
        } else if (manufacturer.contains("samsung") || brand.contains("samsung")) {
            return Vendor.SAMSUNG;
        } else if (manufacturer.contains("oppo") || brand.contains("oppo") || brand.contains("oneplus") || brand.contains("realme")) {
            if (brand.contains("oneplus")) return Vendor.ONEPLUS;
            if (brand.contains("realme")) return Vendor.REALME;
            return Vendor.OPPO;
        } else if (manufacturer.contains("vivo") || brand.contains("vivo")) {
            return Vendor.VIVO;
        } else if (manufacturer.contains("honor") || brand.contains("honor")) {
            return Vendor.HONOR;
        } else if (manufacturer.contains("huawei") || brand.contains("huawei") || brand.contains("honor")) {
            return Vendor.HUAWEI;
        }

        return Vendor.OTHER;
    }

    /**
     * 获取厂商名称
     */
    public String getVendorName() {
        switch (vendor) {
            case XIAOMI: return "小米 (HyperOS)";
            case SAMSUNG: return "三星 (OneUI)";
            case OPPO: return "OPPO (ColorOS)";
            case VIVO: return "vivo (OriginOS)";
            case HONOR: return "荣耀 (MagicOS)";
            case HUAWEI: return "华为 (HarmonyOS)";
            case ONEPLUS: return "一加 (OxygenOS)";
            case REALME: return "真我 (RealmeUI)";
            default: return "其他厂商";
        }
    }

    /**
     * 检查是否需要引导用户设置自启动
     */
    public boolean needAutoStartGuide() {
        switch (vendor) {
            case XIAOMI:
            case OPPO:
            case VIVO:
            case HONOR:
            case HUAWEI:
            case ONEPLUS:
            case REALME:
                return true;
            case SAMSUNG:
                // 三星通常不需要特别设置
                return false;
            default:
                return false;
        }
    }

    /**
     * 检查是否需要引导用户关闭电池优化
     */
    public boolean needBatteryOptimizationGuide() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                return !pm.isIgnoringBatteryOptimizations(context.getPackageName());
            }
        }
        return false;
    }

    /**
     * 获取自启动设置Intent
     */
    public Intent getAutoStartIntent() {
        Intent intent = new Intent();

        switch (vendor) {
            case XIAOMI:
                // 小米自启动管理
                intent.setComponent(new ComponentName("com.miui.securitycenter",
                    "com.miui.permcenter.autostart.AutoStartManagementActivity"));
                break;

            case OPPO:
            case ONEPLUS:
            case REALME:
                // OPPO/一加/真我 自启动管理
                intent.setComponent(new ComponentName("com.coloros.safecenter",
                    "com.coloros.safecenter.startupapp.StartupAppListActivity"));
                break;

            case VIVO:
                // vivo 自启动管理
                intent.setComponent(new ComponentName("com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"));
                break;

            case HONOR:
                // 荣耀自启动管理
                intent.setComponent(new ComponentName("com.huawei.systemmanager",
                    "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"));
                break;

            case HUAWEI:
                // 华为自启动管理
                intent.setComponent(new ComponentName("com.huawei.systemmanager",
                    "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"));
                break;

            default:
                // 通用：打开应用详情页
                intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.fromParts("package", context.getPackageName(), null));
                break;
        }

        return intent;
    }

    /**
     * 获取电池优化设置Intent
     */
    public Intent getBatteryOptimizationIntent() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + context.getPackageName()));
        }
        return new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
    }

    /**
     * 获取通知设置Intent
     */
    public Intent getNotificationSettingsIntent() {
        Intent intent = new Intent();

        switch (vendor) {
            case XIAOMI:
                // 小米通知管理
                intent.setComponent(new ComponentName("com.miui.notification",
                    "com.miui.notification.NotificationSettingsActivity"));
                break;

            case OPPO:
            case ONEPLUS:
            case REALME:
                // OPPO通知管理
                intent.setAction("android.settings.APP_NOTIFICATION_SETTINGS");
                intent.putExtra("android.provider.extra.APP_PACKAGE", context.getPackageName());
                break;

            case VIVO:
                // vivo通知管理
                intent.setComponent(new ComponentName("com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.SoftPermissionDetailActivity"));
                break;

            default:
                // 通用通知设置
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    intent.setAction(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
                } else {
                    intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    intent.setData(Uri.fromParts("package", context.getPackageName(), null));
                }
                break;
        }

        return intent;
    }

    /**
     * 获取厂商特定的后台保护指南文本
     */
    public String getBackgroundGuideText() {
        switch (vendor) {
            case XIAOMI:
                return "为了确保课程提醒正常工作，请在设置中：\n" +
                    "1. 开启自启动权限\n" +
                    "2. 关闭电池优化（或选择无限制）\n" +
                    "3. 开启后台弹出界面权限\n" +
                    "4. 锁定应用（最近任务中下拉锁定）";

            case SAMSUNG:
                return "为了确保课程提醒正常工作，请在设置中：\n" +
                    "1. 将应用添加到「从不休眠的应用」\n" +
                    "2. 关闭「自适应电池」中的限制\n" +
                    "3. 开启通知权限";

            case OPPO:
            case ONEPLUS:
            case REALME:
                return "为了确保课程提醒正常工作，请在设置中：\n" +
                    "1. 开启自启动权限\n" +
                    "2. 关闭电池优化\n" +
                    "3. 开启后台运行权限\n" +
                    "4. 锁定应用（最近任务中下拉锁定）";

            case VIVO:
                return "为了确保课程提醒正常工作，请在设置中：\n" +
                    "1. 开启自启动权限\n" +
                    "2. 关闭电池优化\n" +
                    "3. 开启后台弹出权限\n" +
                    "4. 锁定应用（最近任务中下拉锁定）";

            case HONOR:
            case HUAWEI:
                return "为了确保课程提醒正常工作，请在设置中：\n" +
                    "1. 开启自启动权限\n" +
                    "2. 关闭电池优化\n" +
                    "3. 开启后台运行权限\n" +
                    "4. 锁定应用（最近任务中下拉锁定）";

            default:
                return "为了确保课程提醒正常工作，请在系统设置中：\n" +
                    "1. 允许应用后台运行\n" +
                    "2. 关闭电池优化\n" +
                    "3. 开启通知权限";
        }
    }

    /**
     * 检查应用是否在后台受限
     */
    public boolean isBackgroundRestricted() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return ((android.app.ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE))
                .isBackgroundRestricted();
        }
        return false;
    }

    /**
     * 获取当前厂商
     */
    public Vendor getVendor() {
        return vendor;
    }
}