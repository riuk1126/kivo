// Copia la librería de Supabase dentro de la app para que Kivo abra sin internet
const fs = require('fs');
const path = require('path');
const src = require.resolve('@supabase/supabase-js/dist/umd/supabase.js');
const dir = path.join(__dirname, '..', 'app', 'vendor');
fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(src, path.join(dir, 'supabase.js'));
console.log('Supabase copiado en app/vendor ✓');
