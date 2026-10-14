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