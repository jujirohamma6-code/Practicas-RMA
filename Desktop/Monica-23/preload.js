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
