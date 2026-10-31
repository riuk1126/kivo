// Copia la librería de Supabase dentro de la app para que Kivo abra sin internet
const fs = require('fs');
const path = require('path');
const src = require.resolve('@supabase/supabase-js/dist/umd/supabase.js');
const dir = path.join(__dirname, '..', 'app', 'vendor');
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(src, path.join(dir, 'supabase.js'));
console.log('Supabase copiado en app/vendor ✓');

// Dictado sin internet (Vosk): librería
const vosk = path.join(__dirname, '..', 'node_modules', 'vosk-browser', 'dist', 'vosk.js');
if (fs.existsSync(vosk)) { fs.copyFileSync(vosk, path.join(dir, 'vosk.js')); console.log('Vosk copiado en app/vendor ✓'); }
else console.log('Vosk no encontrado (el dictado usará el del sistema)');
