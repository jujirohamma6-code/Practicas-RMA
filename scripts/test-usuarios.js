/* ==========================================================================
   scripts/test-usuarios.js · Pruebas de la capa de usuarios (sin Electron)
   --------------------------------------------------------------------------
   Verifica hashing, autenticación y CRUD de usuarios trabajando directamente
   sobre database/usuarios.js (la misma lógica que usa el proceso principal).

   · Se ejecuta con Node, sin abrir ninguna ventana.
   · Es idempotente: crea sus propios usuarios y los borra al terminar.
   · Sale con código 1 si alguna comprobación falla.

   Uso:  npm run test:usuarios
   ========================================================================== */
'use strict';

const path = require('path');
const U = require(path.join(__dirname, '..', 'database', 'usuarios.js'));

const resultados = [];

function check(nombre, condicion, extra) {
    resultados.push({ nombre, ok: !!condicion });
    const marca = condicion ? 'PASS' : 'FAIL';
    const detalle = extra !== undefined ? '  -> ' + JSON.stringify(extra) : '';
    console.log(`  ${marca}  ${nombre}${detalle}`);
}

(async () => {
    try {
        console.log('\n=== Usuarios: capa de datos y autenticación ===\n');

        // Limpieza de restos de ejecuciones anteriores.
        for (const u of await U.listar()) {
            if (u.usuario === 'tester') await U.eliminar(u.id, null);
        }

        /* ---------- Siembra y primer uso ---------- */
        const sembrado1 = await U.asegurarAdminInicial();
        const sembrado2 = await U.asegurarAdminInicial();
        check('asegurarAdminInicial siembra solo la primera vez', sembrado1 === true && sembrado2 === false);
        check('passwordInicialVigente() detecta la clave de fábrica', await U.passwordInicialVigente() === true);

        /* ---------- Autenticación ---------- */
        const ok = await U.verificar('admin', 'admin123');
        check('login correcto', ok.ok === true);
        check('el usuario devuelto NO trae hash ni salt', ok.ok && !('hash' in ok.usuario) && !('salt' in ok.usuario));
        check('el usuario se normaliza a minúsculas (ADMIN)', (await U.verificar('ADMIN', 'admin123')).ok === true);
        check('contraseña incorrecta rechazada', (await U.verificar('admin', 'mala')).ok === false);
        check('usuario inexistente rechazado', (await U.verificar('nadie', 'x')).ok === false);
        check('mismo mensaje para usuario y contraseña erróneos',
            (await U.verificar('nadie', 'x')).error === (await U.verificar('admin', 'mala')).error);

        /* ---------- Validaciones de alta ---------- */
        check('rechaza usuario demasiado corto', (await U.crear({ usuario: 'ab', password: '123456', rol: 'admin' })).ok === false);
        check('rechaza contraseña corta', (await U.crear({ usuario: 'tester', password: '123', rol: 'admin' })).ok === false);
        check('rechaza rol inválido', (await U.crear({ usuario: 'tester', password: '123456', rol: 'root' })).ok === false);

        /* ---------- CRUD ---------- */
        const nuevo = await U.crear({ usuario: 'tester', password: 'secreta1', rol: 'consulta', nombre: 'Usuario Test' });
        check('crea un usuario válido', nuevo.ok === true, nuevo.error);
        const id = nuevo.usuario && nuevo.usuario.id;

        check('rechaza usuario duplicado (ignorando mayúsculas)', (await U.crear({ usuario: 'TESTER', password: 'otra1234', rol: 'admin' })).ok === false);

        const lista = await U.listar();
        check('listar() incluye al usuario creado', lista.some((u) => u.usuario === 'tester'));
        check('listar() nunca expone hash ni salt', lista.every((u) => !('hash' in u) && !('salt' in u)));

        const loginNuevo = await U.verificar('tester', 'secreta1');
        check('el usuario nuevo puede entrar', loginNuevo.ok === true);
        check('al entrar se registra ultimo_acceso', !!loginNuevo.usuario.ultimo_acceso);

        const cambioRol = await U.actualizar(id, { rol: 'contador', nombre: 'Usuario Test 2' });
        check('actualiza rol y nombre', cambioRol.ok === true && cambioRol.usuario.rol === 'contador', cambioRol.error);
        check('editar sin contraseña conserva la contraseña', (await U.verificar('tester', 'secreta1')).ok === true);

        check('cambia la contraseña', (await U.actualizar(id, { password: 'nuevaclave9' })).ok === true);
        check('la contraseña anterior deja de servir', (await U.verificar('tester', 'secreta1')).ok === false);

        const desactivar = await U.actualizar(id, { activo: '0' });
        check('desactiva el usuario', desactivar.ok === true && desactivar.usuario.activo === false);
        check('un usuario desactivado no puede entrar', (await U.verificar('tester', 'nuevaclave9')).ok === false);

        /* ---------- Protección del último administrador ---------- */
        const admin = (await U.listar()).find((u) => u.usuario === 'admin');
        check('no se puede degradar al último administrador', (await U.actualizar(admin.id, { rol: 'consulta' })).ok === false);
        check('no se puede borrar al último administrador', (await U.eliminar(admin.id, null)).ok === false);
        check('no se puede borrar el propio usuario', (await U.eliminar(admin.id, admin.id)).ok === false);

        /* ---------- Limpieza ---------- */
        check('elimina el usuario de prueba', (await U.eliminar(id, admin.id)).ok === true);
        check('la tabla queda solo con el administrador', (await U.listar()).length === 1);

        const fallos = resultados.filter((r) => !r.ok).length;
        console.log(`\nRESUMEN ${JSON.stringify({ total: resultados.length, fallos })}`);
        process.exit(fallos === 0 ? 0 : 1);
    } catch (e) {
        console.error('\nERROR INESPERADO:', e);
        process.exit(2);
    }
})();
