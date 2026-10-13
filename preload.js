const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    consultarDatos: (modulo, accion, payload) => ipcRenderer.invoke('consultar-datos', { modulo, accion, payload }),
    guardarRegistro: (modulo, accion, payload) => ipcRenderer.invoke('consultar-datos', { modulo, accion, payload }),
    navegarA: (pagina) => ipcRenderer.send('navegar-a', pagina)
});