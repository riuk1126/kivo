// =============================================================
//  KIVO · Puente con Claude (conector MCP)
//  Supabase → Edge Functions → Deploy a new function → Via Editor
//  Nombre: kivo  ·  pega todo este archivo  ·  Deploy
//  Luego, en los ajustes de la función, desactiva "Verify JWT".
// =============================================================

const SB_URL = Deno.env.get('SUPABASE_URL') || 'https://yaeqxcwvlsnzqcqldktu.supabase.co';
const SB_KEY = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlhZXF4Y3d2bHNuenFjcWxka3R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NjMwMDAsImV4cCI6MjEwOTAzOTAwMH0.5CeMhdJiZzIgogDlCiAec12uyep9YRsyRKB2JbV2Vb0';
const TZ = 'America/Lima';
const VERSION = '1.0';

// Tipos de espacio de Kivo (iguales a la app)
const TIPOS = {
  general: { n: 'Lista simple', icono: 'i:list' },
  personal: { n: 'Personal', icono: 'i:home' },
  arch: { n: 'Estudio de arquitectura', icono: 'i:building', etapas: ['Prospecto', 'Levantamiento', 'Anteproyecto', 'Proyecto', 'Presupuesto', 'Ejecución', 'Entregado'], campos: 'client, place, service, area (m²), budget (S/), paid (S/)' },
  community: { n: 'Community manager', icono: 'i:megaphone', etapas: ['Idea', 'Redacción', 'Diseño', 'Aprobación', 'Programado', 'Publicado'], campos: 'client, network (Instagram|Facebook|TikTok|LinkedIn|X|YouTube|WhatsApp|Pinterest), format (Post|Carrusel|Reel|Historia|Video|Anuncio|En vivo), copy, link' },
  creator: { n: 'Creador de contenido', icono: 'i:play', etapas: ['Idea', 'Guion', 'Grabación', 'Edición', 'Miniatura', 'Publicado'], campos: 'platform (YouTube|TikTok|Instagram|Facebook|Twitch|Podcast), format, script, link' },
  design: { n: 'Diseño gráfico', icono: 'i:pen', etapas: ['Brief', 'Bocetos', 'Revisión', 'Ajustes', 'Aprobado', 'Entregado'], campos: 'client, piece, rounds, budget (S/), paid (S/), link' },
  shop: { n: 'Negocio / pedidos', icono: 'i:bag', etapas: ['Nuevo', 'Diseño', 'Producción', 'Listo', 'Entregado'], campos: 'client, product, qty, budget (S/), paid (S/), phone' },
  teach: { n: 'Clases / academia', icono: 'i:grad', etapas: ['Planificar', 'Preparar material', 'Grabar', 'Editar', 'Publicada'], campos: 'course, module, link' },
  writer: { n: 'Escritor (libro)', icono: 'i:book', etapas: ['Idea', 'Borrador', 'Revisión', 'Corrección', 'Final'], campos: 'words, pov, summary' },
  student: { n: 'Estudiante (universidad)', icono: 'i:grad', etapas: ['Por hacer', 'Avanzando', 'Entregado', 'Calificado'], campos: 'course (nombre exacto de un curso del espacio), type (Entrega de taller|Esquicio|Lámina|Planos|Maqueta|Render / 3D|Crítica / jurado|Investigación|Práctica calificada|Laboratorio|Informe|Tarea / problemas|Proyecto|Exposición|Examen parcial|Examen final), weight (% de la nota), grade (0-20)' },
  course: { n: 'Curso corto', icono: 'i:target', etapas: ['Por ver', 'Viendo', 'Practicando', 'Completado'], campos: 'link, hw (tarea o práctica)' },
};
const COLORES = ['#e8590c', '#db2777', '#be123c', '#7c3aed', '#4338ca', '#2563eb', '#0891b2', '#0f766e', '#16a34a', '#ca8a04', '#b45309', '#475569'];

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const ahora = () => new Intl.DateTimeFormat('es-PE', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date());
const uid = () => crypto.randomUUID();
const pad = (n) => String(n).padStart(2, '0');

const INSTRUCCIONES = `Kivo es la app de tareas del usuario (en español, Perú). Con estas herramientas puedes ver y organizar su Kivo directamente.
Reglas:
- Antes de crear o cambiar algo, usa "ver_kivo" para conocer sus espacios, ids, pendientes y horarios fijos (no pongas cosas encima de su horario).
- Si algo corresponde a un espacio que ya existe, úsalo; si no, crea uno con "crear_espacio" eligiendo el tipo adecuado.
- Reparte el trabajo en el tiempo con fechas realistas desde hoy. Fechas AAAA-MM-DD, horas HH:MM (24 h), zona horaria de Lima.
- Si el usuario no dice algo, decide lo más razonable y luego cuéntale brevemente qué armaste.
- Después de crear o cambiar, dile que ya está en su Kivo (se actualiza solo).`;

const DIAS = { dom: 0, domingo: 0, lun: 1, lunes: 1, mar: 2, martes: 2, mie: 3, miercoles: 3, jue: 4, jueves: 4, vie: 5, viernes: 5, sab: 6, sabado: 6 };
const sinTilde = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function dias(v) {
  const a = Array.isArray(v) ? v : String(v || '').split(/[,\s]+/);
  return [...new Set(a.map((x) => (typeof x === 'number' ? x : /^\d$/.test(String(x)) ? Number(x) : DIAS[sinTilde(x)])).filter((x) => x >= 0 && x <= 6))];
}
function hora(v) {
  const m = String(v || '').toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m|p\.?\s*m)?/);
  if (!m) return '';
  let h = Math.min(23, +m[1]);
  if (m[3] && m[3][0] === 'p' && h < 12) h += 12;
  if (m[3] && m[3][0] === 'a' && h === 12) h = 0;
  return pad(h) + ':' + pad(Math.min(59, +(m[2] || 0)));
}
const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');
const masHora = (t) => { const [a, b] = t.split(':').map(Number); const m = Math.min(a * 60 + b + 60, 23 * 60 + 59); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
function horarios(a) {
  return (Array.isArray(a) ? a : []).map((s) => {
    const d = dias(s.dias ?? s.days), i = hora(s.inicio ?? s.start), f = hora(s.fin ?? s.end);
    if (!d.length || !i) return null;
    return { id: uid(), d, s: i, e: f && f > i ? f : masHora(i), label: s.nombre ?? s.label ?? '', room: s.lugar ?? s.room ?? '' };
  }).filter(Boolean);
}
// Traduce los "datos" que manda Claude al formato interno de Kivo
function datos(tipo, d) {
  d = d && typeof d === 'object' ? d : {};
  const m = {};
  const num = { meta_palabras: 'goal', palabras_por_dia: 'daily', ya_escritas: 'base', nota_aprobatoria: 'pass', goal: 'goal', daily: 'daily', base: 'base', pass: 'pass' };
  for (const [k, v] of Object.entries(num)) if (d[k] != null && d[k] !== '') m[v] = Number(d[k]) || 0;
  const fch = { fecha_limite: 'deadline', inicio: 'start', fin: 'end', deadline: 'deadline', start: 'start', end: 'end' };
  for (const [k, v] of Object.entries(fch)) if (fecha(d[k])) m[v] = fecha(d[k]);
  const txt = { lugar: 'where', ciclo: 'cycle', carrera: 'career', where: 'where', cycle: 'cycle', career: 'career' };
  for (const [k, v] of Object.entries(txt)) if (d[k]) m[v] = String(d[k]);
  if (d.exigente != null || d.strict != null) m.strict = !!(d.exigente ?? d.strict);
  const sl = horarios(d.horario ?? d.slots);
  if (sl.length) m.slots = sl;
  const cs = (d.cursos ?? d.courses ?? []).map((c, j) => ({
    id: uid(), n: String(c.nombre ?? c.name ?? '').trim(), prof: c.profesor ?? c.teacher ?? '', room: c.aula ?? c.room ?? '',
    cred: c.creditos ?? c.credits ?? '', color: COLORES[(j * 3 + 1) % COLORES.length], slots: horarios(c.horario ?? c.slots),
  })).filter((c) => c.n);
  if (cs.length) m.courses = cs;
  if (tipo === 'writer' && m.goal == null && !d._editar) { m.goal = 60000; m.daily = m.daily ?? 500; }
  if (tipo === 'student' && m.pass == null && !d._editar) m.pass = 11;
  return m;
}

async function rpc(fn, args) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const t = await r.text();
  if (!r.ok) {
    let m = t; try { m = JSON.parse(t).message || t; } catch (_) { /* */ }
    throw new Error(String(m).replace(/^KIVO_\w+: /, ''));
  }
  return t ? JSON.parse(t) : null;
}

const HORARIO_DOC = 'horario: lista de {dias:[0-6, 0=domingo, 1=lunes…], inicio:"HH:MM", fin:"HH:MM", nombre?, lugar?}';
const TOOLS = [
  {
    name: 'ver_kivo',
    description: 'Muestra los espacios (proyectos, cursos, negocios, libro…) del usuario en Kivo con sus horarios, y sus tareas pendientes con fechas. Úsala antes de crear o cambiar algo para conocer los ids y su horario fijo.',
    inputSchema: { type: 'object', properties: { incluir_hechas: { type: 'boolean', description: 'También las tareas ya hechas' } } },
    annotations: { readOnlyHint: true, title: 'Ver mi Kivo' },
  },
  {
    name: 'crear_espacio',
    description: 'Crea un espacio nuevo en Kivo. Tipos: ' + Object.entries(TIPOS).map(([k, t]) => `${k} = ${t.n}${t.etapas ? ' (etapas: ' + t.etapas.join(' → ') + ')' : ''}`).join('; ') +
      `. "datos" según el tipo — course: {inicio, fin (AAAA-MM-DD), lugar, exigente, ${HORARIO_DOC} con las clases y horas de práctica}; writer: {meta_palabras, palabras_por_dia, fecha_limite, exigente, horario de sesiones de escritura}; student: {carrera, ciclo, nota_aprobatoria (11), exigente, cursos:[{nombre, profesor, aula, horario}]}. Devuelve el id del espacio para luego agregar tareas.`,
    inputSchema: {
      type: 'object', required: ['nombre', 'tipo'],
      properties: {
        nombre: { type: 'string', description: 'Nombre corto, ej. "Curso de SketchUp"' },
        tipo: { type: 'string', enum: Object.keys(TIPOS) },
        datos: { type: 'object', description: 'Horario, fechas, metas o cursos, según el tipo', additionalProperties: true },
      },
    },
    annotations: { title: 'Crear espacio' },
  },
  {
    name: 'agregar_tareas',
    description: 'Agrega una o varias tareas a Kivo (módulos de un curso, capítulos, entregas, pendientes…). Cada tarea puede tener fecha, hora, etapa (una de las etapas del tipo de espacio), pasos (checklist) y campos según el tipo: ' +
      Object.entries(TIPOS).filter(([, t]) => t.campos).map(([k, t]) => `${k}: ${t.campos}`).join('; ') + '.',
    inputSchema: {
      type: 'object', required: ['tareas'],
      properties: {
        tareas: {
          type: 'array', items: {
            type: 'object', required: ['texto'],
            properties: {
              texto: { type: 'string' },
              espacio_id: { type: 'string', description: 'id del espacio (de ver_kivo o crear_espacio). Vacío = tarea suelta' },
              espacio: { type: 'string', description: 'O el nombre exacto del espacio, si no tienes el id' },
              fecha: { type: 'string', description: 'AAAA-MM-DD' },
              hora: { type: 'string', description: 'HH:MM (24 h)' },
              etapa: { type: 'string' },
              importante: { type: 'boolean' },
              pasos: { type: 'array', items: { type: 'string' } },
              notas: { type: 'string' },
              campos: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
    annotations: { title: 'Agregar tareas' },
  },
  {
    name: 'actualizar_tarea',
    description: 'Cambia una tarea de Kivo: moverla de día u hora, cambiar el texto o la etapa, marcarla como hecha o pendiente.',
    inputSchema: {
      type: 'object', required: ['id'],
      properties: {
        id: { type: 'string' }, texto: { type: 'string' },
        fecha: { type: 'string', description: 'AAAA-MM-DD, o "" para quitar la fecha' }, hora: { type: 'string', description: 'HH:MM o ""' },
        etapa: { type: 'string' }, hecha: { type: 'boolean' }, importante: { type: 'boolean' }, notas: { type: 'string' },
      },
    },
    annotations: { title: 'Cambiar tarea' },
  },
  {
    name: 'actualizar_espacio',
    description: 'Cambia un espacio de Kivo: su nombre o sus datos (horario, fechas, metas de palabras, cursos, modo exigente). Los datos que mandes reemplazan a los anteriores de ese mismo tipo (por ejemplo, un "horario" nuevo reemplaza el horario completo).',
    inputSchema: {
      type: 'object', required: ['espacio_id'],
      properties: { espacio_id: { type: 'string' }, nombre: { type: 'string' }, datos: { type: 'object', additionalProperties: true } },
    },
    annotations: { title: 'Cambiar espacio' },
  },
];

function etapaYestado(tipo, etapa) {
  const et = (TIPOS[tipo] || {}).etapas;
  if (!et) return { estado: 'todo' };
  const e = et.find((x) => sinTilde(x) === sinTilde(etapa || '')) || et[0];
  const i = et.indexOf(e);
  return { etapa: e, estado: i === et.length - 1 ? 'done' : i === 0 ? 'todo' : 'doing' };
}

async function llamar(key, name, a) {
  a = a || {};
  if (name === 'ver_kivo') {
    const v = await rpc('kivo_api_ver', { p_key: key, p_hechas: !!a.incluir_hechas });
    v.hoy = hoy(); v.ahora = ahora();
    for (const e of v.espacios) { const t = TIPOS[e.tipo]; if (t && t.etapas) e.etapas = t.etapas; }
    return JSON.stringify(v);
  }
  if (name === 'crear_espacio') {
    const tipo = TIPOS[a.tipo] ? a.tipo : 'general';
    const v = await rpc('kivo_api_crear_espacio', {
      p_key: key, p_nombre: a.nombre, p_tipo: tipo, p_icono: TIPOS[tipo].icono,
      p_color: COLORES[Math.floor(Math.random() * COLORES.length)], p_datos: datos(tipo, a.datos),
    });
    return `Espacio «${v.nombre}» creado (id ${v.id}, tipo ${TIPOS[tipo].n}). Ahora agrega sus tareas con agregar_tareas usando espacio_id = ${v.id}.`;
  }
  if (name === 'agregar_tareas') {
    const ctx = await rpc('kivo_api_ver', { p_key: key, p_hechas: false });
    const tipoDe = {}; const idDe = {};
    for (const e of ctx.espacios) { tipoDe[e.id] = e.tipo; idDe[sinTilde(e.nombre)] = e.id; }
    const lista = (Array.isArray(a.tareas) ? a.tareas : []).slice(0, 100).map((t) => {
      const eid = t.espacio_id || (t.espacio ? idDe[sinTilde(t.espacio)] : '') || '';
      const { etapa, estado } = etapaYestado(tipoDe[eid], t.etapa);
      return {
        texto: String(t.texto || '').trim(), espacio_id: eid, fecha: fecha(t.fecha), hora: t.hora ? hora(t.hora) : '', etapa: etapa || '', estado,
        importante: !!t.importante, notas: t.notas || '', campos: t.campos && typeof t.campos === 'object' ? t.campos : {},
        pasos: (t.pasos || []).slice(0, 20).map((p) => ({ id: uid(), text: String(p), done: false })),
      };
    }).filter((t) => t.texto);
    if (!lista.length) throw new Error('No hay tareas para agregar');
    const r = await rpc('kivo_api_agregar_tareas', { p_key: key, p_tareas: lista });
    return `Listo: ${r.length} tarea${r.length === 1 ? '' : 's'} agregada${r.length === 1 ? '' : 's'} a Kivo. ids: ${r.map((x) => x.id).join(', ')}`;
  }
  if (name === 'actualizar_tarea') {
    const c = {};
    if (a.texto != null) c.texto = String(a.texto);
    if (a.fecha != null) c.fecha = fecha(a.fecha);
    if (a.hora != null) c.hora = a.hora ? hora(a.hora) : '';
    if (a.notas != null) c.notas = String(a.notas);
    if (a.importante != null) c.importante = !!a.importante;
    if (a.etapa || a.hecha != null) {
      const ctx = await rpc('kivo_api_ver', { p_key: key, p_hechas: true });
      const t = ctx.tareas.find((x) => x.id === a.id);
      const tipo = t && t.espacio_id ? (ctx.espacios.find((e) => e.id === t.espacio_id) || {}).tipo : null;
      const et = (TIPOS[tipo] || {}).etapas;
      if (a.etapa) { const r = etapaYestado(tipo, a.etapa); if (r.etapa) { c.etapa = r.etapa; c.estado = r.estado; } }
      if (a.hecha != null) {
        c.estado = a.hecha ? 'done' : 'todo';
        if (et) { if (a.hecha) c.etapa = et[et.length - 1]; else if (t && t.etapa === et[et.length - 1]) c.etapa = et[0]; }
      }
    }
    if (c.estado === 'done') c.hoy = hoy();
    await rpc('kivo_api_actualizar_tarea', { p_key: key, p_id: a.id, p_cambios: c });
    return 'Tarea actualizada en Kivo.';
  }
  if (name === 'actualizar_espacio') {
    const ctx = await rpc('kivo_api_ver', { p_key: key, p_hechas: false });
    const e = ctx.espacios.find((x) => x.id === a.espacio_id);
    if (!e) throw new Error('Ese espacio no existe o no es tuyo');
    await rpc('kivo_api_actualizar_espacio', { p_key: key, p_id: a.espacio_id, p_nombre: a.nombre || null, p_datos: datos(e.tipo, Object.assign({ _editar: 1 }, a.datos || {})) });
    return 'Espacio actualizado en Kivo.';
  }
  throw new Error('Herramienta desconocida: ' + name);
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, mcp-session-id, mcp-protocol-version, x-kivo-key, apikey',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
};
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function responder(msg, key) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const fail = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (method === 'initialize') {
    return ok({
      protocolVersion: (params && params.protocolVersion) || '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'kivo', title: 'Kivo', version: VERSION },
      instructions: INSTRUCCIONES + '\nHoy es ' + ahora() + '.',
    });
  }
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: TOOLS });
  if (method === 'tools/call') {
    try {
      const text = await llamar(key, params && params.name, params && params.arguments);
      return ok({ content: [{ type: 'text', text }] });
    } catch (e) {
      return ok({ content: [{ type: 'text', text: 'No se pudo: ' + (e && e.message || e) }], isError: true });
    }
  }
  if (method === 'resources/list') return ok({ resources: [] });
  if (method === 'prompts/list') return ok({ prompts: [] });
  if (method && method.startsWith('notifications/')) return null;
  return fail(-32601, 'Método no soportado: ' + method);
}

async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || req.headers.get('x-kivo-key') ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').replace(/^ey[\w-]+\.[\w-]+\.[\w-]+$/, '');
  if (req.method === 'GET') {
    if (/\.well-known/.test(url.pathname)) return json({ error: 'not_found' }, 404);
    return new Response('Kivo · conector para Claude ✓', { status: req.headers.get('accept')?.includes('text/event-stream') ? 405 : 200, headers: CORS });
  }
  if (req.method === 'DELETE') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return new Response('', { status: 405, headers: CORS });
  if (!key) return json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Falta la clave de Kivo (?key=…)' } }, 401);
  let body;
  try { body = await req.json(); } catch (_) { return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, 400); }
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => responder(m, key)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const r = await responder(body, key);
  return r ? json(r) : new Response(null, { status: 202, headers: CORS });
}

Deno.serve(handler);
