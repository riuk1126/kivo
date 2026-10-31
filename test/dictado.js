// Prueba automática del dictado (Whisper dentro del programa). Corre en GitHub Actions.
const { _electron: electron } = require('playwright');
const path = require('path');
const note = (x) => console.log('::notice::' + String(x).replace(/\n/g, ' ').slice(0, 900));
(async () => {
  const app = await electron.launch({ args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, KIVO_FAKE_AUDIO: path.join(__dirname, 'es.wav') } });
  const win = await app.firstWindow();
  win.on('console', (m) => { if (m.type() === 'error' || /voz/.test(m.text())) note('[consola] ' + m.text()); });
  win.on('pageerror', (e) => note('[error] ' + e.message));
  await win.waitForTimeout(3000);
  const r = await win.evaluate(async (model) => {
    window.KIVO_WHISPER = model;
    const log = []; const t0 = Date.now();
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;top:10px;left:10px;width:600px;height:60px;z-index:99999';
    const ta = document.createElement('textarea'); host.append(ta); document.body.append(host);
    startVoice(ta, host);
    const td = Date.now();
    for (let i = 0; i < 1200; i++) { await new Promise((r) => setTimeout(r, 500)); const b = host.querySelector('.vbar'); if (!b || !b.classList.contains('dl')) break; }
    log.push('descarga de la voz: ' + ((Date.now() - td) / 1000).toFixed(0) + ' s · barra: ' + (host.querySelector('.vlab') || {}).textContent);
    if (!host.querySelector('.vbar')) { log.push('la barra se cerró'); return log; }
    await new Promise((r) => setTimeout(r, 9000));
    log.push('barra visible: ' + !!host.querySelector('.vbar') + ' · ' + (host.querySelector('.vlab') || {}).textContent);
    const t1 = Date.now(); VOICE.ok();
    for (let i = 0; i < 240 && VOICE; i++) await new Promise((r) => setTimeout(r, 250));
    log.push('transcrito en ' + ((Date.now() - t1) / 1000).toFixed(1) + ' s');
    log.push('FINAL: ' + ta.value);
    return log;
  }, process.env.MODELO);
  r.forEach(note);
  await app.close();
  process.exit(r.some((x) => /^FINAL: \S/.test(x)) ? 0 : 1);
})().catch((e) => { note('fallo ' + e.message); process.exit(1); });
