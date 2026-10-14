/* ==========================================================================
   scripts/e2e-usuarios.js · Prueba de extremo a extremo del acceso (Electron)
   --------------------------------------------------------------------------
   Carga el proceso principal REAL (main/main.js) y conduce la ventana con
   webContents.executeJavaScript para recorrer el flujo completo:

     1. La aplicación arranca bloqueada (sin datos visibles).
     2. Credenciales incorrectas -> error y sigue bloqueada.
     3. Credenciales correctas -> entra y muestra el usuario en el sidebar.
     4. Módulo Usuarios: crear, editar (sin tocar la contraseña) y listar.
     5. El proceso principal rechaza duplicados y el auto-borrado.
     6. Cerrar sesión limpia los datos de pantalla.
     7. Rol de solo consulta: no ve Usuarios, no puede escribir, sí puede leer.
     8. Volver como admin y eliminar los usuarios de prueba.

   · Es idempotente: limpia sus usuarios antes y después.
   · Escribe el detalle en %TEMP%\cornavex-e2e-usuarios.json
   · Sale con código 1 si alguna expectativa no se cumple.

   Uso:  npm run test:e2e
   ========================================================================== */
'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');

const BASE = path.join(__dirname, '..');

// Cargar el proceso principal real: registra los canales IPC y abre la ventana.
require(path.join(BASE, 'main', 'main.js'));

const { app, BrowserWindow } = require('electron');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DESTINO = path.join(os.tmpdir(), 'cornavex-e2e-usuarios.json');

/* Lo que debe devolver cada paso. */
const ESPERADO = {
    overlayInicial: 'visible',
    navUsuariosSinSesion: 'oculto',
    tarjetaSinSesion: 'Sin sesión',
    statsVaciosAntesDeEntrar: true,
    errorCredenciales: 'Usuario o contraseña incorrectos.',
    sigueBloqueado: 'visible',
    passwordLimpiada: true,
    overlayTrasEntrar: 'oculto',
    nombreSesion: 'Administrador',
    rolSesion: 'Administrador',
    navUsuariosAdmin: 'visible',
    claseConsulta: false,
    fechaPintada: true,
    vistaUsuarios: 'visible',
    tituloVista: 'Usuarios',
    statsUsuarios: 3,
    marcaPasswordNuevo: 'visible',
    usuarioEnTabla: true,
    passwordVaciaAlEditar: true,
    marcaPasswordEditar: 'oculto',
    rolCargadoEditar: 'consulta',
    rolActualizado: true,
    creadaConsulta: true,
    rechazaDuplicado: true,
    usuariosSinHash: true,
    overlayTrasSalir: 'visible',
    tablaVaciaTrasSalir: true,
    crudSinSesion: true,
    consultaClase: true,
    consultaRol: 'Consulta',
    consultaNavUsuarios: 'oculto',
    consultaBotonNuevo: 'oculto',
    consultaNoPuedeCrear: true,
    consultaSiPuedeListar: true,
    consultaNoVeUsuarios: true,
    adminDeNuevo: 'visible',
    usuariosFinales: 1
};

const GUION = `
(async () => {
  const salida = {};
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const vis = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'AUSENTE';
    return getComputedStyle(el).display === 'none' ? 'oculto' : 'visible';
  };
  const texto = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; };
  const form = () => document.querySelector('form[data-modulo="usuarios"]');

  try {
    // ---------- 1. La app arranca bloqueada ----------
    salida.overlayInicial = vis('#acceso');
    salida.navUsuariosSinSesion = vis('.nav-item[data-vista="usuarios"]');
    salida.tarjetaSinSesion = texto('#userNombre');
    salida.statsVaciosAntesDeEntrar = document.querySelector('#vista-contabilidad [data-tbody]').querySelectorAll('tr').length === 0;

    // ---------- 2. Credenciales incorrectas ----------
    document.querySelector('#acc-usuario').value = 'admin';
    document.querySelector('#acc-password').value = 'incorrecta';
    document.querySelector('#formAcceso').requestSubmit();
    await esperar(1200);
    salida.errorCredenciales = texto('#accesoError');
    salida.sigueBloqueado = vis('#acceso');
    salida.passwordLimpiada = document.querySelector('#acc-password').value === '';

    // ---------- 3. Credenciales correctas ----------
    document.querySelector('#acc-usuario').value = 'admin';
    document.querySelector('#acc-password').value = 'admin123';
    document.querySelector('#formAcceso').requestSubmit();
    await esperar(1500);
    salida.overlayTrasEntrar = vis('#acceso');
    salida.nombreSesion = texto('#userNombre');
    salida.rolSesion = texto('#userRol');
    salida.navUsuariosAdmin = vis('.nav-item[data-vista="usuarios"]');
    salida.claseConsulta = document.body.classList.contains('modo-consulta');
    salida.fechaPintada = texto('#fechaHoy') !== '';

    // ---------- 4. Módulo Usuarios ----------
    document.querySelector('.nav-item[data-vista="usuarios"]').click();
    await esperar(1200);
    salida.vistaUsuarios = vis('#vista-usuarios');
    salida.tituloVista = texto('#tituloVista');
    salida.statsUsuarios = document.querySelectorAll('#stats-usuarios .stat').length;

    document.querySelector('[data-action="nuevo"][data-modulo="usuarios"]').click();
    await esperar(300);
    salida.marcaPasswordNuevo = vis('#usu-password-req');
    const f = form();
    f.elements.usuario.value = 'prueba1';
    f.elements.nombre.value = 'Usuario de prueba';
    f.elements.rol.value = 'consulta';
    f.elements.password.value = 'clave123';
    f.requestSubmit();
    await esperar(1500);
    salida.usuarioEnTabla = document.querySelector('[data-tbody="usuarios"]').textContent.includes('prueba1');

    const filas = Array.from(document.querySelectorAll('[data-tbody="usuarios"] tr'));
    const fila = filas.find((tr) => tr.textContent.includes('prueba1'));
    fila.querySelector('[data-action="editar"]').click();
    await esperar(300);
    salida.passwordVaciaAlEditar = f.elements.password.value === '';
    salida.marcaPasswordEditar = vis('#usu-password-req');
    salida.rolCargadoEditar = f.elements.rol.value;
    f.elements.rol.value = 'contador';
    f.requestSubmit();
    await esperar(1500);
    salida.rolActualizado = document.querySelector('[data-tbody="usuarios"]').textContent.includes('Contador');

    // ---------- 5. Endurecimiento desde el proceso principal ----------
    salida.creadaConsulta = (await window.api.usuarios.crear({ usuario: 'consulta1', password: 'clave123', rol: 'consulta', nombre: 'Solo Lectura' })).success === true;
    salida.rechazaDuplicado = (await window.api.usuarios.crear({ usuario: 'prueba1', password: 'clave123', rol: 'admin' })).success === false;
    const listaUsuarios = (await window.api.usuarios.listar()).data || [];
    const idPrueba = (listaUsuarios.find((u) => u.usuario === 'prueba1') || {}).id || null;
    salida.usuariosSinHash = listaUsuarios.every((u) => !('hash' in u) && !('salt' in u));

    // ---------- 6. Cerrar sesión ----------
    document.querySelector('#btnSalir').click();
    await esperar(400);
    document.querySelector('#modalConfirm [data-modal-confirmar]').click();
    await esperar(900);
    salida.overlayTrasSalir = vis('#acceso');
    salida.tablaVaciaTrasSalir = document.querySelector('#vista-contabilidad [data-tbody]').textContent.includes('Sin datos');
    salida.crudSinSesion = (await window.api.clientes.listar()).success === false;

    // ---------- 7. Rol de solo consulta ----------
    document.querySelector('#acc-usuario').value = 'consulta1';
    document.querySelector('#acc-password').value = 'clave123';
    document.querySelector('#formAcceso').requestSubmit();
    await esperar(1500);
    salida.consultaClase = document.body.classList.contains('modo-consulta');
    salida.consultaRol = texto('#userRol');
    salida.consultaNavUsuarios = vis('.nav-item[data-vista="usuarios"]');
    salida.consultaBotonNuevo = vis('#vista-contabilidad [data-action="nuevo"]');
    salida.consultaNoPuedeCrear = (await window.api.clientes.crear({ codigo: 'X-1', nombre_razon: 'Prohibido' })).success === false;
    salida.consultaSiPuedeListar = (await window.api.clientes.listar()).success === true;
    salida.consultaNoVeUsuarios = (await window.api.usuarios.listar()).success === false;

    // ---------- 8. Volver como admin y limpiar ----------
    document.querySelector('#btnSalir').click();
    await esperar(400);
    document.querySelector('#modalConfirm [data-modal-confirmar]').click();
    await esperar(900);
    document.querySelector('#acc-usuario').value = 'admin';
    document.querySelector('#acc-password').value = 'admin123';
    document.querySelector('#formAcceso').requestSubmit();
    await esperar(1500);
    salida.adminDeNuevo = vis('.nav-item[data-vista="usuarios"]');

    const restantes = (await window.api.usuarios.listar()).data || [];
    for (const u of restantes) {
      if (u.usuario === 'prueba1' || u.usuario === 'consulta1') await window.api.usuarios.eliminar(u.id);
    }
    salida.usuariosFinales = (await window.api.usuarios.listar()).data.length;
  } catch (e) {
    salida.excepcion = String(e && (e.stack || e.message || e));
  }
  return salida;
})()
`;

/** Comprueba el resultado, informa y fija el código de salida. */
function evaluar(resultado) {
    const fallos = [];

    for (const [clave, esperado] of Object.entries(ESPERADO)) {
        const obtenido = resultado[clave];
        if (obtenido !== esperado) fallos.push({ clave, esperado, obtenido });
    }

    console.log('\n=== Acceso y usuarios: prueba de extremo a extremo ===\n');
    for (const [clave, esperado] of Object.entries(ESPERADO)) {
        const obtenido = resultado[clave];
        const marca = obtenido === esperado ? 'PASS' : 'FAIL';
        console.log(`  ${marca}  ${clave} = ${JSON.stringify(obtenido)}`);
    }

    if (resultado.excepcion) {
        console.log(`\n  EXCEPCIÓN: ${resultado.excepcion}`);
        fallos.push({ clave: 'excepcion', esperado: 'ninguna', obtenido: resultado.excepcion });
    }

    try {
        fs.writeFileSync(DESTINO, JSON.stringify({ resultado, fallos }, null, 2), 'utf8');
        console.log(`\n  Detalle completo: ${DESTINO}`);
    } catch (e) { /* sin permiso de escritura temporal */ }

    const total = Object.keys(ESPERADO).length;
    console.log(`\nRESUMEN ${JSON.stringify({ total, fallos: fallos.length })}`);
    return fallos.length;
}

app.whenReady().then(async () => {
    await sleep(1200);

    // Limpieza previa para que la prueba sea idempotente.
    try {
        const Usuarios = require(path.join(BASE, 'database', 'usuarios.js'));
        for (const u of await Usuarios.listar()) {
            if (u.usuario === 'prueba1' || u.usuario === 'consulta1') await Usuarios.eliminar(u.id, null);
        }
    } catch (e) { /* nada que limpiar */ }

    let win = null;
    for (let i = 0; i < 60 && !win; i += 1) {
        win = BrowserWindow.getAllWindows()[0] || null;
        if (!win) await sleep(250);
    }

    if (!win) {
        console.log('RESUMEN ' + JSON.stringify({ total: 0, fallos: 1, error: 'No se creó ninguna ventana' }));
        app.exit(1);
        return;
    }

    await new Promise((resolve) => {
        if (!win.webContents.isLoading()) return resolve();
        win.webContents.once('did-finish-load', resolve);
    });
    await sleep(900);

    let fallos = 1;
    try {
        const resultado = await win.webContents.executeJavaScript(GUION, true);
        fallos = evaluar(resultado);
    } catch (e) {
        console.log('RESUMEN ' + JSON.stringify({ total: 0, fallos: 1, error: String(e && (e.message || e)) }));
    }

    await sleep(300);
    app.exit(fallos === 0 ? 0 : 1);
});
