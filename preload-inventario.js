const { contextBridge, ipcRenderer } = require('electron');

const api = Object.freeze({
  crearProducto: (datos) => ipcRenderer.invoke('inv:crear', datos),
  listarProductos: () => ipcRenderer.invoke('inv:listar'),
  actualizarProducto: (codigo, datos) => ipcRenderer.invoke('inv:actualizar', { codigo, datos }),
  eliminarProducto: (codigo) => ipcRenderer.invoke('inv:eliminar', codigo),
  seedProductos: (lista) => ipcRenderer.invoke('inv:seed', lista)
});

contextBridge.exposeInMainWorld('api', api);
