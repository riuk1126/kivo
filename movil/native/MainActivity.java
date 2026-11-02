package com.arquizo.kivo;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(KivoNative.class);
    super.onCreate(savedInstanceState);
  }
}
