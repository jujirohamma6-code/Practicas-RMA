const { ipcRenderer } = require('electron');

document.addEventListener('DOMContentLoaded', () => {
    const btnRegresar = document.getElementById('btn-regresar');
    if (btnRegresar) {
        btnRegresar.addEventListener('click', () => {
            ipcRenderer.send('navegar-a', 'monica-gestion.html');
        });
    }
});