/* ==========================================================================
   MÓNICA GESTIÓN · PRELOAD
   --------------------------------------------------------------------------
   Puente seguro entre el renderer y el proceso principal (contextBridge).
   Se expone `window.api` con:
     - api.contabilidad / api.chequera / api.clientes  → CRUD por módulo
     - alias explícitos (obtenerClientes, guardarCliente, ...)
     - compatibilidad con las vistas antiguas (consultarDatos / guardarRegistro)
     - navegación entre vistas (navegarA)
   El renderer nunca accede a Node ni a SQLite directamente.
   ========================================================================== */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/* Canales IPC reales del Bloque 2 (CRUD) */
const CANAL = {
    listar: 'crud:listar',
    crear: 'crud:crear',
    actualizar: 'crud:actualizar',
    eliminar: 'crud:eliminar'
};

/** CRUD reutilizable para un módulo concreto. */
const crud = (modulo) => ({
    listar: () => ipcRenderer.invoke(CANAL.listar, { modulo }),
    crear: (datos) => ipcRenderer.invoke(CANAL.crear, { modulo, datos }),
    actualizar: (id, datos) => ipcRenderer.invoke(CANAL.actualizar, { modulo, id, datos }),
    eliminar: (id) => ipcRenderer.invoke(CANAL.eliminar, { modulo, id })
});

contextBridge.exposeInMainWorld('api', {
    /* ---------- API por módulo ---------- */
    contabilidad: crud('contabilidad'),
    chequera: crud('chequera'),
    clientes: crud('clientes'),

    /* ---------- Alias explícitos (comodidad) ---------- */
    obtenerClientes: () => ipcRenderer.invoke(CANAL.listar, { modulo: 'clientes' }),
    guardarCliente: (datos) => ipcRenderer.invoke(CANAL.crear, { modulo: 'clientes', datos }),
    actualizarCliente: (id, datos) => ipcRenderer.invoke(CANAL.actualizar, { modulo: 'clientes', id, datos }),
    eliminarCliente: (id) => ipcRenderer.invoke(CANAL.eliminar, { modulo: 'clientes', id }),

    /* ---------- Navegación entre vistas ---------- */
    navegarA: (pagina) => ipcRenderer.send('navegar-a', pagina),

    /* ---------- Compatibilidad con las vistas anteriores ---------- */
    // consultarDatos(modulo, {}) -> listar
    consultarDatos: (modulo, accion, payload) => {
        const datos = (accion && typeof accion === 'object') ? accion : payload;
        const esGuardar = typeof accion === 'string' && /crear|guardar|insertar|agregar|registrar/i.test(accion);
        return esGuardar
            ? ipcRenderer.invoke(CANAL.crear, { modulo, datos })
            : ipcRenderer.invoke(CANAL.listar, { modulo });
    },
    // guardarRegistro(modulo, { ...datos }) -> crear
    guardarRegistro: (modulo, accion, payload) => {
        const datos = (accion && typeof accion === 'object') ? accion : payload;
        return ipcRenderer.invoke(CANAL.crear, { modulo, datos });
    }
});
