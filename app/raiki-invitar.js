// RAIKI — invitaciones entre apps (Kivo, OXEN PRO y Flexio). Este mismo archivo va en las tres apps.
// Cada app avisa al servidor que se abrió en este equipo y, si la cuenta todavía no usa las otras apps
// en una tableta o celular Android, muestra una tarjeta para descargarlas (o pedir una prueba).
(function () {
  'use strict';
  const WHATSAPP = '51927907173';
  const APPS = {
    kivo: { nombre: 'Kivo', txt: 'Tus pendientes y los de tu equipo, con alertas y horario.', icono: 'https://riuk1126.github.io/kivo/icons/icon-192.png', apk: 'https://github.com/riuk1126/kivo/releases/latest/download/Kivo.apk', color: '#1d1d1f' },
    oxen: { nombre: 'OXEN PRO', txt: 'Bocetos y levantamientos a mano alzada con el lápiz.', icono: 'https://riuk1126.github.io/oxenpro/icono-192.png', apk: 'https://github.com/riuk1126/oxenpro/releases/latest/download/OXEN-PRO.apk', color: '#6a9f00' },
    flexio: { nombre: 'Flexio', txt: 'Modelado 3D para arquitectos, con tu lápiz.', icono: 'https://riuk1126.github.io/oxenpro/flexio/icono-192.png', apk: 'https://github.com/riuk1126/oxenpro/releases/download/flexio-v1.0.0/Flexio.apk', color: '#6666ff' }
  };
  const ORDEN = ['flexio', 'oxen', 'kivo'];
  const DIAS_OCULTO = 10;
  const leer = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const escribir = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ANDROID = /Android/i.test(navigator.userAgent);
  function plataforma() {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) return 'android';
    if (/iPad|iPhone/.test(ua)) return 'ios';
    if (/Windows/.test(ua)) return 'windows';
    if (/Mac/.test(ua)) return 'mac';
    if (/Linux/.test(ua)) return 'linux';
    return 'web';
  }
  function estilos() {
    if (document.getElementById('rinv-css')) return;
    const s = document.createElement('style'); s.id = 'rinv-css';
    s.textContent = `.rinv{display:flex;flex-direction:column;gap:10px;margin:0 auto 16px;max-width:1200px;width:100%}
.rinv-c{display:flex;align-items:center;gap:12px;border-radius:14px;padding:10px 10px 10px 12px;border:1px solid color-mix(in srgb,var(--rc) 45%,transparent);background:linear-gradient(100deg,color-mix(in srgb,var(--rc) 18%,transparent),color-mix(in srgb,var(--rc) 5%,transparent));font:inherit;color:inherit;box-sizing:border-box}
.rinv-c img{width:42px;height:42px;border-radius:10px;flex:none;background:#fff;object-fit:cover}
.rinv-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;line-height:1.3}
.rinv-t b{font-size:15px}.rinv-t span{font-size:13px;opacity:.72}
.rinv-b{border:0;border-radius:10px;padding:10px 16px;font-weight:700;font-size:14px;cursor:pointer;background:var(--rc);color:#fff;white-space:nowrap;font-family:inherit}
.rinv-b:disabled{opacity:.6}
.rinv-x{border:0;background:none;color:inherit;opacity:.55;font-size:13px;cursor:pointer;padding:8px;white-space:nowrap;font-family:inherit}
@media (max-width:620px){.rinv-c{flex-wrap:wrap}.rinv-t{flex-basis:calc(100% - 60px)}.rinv-b{flex:1}}`;
    document.head.appendChild(s);
  }

  // o: { app, rpc(nombre, args) → Promise, contenedor: Element o función que lo devuelve, dispositivo, version, nativo() → plugin con installUpdate, avisar(texto) }
  async function iniciar(o) {
    const avisar = o.avisar || (t => console.log(t));
    try { await o.rpc('registrar_app', { p_app: o.app, p_device: o.dispositivo, p_plataforma: plataforma(), p_version: o.version || null }); } catch (e) { /* sin internet: no pasa nada */ }
    let r = null;
    try { r = await o.rpc('mis_apps'); } catch (e) { r = leer('raiki-mis-apps'); }
    if (!r) return;
    escribir('raiki-mis-apps', r);
    const pintar = () => {
      const cont = typeof o.contenedor === 'function' ? o.contenedor() : o.contenedor; if (!cont) return;
      let caja = cont.querySelector(':scope > .rinv');
      const faltan = r.invitar === false ? [] : ORDEN.filter(k => k !== o.app && !(r.apps && r.apps[k] && r.apps[k].android) && !((leer('raiki-inv-oculto') || {})[k] > Date.now()));
      if (!faltan.length) { if (caja) caja.remove(); return; }
      estilos();
      if (!caja) { caja = document.createElement('div'); caja.className = 'rinv'; cont.insertBefore(caja, cont.firstChild); }
      caja.innerHTML = faltan.map(k => {
        const a = APPS[k], puede = !r.acceso || r.acceso[k] !== false;
        const accion = !puede ? 'Pedir prueba gratis' : ANDROID ? 'Descargar' : 'Ver cómo';
        const txt = puede ? a.txt + ' Entras con tu misma cuenta RAIKI.' : a.txt + ' Pide tu prueba gratis y entra con tu misma cuenta RAIKI.';
        return `<div class="rinv-c" style="--rc:${a.color}"><img src="${a.icono}" alt="" onerror="this.style.visibility='hidden'"><div class="rinv-t"><b>Prueba ${esc(a.nombre)}</b><span>${esc(txt)}</span></div>
          <button class="rinv-b" data-rinv="${k}">${accion}</button><button class="rinv-x" data-rinvx="${k}">Ahora no</button></div>`;
      }).join('');
      caja.querySelectorAll('[data-rinvx]').forEach(b => b.onclick = () => { const oc = leer('raiki-inv-oculto') || {}; oc[b.dataset.rinvx] = Date.now() + DIAS_OCULTO * 864e5; escribir('raiki-inv-oculto', oc); pintar(); });
      caja.querySelectorAll('[data-rinv]').forEach(b => b.onclick = () => accionar(b.dataset.rinv, b));
    };
    async function accionar(k, btn) {
      const a = APPS[k], puede = !r.acceso || r.acceso[k] !== false;
      if (!puede) { window.open('https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent('Hola, quiero probar ' + a.nombre + '. Mi correo RAIKI es ' + (o.email ? o.email() : '')), '_blank'); return; }
      const N = o.nativo && o.nativo();
      if (N && N.installUpdate) {
        let h = null; const t0 = btn.textContent; btn.disabled = true; btn.textContent = 'Descargando…';
        try { h = await N.addListener('updProgress', d => { btn.textContent = d.p + '%'; }); } catch (e) {}
        try {
          const res = await N.installUpdate({ url: a.apk });
          if (res && res.status === 'permission') avisar('Permite «instalar apps» desde esta app y vuelve a tocar Descargar');
          else avisar('Toca «Instalar» y abre ' + a.nombre + ' con tu cuenta RAIKI');
        } catch (e) { avisar('No se pudo descargar ' + a.nombre + '. Revisa tu internet.'); }
        finally { try { h && h.remove(); } catch (e) {} btn.disabled = false; btn.textContent = t0; }
        return;
      }
      if (ANDROID) { location.href = a.apk; return; }
      avisar(a.nombre + ' es para tableta y celular Android: este mismo aviso te aparece al abrir Kivo, OXEN PRO o Flexio en la tableta, y ahí se descarga con un toque.');
    }
    pintar();
    return { repintar: pintar, datos: r };
  }
  window.RaikiInvitar = { iniciar, APPS };
})();
