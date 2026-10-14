/* ==========================================================================
   scripts/alcance.js · Detecta archivos INALCANZABLES
   --------------------------------------------------------------------------
   Recorre el grafo de dependencias partiendo del punto de entrada real
   (package.json "main" -> main/main.js) y lista todo lo que NO se alcanza.

   Regla: si un archivo no es alcanzable desde main.js, editar NO tiene ningún
   efecto en pantalla, aunque existan enlaces entre archivos "muertos".

   Uso:  node scripts/alcance.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const P = path.join(__dirname, '..');
const EXCL = /node_modules[\\/]|\.git[\\/]|package-lock|_legacy[\\/]/;

/* ---------- inventario de archivos del proyecto ---------- */
const caminar = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (EXCL.test(f)) continue;
        if (e.isDirectory()) caminar(f, out);
        else out.push(f);
    }
    return out;
};

const todos = caminar(P);
const porNombre = new Map();
for (const f of todos) {
    const b = path.basename(f);
    if (!porNombre.has(b)) porNombre.set(b, f);   // la primera coincidencia gana
}

/* ---------- lectura de referencias ----------
   RE   → tokens que ya traen extensión: "app.js", "../assets/style.css"
   RE_Q → cadenas entrecomilladas: require('../database/db') (sin extensión)   */
const RE = /[A-Za-z0-9_.\-/\\]+\.(?:html|css|js|json)\b/g;
const RE_Q = /['"]([^'"\s]+)['"]/g;

function resolver(desde, token) {
    const limpio = token.replace(/[\\/]/g, path.sep);
    const relativa = path.resolve(path.dirname(desde), limpio);   // relativa al archivo
    if (fs.existsSync(relativa)) return relativa;
    const desdeRaiz = path.resolve(P, limpio.replace(/^[.\\/]+/, ''));   // relativa a la raíz
    if (fs.existsSync(desdeRaiz)) return desdeRaiz;
    return porNombre.get(path.basename(limpio)) || null;          // por nombre base
}

const alcanzables = new Map();            // archivo -> quién lo trajo
const cola = [porNombre.get('main.js') || path.join(P, 'main', 'main.js')];
alcanzables.set(cola[0], '← punto de entrada (package.json "main")');

function intentar(desde, token, quien) {
    // El fallback ".js" SOLO aplica a rutas relativas (contienen / o \).
    // Así no confundimos el nombre de módulo 'contabilidad' de la BD con
    // modules/contabilidad.js, cosa que contamina todo el grafo.
    const esRuta = /^\.?\.{0,2}[\\/]/.test(token) || /[\\/]/.test(token);
    let d = resolver(desde, token);
    if (!d && esRuta && !/\.[a-z0-9]+$/i.test(token)) d = resolver(desde, token + '.js');
    if (!d || !/\.(html|css|js|json)$/.test(d)) return;
    if (alcanzables.has(d)) return;
    alcanzables.set(d, '← ' + quien);
    cola.push(d);
}

while (cola.length) {
    const f = cola.shift();
    let txt;
    try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    let m;
    RE.lastIndex = 0;
    while ((m = RE.exec(txt))) intentar(f, m[0], path.basename(f));
    RE_Q.lastIndex = 0;
    while ((m = RE_Q.exec(txt))) {
        const t = m[1];
        if (/^[\w.@~${}-]+$/.test(t) || /^\.?\.?[\\/]/.test(t)) intentar(f, t, path.basename(f));
    }
}

/* ---------- informe ---------- */
const rel = (f) => path.relative(P, f);
const sol = todos.filter((f) => /\.(html|css|js)$/.test(f));
const vivos = sol.filter((f) => alcanzables.has(f));
const muertos = sol.filter((f) => !alcanzables.has(f));

console.log('=== ALCANZABLE DESDE main/main.js (se ejecutan de verdad) ===');
vivos.forEach((f) => console.log('  [VIVO]   ' + rel(f).padEnd(34) + alcanzables.get(f)));

console.log('\n=== INALCANZABLES (editarlos NO cambia nada en pantalla) ===');
muertos.forEach((f) => console.log('  [MUERTO] ' + rel(f)));

console.log(`\nRESUMEN: vivos=${vivos.length}  muertos=${muertos.length}`);
if (muertos.length === 0) console.log('✔ El proyecto no arrastra código muerto.');
process.exit(muertos.length ? 1 : 0);
