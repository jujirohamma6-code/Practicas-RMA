const { contextBridge, ipcRenderer } = require('electron');

const api = Object.freeze({
  crearCuentaPorCobrar: (datos) => ipcRenderer.invoke('cxc:crear', datos),
  listarCuentasPorCobrar: () => ipcRenderer.invoke('cxc:listar'),
  actualizarEstadoCuenta: (id, estado) => ipcRenderer.invoke('cxc:actualizar-estado', { id, estado }),
  abonarCuenta: (id, monto) => ipcRenderer.invoke('cxc:abonar', { id, monto })
});

contextBridge.exposeInMainWorld('api', api);
