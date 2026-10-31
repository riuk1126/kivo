// Descarga el modelo de voz (Whisper en español) para que Kivo dicte sin internet.
// Uso: node scripts/modelo-voz.js [onnx-community/whisper-base]
const fs = require('fs');
const path = require('path');
const id = process.argv[2] || 'onnx-community/whisper-base';
const out = path.join(__dirname, '..', 'app', 'vendor', 'models', id);
const need = (f) => (!f.includes('/') && /\.(json|txt)$/.test(f)) || /^onnx\/(encoder_model|decoder_model_merged)_quantized\.onnx$/.test(f);
(async () => {
  const list = await (await fetch(`https://huggingface.co/api/models/${id}`)).json();
  const files = list.siblings.map((s) => s.rfilename).filter(need);
  for (const f of files) {
    const r = await fetch(`https://huggingface.co/${id}/resolve/main/${f}`);
    if (!r.ok) throw new Error(f + ' ' + r.status);
    const dest = path.join(out, f);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
    console.log('✓', f, Math.round(fs.statSync(dest).size / 1048576) + ' MB');
  }
})().catch((e) => { console.error(e); process.exit(1); });
