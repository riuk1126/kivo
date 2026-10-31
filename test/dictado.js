// Prueba automática del dictado en vivo dentro del programa (corre en GitHub Actions)
const { _electron: electron } = require('playwright');
const path = require('path');
(async () => {
  const app = await electron.launch({ args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, KIVO_FAKE_AUDIO: path.join(__dirname, 'es.wav') } });
  const win = await app.firstWindow();
  win.on('console', (m) => console.log('[consola]', m.type(), m.text()));
  win.on('pageerror', (e) => console.log('[error]', e.message));
  await win.waitForTimeout(3000);
  const t0 = Date.now();
  const r = await win.evaluate(async () => {
    const ta = document.createElement('textarea'); ta.id = 'pr'; document.body.append(ta);
    const log = [];
    try { const m = await voskModel(); log.push('modelo ok'); } catch (e) { log.push('modelo ERROR ' + (e && e.message)); return log; }
    const ok = await liveDictate(ta, null); log.push('liveDictate ' + ok);
    const seen = [];
    for (let i = 0; i < 24; i++) { await new Promise((r) => setTimeout(r, 500)); if (seen[seen.length - 1] !== ta.value) seen.push(ta.value); }
    if (LIVE) LIVE.stop();
    await new Promise((r) => setTimeout(r, 800));
    log.push('evolución: ' + JSON.stringify(seen.slice(0, 12)));
    log.push('FINAL: ' + ta.value);
    return log;
  });
  console.log(r.join('\n'));
  r.forEach((x) => console.log('::notice::' + x.replace(/\n/g, ' ').slice(0, 900)));
  console.log('::notice::tiempo ' + Math.round((Date.now() - t0) / 1000) + ' s');
  await win.screenshot({ path: path.join(__dirname, 'captura.png') });
  await app.close();
  process.exit(/FINAL: \S/.test(r.join('\n')) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
