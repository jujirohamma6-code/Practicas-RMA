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