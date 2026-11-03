package com.arquizo.kivo;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
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

// Puente propio de Kivo: guardar PDF (impresión de Android), versión de la app y actualizarse desde la misma app
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

  // Descarga el APK nuevo dentro de la app y abre el instalador de Android (un toque: «Actualizar»)
  @PluginMethod
  public void installUpdate(final PluginCall call) {
    final String url = call.getString("url", "https://github.com/riuk1126/kivo/releases/latest/download/Kivo.apk");
    final Context ctx = getContext();
    if (Build.VERSION.SDK_INT >= 26 && !ctx.getPackageManager().canRequestPackageInstalls()) {
      try {
        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + ctx.getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
      } catch (Exception e) { }
      JSObject r = new JSObject();
      r.put("status", "permission");
      call.resolve(r);
      return;
    }
    new Thread(() -> {
      try {
        File dir = new File(ctx.getCacheDir(), "update");
        dir.mkdirs();
        File f = new File(dir, "Kivo.apk");
        String u = url;
        HttpURLConnection c = null;
        for (int k = 0; k < 6; k++) {
          c = (HttpURLConnection) new URL(u).openConnection();
          c.setInstanceFollowRedirects(false);
          c.setConnectTimeout(20000);
          c.setReadTimeout(60000);
          int code = c.getResponseCode();
          if (code >= 300 && code < 400) { u = new URL(new URL(u), c.getHeaderField("Location")).toString(); c.disconnect(); continue; }
          if (code != 200) throw new Exception("HTTP " + code);
          break;
        }
        long total = c.getContentLength();
        InputStream in = c.getInputStream();
        FileOutputStream out = new FileOutputStream(f);
        byte[] buf = new byte[65536];
        long got = 0; int n; int last = -1;
        while ((n = in.read(buf)) > 0) {
          out.write(buf, 0, n);
          got += n;
          if (total > 0) {
            int pc = (int) (got * 100 / total);
            if (pc != last) { last = pc; JSObject p = new JSObject(); p.put("p", pc); notifyListeners("updProgress", p); }
          }
        }
        out.close(); in.close(); c.disconnect();
        Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
        Intent i = new Intent(Intent.ACTION_VIEW);
        i.setDataAndType(uri, "application/vnd.android.package-archive");
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
        JSObject r = new JSObject();
        r.put("status", "installing");
        call.resolve(r);
      } catch (Exception e) {
        call.reject(String.valueOf(e.getMessage()));
      }
    }).start();
  }
}
