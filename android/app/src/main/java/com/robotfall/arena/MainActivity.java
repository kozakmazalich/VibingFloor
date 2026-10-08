package com.robotfall.arena;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MwaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
