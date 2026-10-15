const { contextBridge, ipcRenderer } = require('electron');

const api = Object.freeze({
  crearCuentaPorCobrar: (datos) => ipcRenderer.invoke('cxc:crear', datos),
  listarCuentasPorCobrar: () => ipcRenderer.invoke('cxc:listar'),
  actualizarEstadoCuenta: (id, estado) => ipcRenderer.invoke('cxc:actualizar-estado', { id, estado }),
  abonarCuenta: (id, monto) => ipcRenderer.invoke('cxc:abonar', { id, monto }),

  crearProducto: (datos) => ipcRenderer.invoke('inv:crear', datos),
  listarProductos: () => ipcRenderer.invoke('inv:listar'),
  actualizarProducto: (codigo, datos) => ipcRenderer.invoke('inv:actualizar', { codigo, datos }),
  eliminarProducto: (codigo) => ipcRenderer.invoke('inv:eliminar', codigo),
  seedProductos: (lista) => ipcRenderer.invoke('inv:seed', lista)
});

contextBridge.exposeInMainWorld('api', api);
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

/**
 * Puente seguro entre el renderer y el proceso principal.
 * Expone únicamente las operaciones necesarias del módulo de parámetros.
 */
contextBridge.exposeInMainWorld("api", {
  getVersion: () => ipcRenderer.invoke("app:version"),
  getDbRuta: () => ipcRenderer.invoke("db:ruta"),

  leerParametros: () => ipcRenderer.invoke("parametros:leer"),
  guardarParametros: (parametros) => ipcRenderer.invoke("parametros:guardar", parametros),

  leerContadores: () => ipcRenderer.invoke("contadores:leer"),
  actualizarContador: (clave, valor) =>
    ipcRenderer.invoke("contadores:actualizar", { clave, valor }),

  leerPreferencia: (clave) => ipcRenderer.invoke("preferencias:leer", clave),
  guardarPreferencia: (clave, valor) =>
    ipcRenderer.invoke("preferencias:guardar", { clave, valor })
});
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Estimados
  obtenerEstimados: () => ipcRenderer.invoke('estimados:obtener'),
  guardarEstimado: (datos) => ipcRenderer.invoke('estimados:guardar', datos),
  eliminarEstimado: (id) => ipcRenderer.invoke('estimados:eliminar', id),

  // Facturación
  obtenerFacturas: () => ipcRenderer.invoke('facturas:obtener'),
  guardarFactura: (datos) => ipcRenderer.invoke('facturas:guardar', datos),
  eliminarFactura: (id) => ipcRenderer.invoke('facturas:eliminar', id),

  // Cuentas por Pagar
  obtenerCxP: () => ipcRenderer.invoke('cxp:obtener'),
  guardarCxP: (datos) => ipcRenderer.invoke('cxp:guardar', datos),
  eliminarCxP: (id) => ipcRenderer.invoke('cxp:eliminar', id)
});

