const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  testConexion: () => ipcRenderer.invoke('db:test-conexion')
});