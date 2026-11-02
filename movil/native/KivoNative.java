package com.arquizo.kivo;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintJob;
import android.print.PrintManager;
import android.webkit.WebView;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Puente propio de Kivo: guardar PDF (impresión de Android) y versión de la app
@CapacitorPlugin(name = "KivoNative")
public class KivoNative extends Plugin {

  @PluginMethod
  public void info(PluginCall call) {
    JSObject r = new JSObject();
    try {
      r.put("version", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName);
    } catch (Exception e) {
      r.put("version", "");
    }
    call.resolve(r);
  }

  @PluginMethod
  public void print(final PluginCall call) {
    final String name = call.getString("name", "Kivo");
    final boolean portrait = Boolean.TRUE.equals(call.getBoolean("portrait", false));
    getActivity().runOnUiThread(() -> {
      try {
        WebView wv = getBridge().getWebView();
        PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
        PrintDocumentAdapter ad = wv.createPrintDocumentAdapter(name);
        PrintAttributes at = new PrintAttributes.Builder()
          .setMediaSize(portrait ? PrintAttributes.MediaSize.ISO_A4 : PrintAttributes.MediaSize.ISO_A4.asLandscape())
          .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
          .build();
        final PrintJob job = pm.print(name, ad, at);
        final Handler hd = new Handler(Looper.getMainLooper());
        final long t0 = System.currentTimeMillis();
        hd.postDelayed(new Runnable() {
          public void run() {
            String st = null;
            if (job.isCompleted()) st = "completed";
            else if (job.isFailed()) st = "failed";
            else if (job.isCancelled()) st = "cancelled";
            else if (System.currentTimeMillis() - t0 > 15 * 60 * 1000) st = "timeout";
            if (st == null) { hd.postDelayed(this, 500); return; }
            JSObject r = new JSObject();
            r.put("status", st);
            call.resolve(r);
          }
        }, 800);
      } catch (Exception e) {
        call.reject(String.valueOf(e.getMessage()));
      }
    });
  }
}
