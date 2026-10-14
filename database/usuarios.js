/* ==========================================================================
   CORNAVEX · USUARIOS Y AUTENTICACIÓN
   --------------------------------------------------------------------------
   Responsabilidades de este archivo:
     1. Guardar las contraseñas con scrypt (salt aleatorio por usuario).
     2. Verificar credenciales sin exponer nunca el hash al renderer.
     3. CRUD de usuarios para el módulo "Usuarios" (solo administradores).

   Regla de oro: `hash` y `salt` NUNCA salen de este archivo. Todas las
   funciones devuelven un usuario "público" usando publico().
   ========================================================================== */
'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const { all, get, run, listo } = require('./db');

const scrypt = promisify(crypto.scrypt);

const ROLES = ['admin', 'contador', 'consulta'];
const ROLES_ETIQUETA = {
    admin: 'Administrador',
    contador: 'Contador',
    consulta: 'Consulta'
};
const LARGO_CLAVE = 64;        // longitud del hash derivado
const MIN_PASSWORD = 6;        // longitud mínima de la contraseña
const CAMPOS = 'id, usuario, nombre, rol, activo, ultimo_acceso, creado';

/* Credenciales del primer arranque (solo si la tabla está vacía). */
const ADMIN_INICIAL = { usuario: 'admin', password: 'admin123', nombre: 'Administrador', rol: 'admin' };

/* ==========================================================================
   1. UTILIDADES DE CONTRASEÑA
   ========================================================================== */

/** Deriva la clave con scrypt y devuelve el hash en hexadecimal. */
function derivar(password, salt) {
    return scrypt(String(password), salt, LARGO_CLAVE).then((clave) => clave.toString('hex'));
}

/** Comparación en tiempo constante (evita filtrar información por tiempos). */
function iguales(a, b) {
    const ba = Buffer.from(String(a || ''), 'hex');
    const bb = Buffer.from(String(b || ''), 'hex');
    return ba.length > 0 && ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Convierte una fila de la base en un usuario apto para la interfaz. */
function publico(fila) {
    if (!fila) return null;
    return {
        id: fila.id,
        usuario: fila.usuario,
        nombre: fila.nombre || '',
        rol: fila.rol,
        activo: String(fila.activo) === '1' || fila.activo === true,
        ultimo_acceso: fila.ultimo_acceso || '',
        creado: fila.creado || ''
    };
}

/** Los usuarios se guardan y comparan siempre en minúsculas. */
function normalizarUsuario(valor) {
    return String(valor ?? '').trim().toLowerCase();
}

/** Valida los datos de alta/edición. Devuelve el mensaje de error o null. */
function validar({ usuario, password, rol }, { exigirPassword }) {
    if (!/^[a-z0-9._-]{3,20}$/.test(usuario)) {
        return 'El usuario debe tener entre 3 y 20 caracteres (letras, números, punto, guion o guion bajo).';
    }
    if (!ROLES.includes(rol)) return 'El rol seleccionado no es válido.';
    if (exigirPassword && String(password || '').length < MIN_PASSWORD) {
        return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
    }
    if (!exigirPassword && password && String(password).length < MIN_PASSWORD) {
        return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
    }
    return null;
}

/* ==========================================================================
   2. CONSULTAS
   ========================================================================== */

async function listar() {
    await listo;
    const filas = await all(`SELECT ${CAMPOS} FROM usuarios ORDER BY rol, usuario`);
    return filas.map(publico);
}

async function obtener(id) {
    await listo;
    const fila = await get(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`, [id]);
    return publico(fila);
}

/** Administradores activos, opcionalmente excluyendo uno (para editar/eliminar). */
async function contarAdmins(excluirId = null) {
    await listo;
    const fila = await get(
        `SELECT COUNT(*) AS total FROM usuarios WHERE rol = 'admin' AND activo = 1${excluirId ? ' AND id <> ?' : ''}`,
        excluirId ? [excluirId] : []
    );
    return fila ? Number(fila.total) : 0;
}

/* ==========================================================================
   3. AUTENTICACIÓN
   ========================================================================== */

/** Comprueba usuario + contraseña. Devuelve { ok, usuario } o { ok:false, error }. */
async function verificar(usuario, password) {
    await listo;
    const generico = 'Usuario o contraseña incorrectos.';
    const fila = await get('SELECT * FROM usuarios WHERE usuario = ?', [normalizarUsuario(usuario)]);
    if (!fila) return { ok: false, error: generico };

    const hash = await derivar(password, fila.salt);
    if (!iguales(hash, fila.hash)) return { ok: false, error: generico };
    if (String(fila.activo) !== '1') {
        return { ok: false, error: 'El usuario está desactivado. Contacta al administrador.' };
    }

    const ahora = new Date().toISOString();
    await run('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?', [ahora, fila.id]);
    return { ok: true, usuario: publico({ ...fila, ultimo_acceso: ahora }) };
}

/** ¿El administrador inicial sigue con la contraseña de fábrica? (aviso en el acceso) */
async function passwordInicialVigente() {
    await listo;
    const fila = await get('SELECT * FROM usuarios WHERE usuario = ?', [ADMIN_INICIAL.usuario]);
    if (!fila) return false;
    const hash = await derivar(ADMIN_INICIAL.password, fila.salt);
    return iguales(hash, fila.hash);
}

/* ==========================================================================
   4. GESTIÓN DE USUARIOS (solo administradores)
   ========================================================================== */

async function crear(datos = {}) {
    await listo;
    const usuario = normalizarUsuario(datos.usuario);
    const rol = String(datos.rol || 'consulta').toLowerCase();
    const password = String(datos.password || '');
    const nombre = String(datos.nombre || '').trim();

    const error = validar({ usuario, password, rol }, { exigirPassword: true });
    if (error) return { ok: false, error };

    const existe = await get('SELECT id FROM usuarios WHERE usuario = ?', [usuario]);
    if (existe) return { ok: false, error: `Ya existe el usuario «${usuario}».` };

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await derivar(password, salt);
    const resultado = await run(
        'INSERT INTO usuarios (usuario, nombre, rol, hash, salt, activo, creado) VALUES (?, ?, ?, ?, ?, 1, ?)',
        [usuario, nombre, rol, hash, salt, new Date().toISOString()]
    );
    return { ok: true, usuario: await obtener(resultado.id) };
}

/**
 * Actualiza un usuario. La contraseña solo cambia si viene con valor:
 * el formulario la deja vacía para conservar la actual.
 */
async function actualizar(id, datos = {}) {
    await listo;
    const actual = await get('SELECT * FROM usuarios WHERE id = ?', [id]);
    if (!actual) return { ok: false, error: 'El usuario no existe.' };

    const usuario = datos.usuario !== undefined ? normalizarUsuario(datos.usuario) : actual.usuario;
    const rol = String(datos.rol ?? actual.rol).toLowerCase();
    const nombre = datos.nombre !== undefined ? String(datos.nombre).trim() : actual.nombre;
    const activo = datos.activo !== undefined
        ? (String(datos.activo) === '1' || datos.activo === true ? 1 : 0)
        : actual.activo;
    const password = String(datos.password || '');

    const error = validar({ usuario, password, rol }, { exigirPassword: false });
    if (error) return { ok: false, error };

    // Nunca dejar la aplicación sin administrador activo.
    const pierdeAdminActivo = (actual.rol === 'admin' && String(actual.activo) === '1') && (rol !== 'admin' || activo !== 1);
    if (pierdeAdminActivo && (await contarAdmins(actual.id)) === 0) {
        return { ok: false, error: 'Debe existir al menos un administrador activo.' };
    }

    const duplicado = await get('SELECT id FROM usuarios WHERE usuario = ? AND id <> ?', [usuario, id]);
    if (duplicado) return { ok: false, error: `Ya existe el usuario «${usuario}».` };

    const partes = ['usuario = ?', 'nombre = ?', 'rol = ?', 'activo = ?'];
    const valores = [usuario, nombre, rol, activo];

    if (password) {
        const salt = crypto.randomBytes(16).toString('hex');
        partes.push('hash = ?', 'salt = ?');
        valores.push(await derivar(password, salt), salt);
    }

    await run(`UPDATE usuarios SET ${partes.join(', ')} WHERE id = ?`, [...valores, id]);
    return { ok: true, usuario: await obtener(id) };
}

/** Elimina un usuario. `sesionId` evita que alguien se borre a sí mismo. */
async function eliminar(id, sesionId = null) {
    await listo;
    const actual = await get('SELECT * FROM usuarios WHERE id = ?', [id]);
    if (!actual) return { ok: false, error: 'El usuario no existe.' };

    if (sesionId !== null && Number(sesionId) === Number(id)) {
        return { ok: false, error: 'No puedes eliminar tu propio usuario.' };
    }
    if (actual.rol === 'admin' && String(actual.activo) === '1' && (await contarAdmins(actual.id)) === 0) {
        return { ok: false, error: 'Debe existir al menos un administrador activo.' };
    }

    await run('DELETE FROM usuarios WHERE id = ?', [id]);
    return { ok: true };
}

/** Crea el administrador inicial si la tabla está vacía. Devuelve true si sembró. */
async function asegurarAdminInicial() {
    await listo;
    const fila = await get('SELECT COUNT(*) AS total FROM usuarios');
    if (fila && Number(fila.total) > 0) return false;

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await derivar(ADMIN_INICIAL.password, salt);
    await run(
        'INSERT INTO usuarios (usuario, nombre, rol, hash, salt, activo, creado) VALUES (?, ?, ?, ?, ?, 1, ?)',
        [ADMIN_INICIAL.usuario, ADMIN_INICIAL.nombre, ADMIN_INICIAL.rol, hash, salt, new Date().toISOString()]
    );
    return true;
}

module.exports = {
    ROLES, ROLES_ETIQUETA, ADMIN_INICIAL, MIN_PASSWORD,
    listar, obtener, crear, actualizar, eliminar, contarAdmins,
    verificar, asegurarAdminInicial, passwordInicialVigente, publico
};
