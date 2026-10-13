const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./db');

// ==========================================
// DIAGNÓSTICO Y BLINDAJE DE ARRANQUE
// Registra cualquier error en un archivo en vez de permitir
// que la aplicación se cierre en silencio.
// ==========================================
const LOG_FILE = path.join(__dirname, 'electron-error.log');

function registrarError(origen, error) {
    const detalle = (error && (error.stack || error.message)) || error;
    const texto = `\n[${new Date().toISOString()}] ${origen}\n${detalle}\n`;
    try { fs.appendFileSync(LOG_FILE, texto); } catch (e) { /* sin permisos de escritura */ }
    console.error(`[MG-ERROR] ${origen}:`, detalle);
}

// Evita cierres inmediatos en Windows causados por la aceleración gráfica.
app.disableHardwareAcceleration();

// Guarda los datos de Electron en la carpeta local 'userdata' del proyecto
// para no depender de %AppData% (origen de errores "Acceso denegado").
try {
    app.setPath('userData', path.join(__dirname, 'userdata'));
} catch (e) {
    registrarError('app.setPath(userData)', e);
}

// No permitir que el proceso muera por excepciones no controladas.
process.on('uncaughtException', (error) => {
    registrarError('uncaughtException', error);
});
process.on('unhandledRejection', (reason) => {
    registrarError('unhandledRejection', reason);
});

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
    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Mostrar la ventana recién cuando el contenido terminó de cargar.
    mainWindow.once('ready-to-show', () => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
    });

    // Si el renderer se cae, registramos el motivo y recargamos en vez de
    // dejar la ventana muerta o cerrar la aplicación.
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

// ==========================================
// NAVEGACIÓN ENTRE PÁGINAS (usada por las vistas secundarias)
// ==========================================
ipcMain.on('navegar-a', (event, pagina) => {
    if (!pagina || typeof pagina !== 'string') return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    // Solo se permite navegar a archivos HTML del propio proyecto (evita rutas externas)
    const destino = path.join(__dirname, path.basename(pagina));
    win.loadFile(destino).catch((err) => console.error('[Nav] No se pudo navegar a', pagina, err.message));
});

// ==========================================
// MANEJADOR IPC CENTRALIZADO
// ==========================================
ipcMain.handle('consultar-datos', async (event, arg1, arg2, arg3) => {
    try {
        let modulo, accion, payload;

        if (arg1 && typeof arg1 === 'object') {
            if ('modulo' in arg1) {
                modulo = arg1.modulo;
                accion = arg1.accion;
                payload = arg1.payload;
            } else {
                payload = arg1;
            }
        }

        if (arg2 && typeof arg2 === 'object') {
            if ('modulo' in arg2 && !modulo) modulo = arg2.modulo;
            if ('accion' in arg2) accion = arg2.accion;
            if ('payload' in arg2) payload = arg2.payload;
            if (!payload && !('accion' in arg2) && !('modulo' in arg2)) payload = arg2;
        }

        if (arg3 && typeof arg3 === 'object') {
            if ('modulo' in arg3 && !modulo) modulo = arg3.modulo;
            if ('accion' in arg3) accion = arg3.accion;
            if ('payload' in arg3) payload = arg3.payload;
            if (!payload) payload = arg3;
        }

        if (typeof accion === 'object' && accion !== null) {
            if ('accion' in accion) accion = accion.accion;
            if ('action' in accion) accion = accion.action;
            if ('tipo' in accion) accion = accion.tipo;
            if ('operacion' in accion) accion = accion.operacion;
            if ('mode' in accion) accion = accion.mode;
        }

        if (typeof payload === 'object' && payload !== null) {
            if (!accion && 'accion' in payload) accion = payload.accion;
            if (!accion && 'action' in payload) accion = payload.action;
            if (!accion && 'tipo' in payload) accion = payload.tipo;
            if (!accion && 'operacion' in payload) accion = payload.operacion;
            if (!accion && 'mode' in payload) accion = payload.mode;
            if (!modulo && 'modulo' in payload) modulo = payload.modulo;
        }

        if (typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1)) {
            const keys = Object.keys(arg1);
            if (keys.length > 0 && !accion) {
                const key = keys[0];
                const val = arg1[key];
                if (typeof val === 'string' && ['consultar','obtener','listar','leer','crear','guardar','insertar','agregar'].includes(val.toLowerCase())) {
                    accion = val;
                }
            }
        }

        let accionStr = typeof accion === 'string' ? accion.toLowerCase() : '';
        if (!accionStr && typeof accion === 'object' && accion !== null) {
            const posibles = ['accion','action','tipo','operacion','mode','operation'];
            for (let k of posibles) {
                if (k in accion && typeof accion[k] === 'string') {
                    accionStr = accion[k].toLowerCase();
                    break;
                }
            }
        }

        if (!accionStr && typeof payload === 'object' && payload !== null) {
            const posibles = ['accion','action','tipo','operacion','mode'];
            for (let k of posibles) {
                if (k in payload && typeof payload[k] === 'string') {
                    const v = payload[k].toLowerCase();
                    if (['consultar','obtener','listar','leer','crear','guardar','insertar','agregar','registrar'].includes(v)) {
                        accionStr = v;
                        break;
                    }
                }
            }
        }

        if (!accionStr && typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1)) {
            for (let k of Object.keys(arg1)) {
                const v = arg1[k];
                if (typeof v === 'string') {
                    const vl = v.toLowerCase();
                    if (['consultar','obtener','listar','leer','crear','guardar','insertar','agregar','registrar'].includes(vl)) {
                        accionStr = vl;
                        break;
                    }
                }
            }
        }

        if (!accionStr) {
            accionStr = 'consultar';
        }

        return new Promise((resolve, reject) => {
            if (!modulo) {
                return resolve({ success: false, error: 'No se especificó el módulo' });
            }

            const modStr = typeof modulo === 'string' ? modulo.toLowerCase().trim() : '';
            const isContabilidad = modStr === 'contabilidad';
            const isChequera = modStr === 'chequera' || modStr === 'cuentas' || modStr === 'movimientos_chequera';
            const isClientes = modStr === 'clientes' || modStr === 'clientes_proveedores' || modStr === 'proveedores' || modStr === 'contactos';

            const esConsulta = accionStr === 'consultar' || accionStr === 'obtener' || accionStr === 'listar' || accionStr === 'leer';
            const esCrear = accionStr === 'crear' || accionStr === 'guardar' || accionStr === 'insertar' || accionStr === 'agregar' || accionStr === 'registrar';

            if (isContabilidad) {
                if (esConsulta || !esCrear) {
                    db.all(`SELECT * FROM asientos_contables ORDER BY id DESC`, [], (err, rows) => {
                        if (err) resolve({ success: false, error: err.message });
                        else resolve({ success: true, data: rows });
                    });
                } else if (esCrear) {
                    const { nro_asiento, fecha, libro, dcmto, cuenta, descripcion } = payload || {};
                    const query = `INSERT INTO asientos_contables (nro_asiento, fecha, libro, dcmto, cuenta, descripcion) VALUES (?, ?, ?, ?, ?, ?)`;
                    db.run(query, [
                        nro_asiento || Date.now().toString(),
                        fecha || new Date().toISOString().split('T')[0],
                        libro || '',
                        dcmto || '',
                        cuenta || '',
                        descripcion || ''
                    ], function(err) {
                        if (err) resolve({ success: false, error: err.message });
                        else resolve({ success: true, id: this.lastID });
                    });
                }
            } else if (isChequera) {
                if (esConsulta || !esCrear) {
                    db.all(`SELECT * FROM movimientos_chequera ORDER BY id DESC`, [], (err, rows) => {
                        if (err) resolve({ success: false, error: err.message });
                        else resolve({ success: true, data: rows });
                    });
                } else if (esCrear) {
                    const { nro_cheque, fecha, beneficiario, monto, estado } = payload || {};
                    const query = `INSERT INTO movimientos_chequera (nro_cheque, fecha, beneficiario, monto, estado) VALUES (?, ?, ?, ?, ?)`;
                    db.run(query, [
                        nro_cheque || `CHK-${Date.now()}`,
                        fecha || new Date().toISOString().split('T')[0],
                        beneficiario || '',
                        monto || '0.00',
                        estado || 'Pendiente'
                    ], function(err) {
                        if (err) resolve({ success: false, error: err.message });
                        else resolve({ success: true, id: this.lastID });
                    });
                }
            } else if (isClientes) {
                if (esConsulta || !esCrear) {
                    db.all(`SELECT * FROM clientes_proveedores ORDER BY id DESC`, [], (err, rows) => {
                        if (err) resolve({ success: false, error: err.message });
                        else resolve({ success: true, data: rows });
                    });
                } else if (esCrear) {
                    const { codigo, nombre_razon, tipo, telefono, estado } = payload || {};
                    const query = `INSERT INTO clientes_proveedores (codigo, nombre_razon, tipo, telefono, estado) VALUES (?, ?, ?, ?, ?)`;
                    db.run(query, [
                        codigo || `CLI-${Date.now()}`,
                        nombre_razon || '',
                        tipo || 'Cliente',
                        telefono || '',
                        estado || 'Activo'
                    ], function(err) {
                        if (err) resolve({ success: false, error: err.message });
                        else resolve({ success: true, id: this.lastID });
                    });
                }
            } else {
                db.all(`SELECT * FROM asientos_contables ORDER BY id DESC`, [], (err, rows) => {
                    if (err) resolve({ success: false, error: err.message });
                    else resolve({ success: true, data: rows });
                });
            }
        });
    } catch (error) {
        console.error('[DB] Error:', error);
        return { success: false, error: error.message };
    }
});
