// Kivo · programa de escritorio
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain, session, Notification, protocol } = require('electron');
const fs = require('fs');

// Archivos grandes de la app (modelo de voz) servidos por un protocolo propio
protocol.registerSchemesAsPrivileged([{ scheme: 'kivo-res', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
// Solo para pruebas automáticas: micrófono simulado con un audio
if (process.env.KIVO_FAKE_AUDIO) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', process.env.KIVO_FAKE_AUDIO);
}
const path = require('path');

let win = null;
let tray = null;
let quitting = false;
let hideTipShown = false;
const startHidden = process.argv.includes('--hidden');

const ICON = path.join(__dirname, 'build', 'icon.png');
const TRAY_ICON = path.join(__dirname, 'build', process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWin());
  if (process.platform === 'win32') app.setAppUserModelId('com.arquizo.kivo');
  app.whenReady().then(() => {
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
      cb(['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write'].includes(permission));
    });
    // kivo-res://m/<ruta> → archivos de app/vendor (modelo de voz y su motor)
    const VENDOR = path.join(__dirname, 'app', 'vendor');
    const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.txt': 'text/plain' };
    protocol.handle('kivo-res', async (req) => {
      const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
      let file = path.normalize(path.join(VENDOR, rel));
      if (rel.startsWith('models/')) { const alt = path.normalize(path.join(VOICE_DIR(), rel.slice(7))); if (alt.startsWith(VOICE_DIR()) && fs.existsSync(alt)) file = alt; }
      else if (!file.startsWith(VENDOR)) return new Response('', { status: 403 });
      try {
        const data = await fs.promises.readFile(file);
        return new Response(data, { headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' } });
      } catch (e) { return new Response('', { status: 404 }); }
    });
    createWin();
    createTray();
    setupUpdates();
  });
}

function createWin() {
  win = new BrowserWindow({
    width: 1120,
    height: 840,
    minWidth: 380,
    minHeight: 560,
    title: 'Kivo',
    icon: ICON,
    backgroundColor: '#f6f5f2',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false // los recordatorios siguen funcionando con la ventana oculta
    }
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => { if (!startHidden) win.show(); });

  // Cerrar la ventana = seguir en segundo plano (para que lleguen los avisos)
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!hideTipShown && process.platform !== 'darwin' && Notification.isSupported()) {
      hideTipShown = true;
      new Notification({
        title: 'Kivo sigue activo',
        body: 'Te seguirá avisando de tus pendientes. Para cerrarlo del todo: clic derecho en el ícono de Kivo junto al reloj → Salir.',
        icon: ICON
      }).show();
    }
  });
  win.on('focus', () => {
    win.flashFrame(false); if (app.setBadgeCount) app.setBadgeCount(0);
    if (updater && Date.now() - lastCheck > 30 * 60 * 1000) checkUpdates(false);
  });

  // Enlaces externos (WhatsApp, archivos, correos) se abren en el navegador
  win.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); openExternal(url); }
  });
}

function openExternal(url) {
  if (/^(https?:|mailto:|tel:|whatsapp:)/i.test(url)) shell.openExternal(url);
}

function showWin() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  const img = nativeImage.createFromPath(TRAY_ICON);
  tray = new Tray(img.isEmpty() ? nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }) : img);
  tray.setToolTip('Kivo');
  const build = () => Menu.buildFromTemplate([
    { label: 'Kivo ' + app.getVersion() + (upd.state === 'ready' ? ' · actualización lista' : ''), enabled: false },
    ...(upd.state === 'ready' ? [{ label: '🔄 Reiniciar y actualizar', click: () => { quitting = true; updater.quitAndInstall(false, true); } }] : []),
    { label: 'Abrir Kivo', click: showWin },
    { type: 'separator' },
    {
      label: 'Iniciar Kivo al prender la computadora',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked, openAsHidden: true, args: ['--hidden'] })
    },
    { label: 'Buscar actualizaciones', click: () => checkUpdates(true) },
    { type: 'separator' },
    { label: 'Salir de Kivo', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(build());
  tray.on('click', showWin);
  tray.on('right-click', () => tray.setContextMenu(build()));
}

// ---- comunicación con la app ----
ipcMain.on('kivo:show', showWin);
ipcMain.on('kivo:attention', (e, n) => {
  if (!win || win.isFocused()) return;
  if (process.platform !== 'darwin') win.flashFrame(true);
  if (app.setBadgeCount) app.setBadgeCount(Number(n) || 1);
  if (process.platform === 'darwin' && app.dock) app.dock.bounce('informational');
});
ipcMain.handle('kivo:version', () => app.getVersion());
// Voz para dictar (Whisper): se descarga una sola vez a la carpeta de datos de Kivo
const VOICE_DIR = () => path.join(app.getPath('userData'), 'voz');
const voiceFile = (f) => (!f.includes('/') && /\.(json|txt)$/.test(f)) || /^onnx\/(encoder_model|decoder_model_merged)_quantized\.onnx$/.test(f);
const okId = (id) => /^[\w.-]+\/[\w.-]+$/.test(String(id || ''));
let voiceDl = null;
ipcMain.handle('kivo:voice-status', (e, id) => okId(id) && fs.existsSync(path.join(VOICE_DIR(), id, '.listo')));
ipcMain.handle('kivo:voice-download', (e, id) => {
  if (!okId(id)) return false;
  if (voiceDl) return voiceDl;
  voiceDl = (async () => {
    const dest = path.join(VOICE_DIR(), id);
    const info = await (await fetch('https://huggingface.co/api/models/' + id + '?blobs=true')).json();
    const files = (info.siblings || []).filter((s) => voiceFile(s.rfilename));
    if (!files.length) throw new Error('modelo vacío');
    const total = files.reduce((a, s) => a + (s.size || 0), 0) || 1;
    let done = 0, last = 0;
    const tell = (force) => { const now = Date.now(); if ((force || now - last > 300) && win && !win.isDestroyed()) { last = now; win.webContents.send('kivo:voice-progress', { done, total }); } };
    for (const s of files) {
      const out = path.join(dest, s.rfilename);
      if (s.size && fs.existsSync(out) && fs.statSync(out).size === s.size) { done += s.size; tell(); continue; }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const r = await fetch('https://huggingface.co/' + id + '/resolve/main/' + s.rfilename);
      if (!r.ok || !r.body) throw new Error(s.rfilename + ' ' + r.status);
      const tmp = out + '.part';
      const ws = fs.createWriteStream(tmp);
      for await (const chunk of r.body) {
        if (!ws.write(Buffer.from(chunk))) await new Promise((ok) => ws.once('drain', ok));
        done += chunk.length; tell();
      }
      await new Promise((ok, ko) => { ws.on('error', ko); ws.end(ok); });
      fs.renameSync(tmp, out);
    }
    fs.writeFileSync(path.join(dest, '.listo'), new Date().toISOString());
    tell(true);
    return true;
  })().finally(() => { voiceDl = null; });
  return voiceDl;
});

// Dictado: en Windows abre el dictado del sistema (Windows + H) sobre el campo activo
const DICTATE_PS = 'QQBkAGQALQBUAHkAcABlACAALQBOAGEAbQBlAHMAcABhAGMAZQAgAEsAIAAtAE4AYQBtAGUAIABXACAALQBNAGUAbQBiAGUAcgBEAGUAZgBpAG4AaQB0AGkAbwBuACAAJwBbAEQAbABsAEkAbQBwAG8AcgB0ACgAIgB1AHMAZQByADMAMgAuAGQAbABsACIAKQBdACAAcAB1AGIAbABpAGMAIABzAHQAYQB0AGkAYwAgAGUAeAB0AGUAcgBuACAAdgBvAGkAZAAgAGsAZQB5AGIAZABfAGUAdgBlAG4AdAAoAGIAeQB0AGUAIABiACwAIABiAHkAdABlACAAcwAsACAAdQBpAG4AdAAgAGYALAAgAFUASQBuAHQAUAB0AHIAIABlACkAOwAnADsAWwBLAC4AVwBdADoAOgBrAGUAeQBiAGQAXwBlAHYAZQBuAHQAKAAwAHgANQBCACwAMAAsADAALABbAFUASQBuAHQAUAB0AHIAXQA6ADoAWgBlAHIAbwApADsAWwBLAC4AVwBdADoAOgBrAGUAeQBiAGQAXwBlAHYAZQBuAHQAKAAwAHgANAA4ACwAMAAsADAALABbAFUASQBuAHQAUAB0AHIAXQA6ADoAWgBlAHIAbwApADsAWwBLAC4AVwBdADoAOgBrAGUAeQBiAGQAXwBlAHYAZQBuAHQAKAAwAHgANAA4ACwAMAAsADIALABbAFUASQBuAHQAUAB0AHIAXQA6ADoAWgBlAHIAbwApADsAWwBLAC4AVwBdADoAOgBrAGUAeQBiAGQAXwBlAHYAZQBuAHQAKAAwAHgANQBCACwAMAAsADIALABbAFUASQBuAHQAUAB0AHIAXQA6ADoAWgBlAHIAbwApAA==';
ipcMain.handle('kivo:dictate', () => {
  if (process.platform !== 'win32') return false;
  return new Promise((res) => {
    require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', DICTATE_PS],
      { windowsHide: true, timeout: 8000 }, (err) => res(!err));
  });
});
// Modo exigente: poner Kivo delante de todo hasta que respondas
ipcMain.on('kivo:force', (e, on) => {
  if (!win || win.isDestroyed()) return;
  if (on) {
    showWin();
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
    if (process.platform === 'darwin') { app.focus({ steal: true }); if (app.dock) app.dock.bounce('critical'); }
    else win.flashFrame(true);
  } else {
    win.setAlwaysOnTop(false);
    win.flashFrame(false);
  }
});

// ---- actualizaciones automáticas (desde GitHub) ----
let updater = null;
let upd = { state: 'idle', version: null, percent: 0 };
let lastCheck = 0;
function sendUpd(patch) {
  upd = Object.assign({}, upd, patch);
  if (win && !win.isDestroyed()) win.webContents.send('kivo:update', upd);
}
function setupUpdates() {
  if (!app.isPackaged) { upd.state = 'dev'; return; }
  try {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on('checking-for-update', () => sendUpd({ state: 'checking' }));
    updater.on('update-available', (i) => sendUpd({ state: 'downloading', version: i.version, percent: 0 }));
    updater.on('update-not-available', () => sendUpd({ state: 'latest' }));
    updater.on('download-progress', (p) => sendUpd({ state: 'downloading', percent: Math.round(p.percent || 0) }));
    updater.on('update-downloaded', (info) => {
      sendUpd({ state: 'ready', version: info.version, percent: 100 });
      if (Notification.isSupported()) {
        const n = new Notification({ title: 'Kivo ' + info.version + ' está lista ✨', body: 'Abre Kivo y toca «Reiniciar y actualizar».', icon: ICON });
        n.on('click', showWin); n.show();
      }
    });
    updater.on('error', (e) => sendUpd({ state: 'error', error: String((e && e.message) || e).slice(0, 200) }));
    checkUpdates(false);
    setInterval(() => checkUpdates(false), 60 * 60 * 1000);
  } catch (e) { updater = null; upd.state = 'error'; }
}
ipcMain.handle('kivo:update-state', () => upd);
ipcMain.handle('kivo:check-update', () => { checkUpdates(false); return upd; });
ipcMain.on('kivo:install-update', () => {
  if (!updater || upd.state !== 'ready') return;
  quitting = true;
  setImmediate(() => updater.quitAndInstall(false, true));
});
function checkUpdates(manual) {
  if (upd.state === 'downloading' || upd.state === 'ready') return;
  lastCheck = Date.now();
  if (!updater) {
    if (manual && Notification.isSupported()) new Notification({ title: 'Kivo', body: 'Las actualizaciones funcionan en la versión instalada.', icon: ICON }).show();
    return;
  }
  updater.checkForUpdates().then((r) => {
    if (manual && Notification.isSupported() && (!r || !r.updateInfo || r.updateInfo.version === app.getVersion())) {
      new Notification({ title: 'Kivo', body: 'Ya tienes la última versión (' + app.getVersion() + ') ✓', icon: ICON }).show();
    }
  }).catch(() => {
    if (manual && Notification.isSupported()) new Notification({ title: 'Kivo', body: 'No se pudo buscar actualizaciones. Revisa tu internet.', icon: ICON }).show();
  });
}

app.on('activate', showWin); // Mac: clic en el ícono del Dock
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* sigue en segundo plano */ });
