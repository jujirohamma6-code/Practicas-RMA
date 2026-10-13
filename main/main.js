/* ==========================================================================
   MÓNICA GESTIÓN · PROCESO PRINCIPAL (Electron)
   --------------------------------------------------------------------------
   Contenido:
     1. Diagnóstico y blindaje de arranque.
     2. Creación de la ventana principal.
     3. Navegación entre vistas (IPC 'navegar-a').
     4. BLOQUE 2 · CRUD real sobre SQLite (IPC 'crud:*').
   Arquitectura segura: contextIsolation ON, nodeIntegration OFF y todo el
   acceso a la base de datos ocurre únicamente aquí, en el proceso principal.
   ========================================================================== */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Helpers de datos (promisificados) y modelos (whitelist tabla/campos).
const { all, run, MODELOS } = require('../database/db');

/* ==========================================================================
   1. DIAGNÓSTICO Y BLINDAJE DE ARRANQUE
   ========================================================================== */
const LOG_FILE = path.join(__dirname, '..', 'electron-error.log');

function registrarError(origen, error) {
    const detalle = (error && (error.stack || error.message)) || error;
    const texto = `\n[${new Date().toISOString()}] ${origen}\n${detalle}\n`;
    try { fs.appendFileSync(LOG_FILE, texto); } catch (e) { /* sin permisos de escritura */ }
    console.error(`[MG-ERROR] ${origen}:`, detalle);
}

// Evita cierres inmediatos en Windows causados por la aceleración gráfica.
app.disableHardwareAcceleration();

// No permitir que el proceso muera por excepciones no controladas.
process.on('uncaughtException', (error) => {
    registrarError('uncaughtException', error);
});
process.on('unhandledRejection', (reason) => {
    registrarError('unhandledRejection', reason);
});

/* ==========================================================================
   2. VENTANA PRINCIPAL
   ========================================================================== */
let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Cargar la interfaz principal unificada (sidebar + módulos)
    mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

    // Mostrar la ventana recién cuando el contenido terminó de cargar.
    mainWindow.once('ready-to-show', () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
    });

    // Si el renderer se cae, registramos el motivo y recargamos.
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        registrarError('render-process-gone', JSON.stringify(details));
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
    });

    mainWindow.webContents.on('did-fail-load', (event, code, desc, url) => {
        registrarError('did-fail-load', `codigo=${code} descripcion=${desc} url=${url}`);
    });

    // Herramientas de desarrollo: solo con `electron . --debug` o MG_DEV=1.
    if (process.argv.includes('--debug') || process.env.MG_DEV) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    try {
        createWindow();
    } catch (e) {
        registrarError('createWindow', e);
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            try {
                createWindow();
            } catch (e) {
                registrarError('createWindow', e);
            }
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

/* ==========================================================================
   3. NAVEGACIÓN ENTRE VISTAS
   ========================================================================== */
ipcMain.on('navegar-a', (event, pagina) => {
    if (!pagina || typeof pagina !== 'string') return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    // Solo se permite navegar a archivos HTML del propio src/ (evita rutas externas).
    const destino = path.join(__dirname, '..', 'src', path.basename(pagina));
    win.loadFile(destino).catch((err) => console.error('[Nav] No se pudo navegar a', pagina, err.message));
});

/* ==========================================================================
   4. BLOQUE 2 · CRUD REAL SOBRE SQLITE
   --------------------------------------------------------------------------
   Cuatro canales genéricos cubren las cuatro operaciones para los tres módulos.
   La seguridad se apoya en MODELOS (whitelist): el renderer solo puede mandar
   un `modulo` conocido y campos permitidos; tabla y columnas nunca son input.
   ========================================================================== */

/** Devuelve el modelo del módulo o lanza un error si no es válido. */
function resolverModelo(modulo) {
    const clave = String(modulo || '').toLowerCase().trim();
    const modelo = MODELOS[clave];
    if (!modelo) throw new Error(`Módulo no válido: "${modulo}"`);
    return modelo;
}

/** Filtra el payload dejando solo los campos permitidos del modelo. */
function tomarCamposPermitidos(modelo, datos) {
    const limpio = {};
    if (!datos || typeof datos !== 'object') return limpio;
    for (const campo of modelo.campos) {
        if (datos[campo] !== undefined) limpio[campo] = datos[campo];
    }
    return limpio;
}

/* ---------- READ · Obtener / listar ---------- */
ipcMain.handle('crud:listar', async (_event, { modulo } = {}) => {
    try {
        const { tabla } = resolverModelo(modulo);
        const filas = await all(`SELECT * FROM ${tabla} ORDER BY id DESC`);
        return { success: true, data: filas };
    } catch (error) {
        registrarError('crud:listar', error);
        return { success: false, error: error.message };
    }
});

/* ---------- CREATE · Crear ---------- */
ipcMain.handle('crud:crear', async (_event, { modulo, datos } = {}) => {
    try {
        const modelo = resolverModelo(modulo);
        const valores = tomarCamposPermitidos(modelo, datos);
        const columnas = Object.keys(valores);

        if (columnas.length === 0) {
            return { success: false, error: 'No se recibieron datos para guardar.' };
        }

        const placeholders = columnas.map(() => '?').join(', ');
        const sql = `INSERT INTO ${modelo.tabla} (${columnas.join(', ')}) VALUES (${placeholders})`;
        const resultado = await run(sql, columnas.map((c) => valores[c]));

        return { success: true, id: resultado.id };
    } catch (error) {
        registrarError('crud:crear', error);
        return { success: false, error: error.message };
    }
});

/* ---------- UPDATE · Actualizar ---------- */
ipcMain.handle('crud:actualizar', async (_event, { modulo, id, datos } = {}) => {
    try {
        const modelo = resolverModelo(modulo);

        if (id === undefined || id === null || id === '') {
            return { success: false, error: 'Falta el identificador del registro.' };
        }

        const valores = tomarCamposPermitidos(modelo, datos);
        const columnas = Object.keys(valores);

        if (columnas.length === 0) {
            return { success: false, error: 'No se recibieron datos para actualizar.' };
        }

        const asignaciones = columnas.map((c) => `${c} = ?`).join(', ');
        const sql = `UPDATE ${modelo.tabla} SET ${asignaciones} WHERE id = ?`;
        const resultado = await run(sql, [...columnas.map((c) => valores[c]), id]);

        return { success: true, cambios: resultado.cambios };
    } catch (error) {
        registrarError('crud:actualizar', error);
        return { success: false, error: error.message };
    }
});

/* ---------- DELETE · Eliminar ---------- */
ipcMain.handle('crud:eliminar', async (_event, { modulo, id } = {}) => {
    try {
        const modelo = resolverModelo(modulo);

        if (id === undefined || id === null || id === '') {
            return { success: false, error: 'Falta el identificador del registro.' };
        }

        const resultado = await run(`DELETE FROM ${modelo.tabla} WHERE id = ?`, [id]);
        return { success: true, cambios: resultado.cambios };
    } catch (error) {
        registrarError('crud:eliminar', error);
        return { success: false, error: error.message };
    }
});
