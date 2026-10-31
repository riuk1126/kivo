// Kivo · programa de escritorio
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, ipcMain, session, Notification } = require('electron');
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
  win.on('focus', () => { win.flashFrame(false); if (app.setBadgeCount) app.setBadgeCount(0); });

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

// ---- actualizaciones automáticas (desde GitHub) ----
let updater = null;
function setupUpdates() {
  if (!app.isPackaged) return;
  try {
    updater = require('electron-updater').autoUpdater;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.on('update-downloaded', (info) => {
      if (Notification.isSupported()) {
        new Notification({ title: 'Kivo se actualizó ✨', body: 'La versión ' + info.version + ' se instalará la próxima vez que abras Kivo.', icon: ICON }).show();
      }
    });
    checkUpdates(false);
    setInterval(() => checkUpdates(false), 6 * 60 * 60 * 1000);
  } catch (e) { updater = null; }
}
function checkUpdates(manual) {
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
