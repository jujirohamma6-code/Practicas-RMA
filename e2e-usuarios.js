/* ==========================================================================
   PRUEBA E2E (temporal) · carga el proceso principal REAL y conduce la ventana
   Ejecutar:  node_modules/electron/dist/electron.exe e2e-usuarios.js
   ========================================================================== */
'use strict';

const path = require('path');
const BASE = __dirname;

// Cargar el proceso principal real: registra todos los canales IPC y abre la ventana.
require(path.join(BASE, 'main', 'main.js'));

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DESTINO = path.join(BASE, 'e2e-resultado.json');

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

  try {
    // ---------- 1. Estado inicial: la app debe estar bloqueada ----------
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
    salida.avatar = texto('#userAvatar');
    salida.navUsuariosAdmin = vis('.nav-item[data-vista="usuarios"]');
    salida.claseConsulta = document.body.classList.contains('modo-consulta');
    salida.fechaPintada = texto('#fechaHoy') !== '';

    // ---------- 4. Módulo Usuarios ----------
    document.querySelector('.nav-item[data-vista="usuarios"]').click();
    await esperar(1200);
    salida.vistaUsuarios = vis('#vista-usuarios');
    salida.tituloVista = texto('#tituloVista');
    salida.statsUsuarios = document.querySelectorAll('#stats-usuarios .stat').length;
    salida.filasUsuarios = document.querySelectorAll('[data-tbody="usuarios"] tr').length;
    salida.marcaPasswordNuevo = vis('#usu-password-req');

    // Crear un usuario por el formulario real
    document.querySelector('[data-action="nuevo"][data-modulo="usuarios"]').click();
    await esperar(300);
    const f = document.querySelector('form[data-modulo="usuarios"]');
    f.elements.usuario.value = 'prueba1';
    f.elements.nombre.value = 'Usuario de prueba';
    f.elements.rol.value = 'consulta';
    f.elements.password.value = 'clave123';
    f.requestSubmit();
    await esperar(1500);
    salida.filasTrasCrear = document.querySelectorAll('[data-tbody="usuarios"] tr').length;
    salida.usuarioEnTabla = document.querySelector('[data-tbody="usuarios"]').textContent.includes('prueba1');

    // Editar: cambiar el rol a contador sin tocar la contraseña
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
    const creadaConsulta = await window.api.usuarios.crear({ usuario: 'consulta1', password: 'clave123', rol: 'consulta', nombre: 'Solo Lectura' });
    salida.creadaConsulta = creadaConsulta.success === true;
    const duplicado = await window.api.usuarios.crear({ usuario: 'prueba1', password: 'clave123', rol: 'admin' });
    salida.rechazaDuplicado = duplicado.success === false;
    const idPrueba = await (async () => {
      const r = await window.api.usuarios.listar();
      const u = (r.data || []).find((x) => x.usuario === 'prueba1');
      return u ? u.id : null;
    })();
    salida.idPrueba = idPrueba;
    salida.usuariosSinHash = (await window.api.usuarios.listar()).data.every((u) => !('hash' in u) && !('salt' in u));
    salida.autoBorrado = await window.api.usuarios.eliminar(1);

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
    const intento = await window.api.clientes.crear({ codigo: 'X-1', nombre_razon: 'Prohibido' });
    salida.consultaNoPuedeCrear = intento.success === false;
    salida.mensajeRechazo = intento.error || null;
    salida.consultaSiPuedeListar = (await window.api.clientes.listar()).success === true;
    salida.consultaNoVeUsuarios = (await window.api.usuarios.listar()).success === false;

    // ---------- 8. Volver a entrar como admin y limpiar ----------
    document.querySelector('#btnSalir').click();
    await esperar(400);
    document.querySelector('#modalConfirm [data-modal-confirmar]').click();
    await esperar(900);
    document.querySelector('#acc-usuario').value = 'admin';
    document.querySelector('#acc-password').value = 'admin123';
    document.querySelector('#formAcceso').requestSubmit();
    await esperar(1500);
    salida.adminDeNuevo = vis('.nav-item[data-vista="usuarios"]');
    salida.limpiado = await window.api.usuarios.eliminar(idPrueba);
    salida.limpiadoConsulta = (await window.api.usuarios.listar()).data.find((u) => u.usuario === 'consulta1')
      ? await window.api.usuarios.eliminar((await window.api.usuarios.listar()).data.find((u) => u.usuario === 'consulta1').id)
      : { success: true };
    salida.usuariosFinales = (await window.api.usuarios.listar()).data.length;
  } catch (e) {
    salida.excepcion = String(e && (e.stack || e.message || e));
  }
  return salida;
})()
`;

app.whenReady().then(async () => {
    await sleep(1500);

    // Limpieza previa: la prueba debe ser idempotente.
    try {
        const Usuarios = require(path.join(BASE, 'database', 'usuarios.js'));
        const previos = await Usuarios.listar();
        for (const u of previos) {
            if (u.usuario === 'prueba1' || u.usuario === 'consulta1') await Usuarios.eliminar(u.id, null);
        }
    } catch (e) { /* nada que limpiar */ }

    let win = null;
    for (let i = 0; i < 60 && !win; i += 1) {
        win = BrowserWindow.getAllWindows()[0] || null;
        if (!win) await sleep(250);
    }

    if (!win) {
        console.log('RESULTADO ' + JSON.stringify({ error: 'No se creó ninguna ventana' }));
        app.quit();
        return;
    }

    await new Promise((resolve) => {
        if (!win.webContents.isLoading()) return resolve();
        win.webContents.once('did-finish-load', resolve);
    });
    await sleep(900);

    try {
        const resultado = await win.webContents.executeJavaScript(GUION, true);
        fs.writeFileSync(DESTINO, JSON.stringify(resultado, null, 2), 'utf8');
        console.log('RESULTADO ' + JSON.stringify(resultado, null, 2));
    } catch (e) {
        const error = { error: String(e && (e.stack || e.message || e)) };
        fs.writeFileSync(DESTINO, JSON.stringify(error, null, 2), 'utf8');
        console.log('RESULTADO ' + JSON.stringify(error));
    }

    await sleep(300);
    app.exit(0);
});
