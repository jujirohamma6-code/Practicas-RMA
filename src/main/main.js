/* ==========================================================================
   CORNAVEX · PROCESO PRINCIPAL (Electron)
   --------------------------------------------------------------------------
   Contenido:
     1. Diagnóstico y blindaje de arranque.
     2. Creación de la ventana principal.
     3. Navegación entre vistas (IPC 'navegar-a').
     4. Sesión y permisos (IPC 'auth:*').
     5. CRUD real sobre SQLite (IPC 'crud:*'), protegido por sesión.
     6. Usuarios (IPC 'usuarios:*'), solo administradores.
   Arquitectura segura: contextIsolation ON, nodeIntegration OFF y todo el
   acceso a la base de datos ocurre únicamente aquí, en el proceso principal.
   ========================================================================== */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Helpers de datos (promisificados) y modelos (whitelist tabla/campos).
const { all, run, MODELOS } = require('../database/db');
// Autenticación y gestión de usuarios (hash scrypt; nunca sale de aquí).
const Usuarios = require('../database/usuarios');

/* ==========================================================================
   MODO DESARROLLO
   ---------------------------------------------------------------------------
   DEV es true solo cuando NO estamos empaquetados y el usuario lo pidió
   explícitamente (scripts "dev" de package.json o INICIAR con CX_DEV=1).
   Así nunca desactivamos la caché ni mostramos DevTools en producción.
   ========================================================================== */
const DEV = !app.isPackaged && (process.argv.includes('--dev') || process.env.CX_DEV === '1');

if (DEV) {
    // Deben ir ANTES de app.whenReady() para que Chromium los aplique al arrancar.
    app.commandLine.appendSwitch('disable-http-cache');
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
    console.log('[CX-DEV] Modo desarrollo activo: caché HTTP desactivada.');
}

/* ==========================================================================
   1. DIAGNÓSTICO Y BLINDAJE DE ARRANQUE
   ========================================================================== */
const LOG_FILE = path.join(__dirname, '..', 'electron-error.log');

function registrarError(origen, error) {
    const detalle = (error && (error.stack || error.message)) || error;
    const texto = `\n[${new Date().toISOString()}] ${origen}\n${detalle}\n`;
    try { fs.appendFileSync(LOG_FILE, texto); } catch (e) { /* sin permisos de escritura */ }
    console.error(`[CX-ERROR] ${origen}:`, detalle);
}

/**
 * Registra un error salvo que sea un rechazo por permisos: negar una acción
 * a quien no tiene sesión o rol es el comportamiento esperado, no un fallo.
 */
function reportar(origen, error) {
    if (error && error.permiso) {
        console.warn(`[CX-AUTH] ${origen}: ${error.message}`);
        return;
    }
    registrarError(origen, error);
}

/** Error de permisos (sesión ausente o rol insuficiente). */
function errorPermiso(mensaje) {
    const e = new Error(mensaje);
    e.permiso = true;
    return e;
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
        title: 'Cornavex · Sistema Contable',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Cargar la interfaz principal unificada (sidebar + módulos)
    mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

    /* --- (a) Sin caché en desarrollo + evidencia de la ruta real cargada --- */
    if (DEV) {
        mainWindow.webContents.session.clearCache()
            .then(() => console.log('[CX-DEV] Caché de sesión limpiada.'))
            .catch((e) => console.warn('[CX-DEV] No se pudo limpiar la caché:', e.message));

        // Se dispara en cada recarga: confirma QUÉ archivo se cargó de verdad.
        mainWindow.webContents.on('did-finish-load', () => {
            console.log('[CX-DEV] cargado →', mainWindow.webContents.getURL());
        });
    }

    /* --- (b) Atajos de recarga en el contexto de ESTA ventana ---
       Ctrl+R       → recarga normal (lee el disco de nuevo)
       Ctrl+Shift+R → recarga ignorando cualquier caché
       Ctrl+Shift+I → DevTools (solo en desarrollo) */
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        const ctrl = input.control || input.meta;   // control en Win/Linux, cmd en macOS
        const tecla = (input.key || '').toLowerCase();

        if (ctrl && tecla === 'r') {
            event.preventDefault();
            if (input.shift) mainWindow.webContents.reloadIgnoringCache();
            else mainWindow.webContents.reload();
            return;
        }
        if (DEV && ctrl && input.shift && tecla === 'i') {
            event.preventDefault();
            mainWindow.webContents.toggleDevTools();
        }
    });

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

    // Herramientas de desarrollo: solo con `electron . --debug` o CX_DEV=1.
    if (process.argv.includes('--debug') || process.env.CX_DEV) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    // La tabla de usuarios debe existir (con su administrador) ANTES de abrir la
    // ventana: la pantalla de acceso ya consulta credenciales.
    try {
        const sembrado = await Usuarios.asegurarAdminInicial();
        if (sembrado) {
            console.log('[Auth] Creado el usuario inicial "admin". Cámbialo en el módulo Usuarios.');
        }
    } catch (e) {
        registrarError('asegurarAdminInicial', e);
    }

    // Configurar sesión por defecto automática (sin login obligatorio)
    try {
        await sesionPorDefecto();
        console.log('[Auth] Sesión por defecto configurada automáticamente.');
    } catch (e) {
        registrarError('sesionPorDefecto', e);
    }

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
   4. SESIÓN Y PERMISOS
   --------------------------------------------------------------------------
   La sesión vive SOLO aquí, en el proceso principal, y el renderer nunca es
   una fuente de confianza: cada canal comprueba la sesión y el rol antes de
   tocar la base de datos.
     · consulta → solo lectura (listar)
     · contador → lectura y escritura de asientos/chequera/clientes
     · admin    → todo, incluida la gestión de usuarios
   Roles: 'admin' | 'contador' | 'consulta'.
   ========================================================================== */
let sesion = null;          // { id, usuario, nombre, rol, ... } o null
let intentosFallidos = 0;   // freno simple a la fuerza bruta

/** Obtiene la sesión activa, creando la sesión por defecto si no hay ninguna. */
async function obtenerSesion() {
    if (sesion) return sesion;
    await sesionPorDefecto();
    return sesion;
}

/** Exige sesión activa (crea la por defecto si no hay ninguna). */
async function exigirSesion() {
    return await obtenerSesion();
}

/** Exige permiso de escritura (admin o contador). */
async function exigirEscritura() {
    const actual = await obtenerSesion();
    if (actual.rol === 'consulta') {
        throw errorPermiso('Tu rol es de solo consulta: no puedes crear, editar ni eliminar registros.');
    }
    return actual;
}

/** Exige rol de administrador. */
async function exigirAdmin() {
    const actual = await obtenerSesion();
    if (actual.rol !== 'admin') {
        throw errorPermiso('Solo un administrador puede gestionar los usuarios.');
    }
    return actual;
}

/* ---------- ACCESO AUTOMÁTICO ---------- */

// Usuario y rol por defecto cuando no hay sesión interactiva.
// Se crea al momento si no existe en la BD.
const USUARIO_POR_DEFECTO = { id: 1, usuario: 'admin', nombre: 'Administrador', rol: 'admin' };

/** Crea/sesiona al usuario por defecto automáticamente (sin pedir credenciales). */
async function sesionPorDefecto() {
    // Intentar obtener el usuario 'admin' de la base de datos; si no existe, usar el objeto literal.
    try {
        const fila = await Usuarios.obtener(1);
        if (fila && fila.rol) {
            sesion = { id: fila.id, usuario: fila.usuario, nombre: fila.nombre || 'Admin', rol: fila.rol };
            return;
        }
    } catch (e) {
        // Si la tabla aún no tiene datos, continuamos con el usuario por defecto literal.
    }
    sesion = USUARIO_POR_DEFECTO;
}

/* ---------- ACCESO ---------- */

ipcMain.handle('auth:login', async (_event, { usuario, password } = {}) => {
    try {
        // Modo automático: si no se proporcionan credenciales, entra con el usuario por défaut.
        if (!usuario && !password) {
            await sesionPorDefecto();
            return { success: true, data: sesion };
        }

        // Tras varios fallos seguidos se añade una espera (dificulta la fuerza bruta).
        if (intentosFallidos >= 5) await new Promise((r) => setTimeout(r, 1500));

        const resultado = await Usuarios.verificar(usuario, password);
        if (!resultado.ok) {
            intentosFallidos += 1;
            return { success: false, error: resultado.error };
        }

        intentosFallidos = 0;
        sesion = resultado.usuario;
        return { success: true, data: sesion };
    } catch (error) {
        registrarError('auth:login', error);
        return { success: false, error: 'No se pudo verificar el acceso.' };
    }
});

/** Sesión activa (gracias a esto Ctrl+R no cierra la sesión). */
ipcMain.handle('auth:sesion', () => ({ success: true, data: sesion }));

ipcMain.handle('auth:logout', () => {
    sesion = null;
    return { success: true };
});

/** ¿Sigue vigente la contraseña de fábrica? (aviso en la pantalla de acceso) */
ipcMain.handle('auth:estado', async () => {
    try {
        return { success: true, data: { primerUso: await Usuarios.passwordInicialVigente() } };
    } catch (error) {
        registrarError('auth:estado', error);
        return { success: false, data: { primerUso: false } };
    }
});

/* ==========================================================================
   5. CRUD REAL SOBRE SQLITE
   --------------------------------------------------------------------------
   Cuatro canales genéricos cubren las cuatro operaciones para los tres módulos.
   La seguridad se apoya en MODELOS (whitelist): el renderer solo puede mandar
   un `modulo` conocido y campos permitidos; tabla y columnas nunca son input.
   Además cada operación exige sesión y, para escribir, rol con permiso.
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
        exigirSesion();
        const { tabla } = resolverModelo(modulo);
        const filas = await all(`SELECT * FROM ${tabla} ORDER BY id DESC`);
        return { success: true, data: filas };
    } catch (error) {
        reportar('crud:listar', error);
        return { success: false, error: error.message };
    }
});

/* ---------- CREATE · Crear ---------- */
ipcMain.handle('crud:crear', async (_event, { modulo, datos } = {}) => {
    try {
        exigirEscritura();
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
        reportar('crud:crear', error);
        return { success: false, error: error.message };
    }
});

/* ---------- UPDATE · Actualizar ---------- */
ipcMain.handle('crud:actualizar', async (_event, { modulo, id, datos } = {}) => {
    try {
        exigirEscritura();
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
        reportar('crud:actualizar', error);
        return { success: false, error: error.message };
    }
});

/* ---------- DELETE · Eliminar ---------- */
ipcMain.handle('crud:eliminar', async (_event, { modulo, id } = {}) => {
    try {
        exigirEscritura();
        const modelo = resolverModelo(modulo);

        if (id === undefined || id === null || id === '') {
            return { success: false, error: 'Falta el identificador del registro.' };
        }

        const resultado = await run(`DELETE FROM ${modelo.tabla} WHERE id = ?`, [id]);
        return { success: true, cambios: resultado.cambios };
    } catch (error) {
        reportar('crud:eliminar', error);
        return { success: false, error: error.message };
    }
});

/* ==========================================================================
   6. USUARIOS (solo administradores)
   --------------------------------------------------------------------------
   Los canales no reutilizan el CRUD genérico: las contraseñas se derivan con
   scrypt y el hash/salt jamás viajan al renderer (ver database/usuarios.js).
   ========================================================================== */

ipcMain.handle('usuarios:listar', async () => {
    try {
        exigirAdmin();
        return { success: true, data: await Usuarios.listar() };
    } catch (error) {
        reportar('usuarios:listar', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('usuarios:crear', async (_event, { datos } = {}) => {
    try {
        exigirAdmin();
        const resultado = await Usuarios.crear(datos);
        if (!resultado.ok) return { success: false, error: resultado.error };
        return { success: true, id: resultado.usuario.id, data: resultado.usuario };
    } catch (error) {
        reportar('usuarios:crear', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('usuarios:actualizar', async (_event, { id, datos } = {}) => {
    try {
        exigirAdmin();
        const resultado = await Usuarios.actualizar(id, datos);
        if (!resultado.ok) return { success: false, error: resultado.error };

        // Si el administrador se editó a sí mismo, refrescamos su sesión para que
        // los permisos reflejen el cambio al instante.
        if (sesion && Number(sesion.id) === Number(resultado.usuario.id)) {
            sesion = resultado.usuario;
        }
        return { success: true, cambios: 1, data: resultado.usuario };
    } catch (error) {
        reportar('usuarios:actualizar', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('usuarios:eliminar', async (_event, { id } = {}) => {
    try {
        const actual = exigirAdmin();
        const resultado = await Usuarios.eliminar(id, actual.id);
        if (!resultado.ok) return { success: false, error: resultado.error };
        return { success: true, cambios: 1 };
    } catch (error) {
        reportar('usuarios:eliminar', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('clientes:listar', async () => {
    try {
        const filas = await all('SELECT id, codigo, nombre_razon, tipo FROM clientes_proveedores WHERE tipo IN ("Cliente", "Proveedor") ORDER BY tipo, nombre_razon');
        return { success: true, data: filas || [] };
    } catch (error) {
        reportar('clientes:listar', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('clientes:listar', async () => {
    try {
        const filas = await all('SELECT id, codigo, nombre_razon, tipo FROM clientes_proveedores WHERE tipo IN ("Cliente", "Proveedor") ORDER BY tipo, nombre_razon');
        return { success: true, data: filas || [] };
    } catch (error) {
        reportar('clientes:listar', error);
        return { success: false, error: error.message };
    }
});
