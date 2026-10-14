/* ==========================================================================
   scripts/diagnostico.js · Prueba de arranque REAL en ventana oculta
   --------------------------------------------------------------------------
   Carga src/index.html con el preload real, captura errores de consola y
   reporta qué se cargó de verdad (URL, CSS aplicado, preload, vistas activas).
   No modifica nada del proyecto y nunca muestra una ventana en pantalla.

   Uso:  npm run diagnostico
   ========================================================================== */
'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const P = path.join(__dirname, '..');
const salida = [];
const log = (...a) => { const s = a.join(' '); salida.push(s); console.log(s); };

app.disableHardwareAcceleration();

/* Respuestas mínimas para que modules/app.js no se caiga por falta de IPC.
   (Aquí no abrimos SQLite: queremos medir la carga de la interfaz.) */
['crud:listar', 'crud:crear', 'crud:actualizar', 'crud:eliminar'].forEach((canal) =>
    ipcMain.handle(canal, async () => ({ success: true, data: [] })));
ipcMain.handle('vista-actual', () => path.join(P, 'src', 'index.html'));
ipcMain.on('navegar-a', () => {});

app.whenReady().then(() => {
    const win = new BrowserWindow({
        show: false,                 // nunca aparece en pantalla
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(P, 'main', 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    const consola = (...args) => {
        // Firma nueva (objeto) y vieja (posiciónal) de 'console-message'
        if (args[1] && typeof args[1] === 'object') {
            const d = args[1];
            log(`  [consola] ${d.level >= 3 ? 'ERROR' : 'aviso'}: ${d.message} (${d.sourceId}:${d.lineNumber})`);
        } else {
            log(`  [consola] nivel=${args[1]} ${args[2]} (${args[4]}:${args[3]})`);
        }
    };
    win.webContents.on('console-message', consola);
    win.webContents.on('render-process-gone', (_e, d) => log('  [FALLO] render-process-gone: ' + JSON.stringify(d)));
    win.webContents.on('did-fail-load', (_e, code, desc, url) => log('  [FALLO] did-fail-load: ' + code + ' ' + desc + ' ' + url));

    win.webContents.on('did-finish-load', async () => {
        log('URL cargada: ' + win.webContents.getURL());
        try {
            const info = await win.webContents.executeJavaScript(`(() => {
                const $ = (s) => document.querySelector(s);
                const hojas = [...document.styleSheets];
                return {
                  titulo: document.title,
                  fechaHoy_vacia: $('#fechaHoy') ? ($('#fechaHoy').textContent === '') : 'no-existe',
                  stats_vacios:   $('#stats-contabilidad') ? ($('#stats-contabilidad').textContent.trim() === '') : 'no-existe',
                  preload_api: typeof window.api,
                  apiClaves: window.api ? Object.keys(window.api).length : 0,
                  hojas_css: hojas.map(s => (s.href || '(inline)').split('/').pop()),
                  reglas: hojas[0] && hojas[0].cssRules ? hojas[0].cssRules.length : -1,
                  vistas: [...document.querySelectorAll('.vista')].map(v => v.id),
                  vistas_activas: [...document.querySelectorAll('.vista.is-active')].map(v => v.id),
                  sidebar_bg: $('.sidebar') ? getComputedStyle($('.sidebar')).backgroundImage.slice(0, 50) : 'no-existe'
                };
            })()`);
            log('RESULTADO ' + JSON.stringify(info));

            const ok =
                info.preload_api === 'object' &&
                info.apiClaves > 0 &&
                info.reglas > 0 &&
                info.fechaHoy_vacia === false;
            log(ok
                ? '\n✔ OK: interfaz, CSS y preload cargados desde disco.'
                : '\n✗ PROBLEMA: revisa los mensajes de consola de arriba.');
        } catch (e) {
            log('✗ ERROR al inspeccionar el DOM: ' + e.message);
        }
        setTimeout(() => app.quit(), 250);
    });

    win.loadFile(path.join(P, 'src', 'index.html'));
});

app.on('window-all-closed', () => app.quit());
