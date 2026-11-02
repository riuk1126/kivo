// Copia la librería de Supabase dentro de la app para que Kivo abra sin internet
const fs = require('fs');
const path = require('path');
const src = require.resolve('@supabase/supabase-js/dist/umd/supabase.js');
const dir = path.join(__dirname, '..', 'app', 'vendor');
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(src, path.join(dir, 'supabase.js'));
console.log('Supabase copiado en app/vendor ✓');

// Dictado sin internet (Whisper): motor de IA y su WebAssembly
const nm = path.join(__dirname, '..', 'node_modules');
const tdir = path.join(nm, '@huggingface', 'transformers', 'dist');
if (fs.existsSync(tdir)) {
  const pick = ['transformers.min.js', 'transformers.web.min.js', 'transformers.js'].find((f) => fs.existsSync(path.join(tdir, f)));
  fs.copyFileSync(path.join(tdir, pick), path.join(dir, 'transformers.min.js'));
  const seen = new Set();
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { if (f.name !== '.bin') walk(p); }
    else if (/^ort-wasm.*\.(wasm|mjs)$/.test(f.name) && !seen.has(f.name)) { seen.add(f.name); fs.copyFileSync(p, path.join(dir, f.name)); }
  } };
  [path.join(tdir), path.join(nm, 'onnxruntime-web', 'dist'), path.join(nm, '@huggingface', 'transformers', 'node_modules')].forEach((d) => fs.existsSync(d) && walk(d));
  console.log('Whisper copiado en app/vendor ✓ (' + pick + ', ' + [...seen].join(', ') + ')');
} else console.log('Transformers no encontrado (sin dictado sin internet)');

// Visor de PDF dentro de Kivo (computadora, tableta y celular)
const pdir = path.join(nm, 'pdfjs-dist', 'build');
if (fs.existsSync(pdir)) {
  fs.copyFileSync(path.join(pdir, 'pdf.min.js'), path.join(dir, 'pdf.min.js'));
  fs.copyFileSync(path.join(pdir, 'pdf.worker.min.js'), path.join(dir, 'pdf.worker.min.js'));
  console.log('Visor de PDF copiado en app/vendor ✓');
}
