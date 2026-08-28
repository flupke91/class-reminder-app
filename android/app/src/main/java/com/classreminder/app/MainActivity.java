package com.classreminder.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public MainActivity() {
        registerPlugin(NativeNotificationPlugin.class);
    }
}
